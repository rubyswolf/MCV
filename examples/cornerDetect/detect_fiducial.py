from __future__ import annotations

import argparse
import math
from pathlib import Path
from typing import Iterable, List, Tuple, TypedDict

import cv2
import numpy as np

Point = Tuple[int, int]


def require_contrib() -> None:
    if not hasattr(cv2, "ximgproc"):
        raise RuntimeError("OpenCV contrib modules are required (missing cv2.ximgproc).")


def order_points_clockwise(points: np.ndarray) -> np.ndarray:
    """Order 4 points as TL, TR, BR, BL (clockwise starting at top-left)."""
    pts = np.asarray(points, dtype=np.float32)
    if pts.shape != (4, 2):
        raise ValueError("Expected exactly 4 points.")

    y_sorted = pts[np.argsort(pts[:, 1])]
    top_two = y_sorted[:2]
    bottom_two = y_sorted[2:]

    tl, tr = top_two[np.argsort(top_two[:, 0])]
    bl, br = bottom_two[np.argsort(bottom_two[:, 0])]
    return np.array([tl, tr, br, bl], dtype=np.float32)


def point_to_line_distance(point: np.ndarray, a: np.ndarray, b: np.ndarray) -> float:
    ab = b - a
    ap = point - a
    denom = float(np.linalg.norm(ab))
    if denom < 1e-8:
        return float("inf")
    cross = abs(float(ab[0] * ap[1] - ab[1] * ap[0]))
    return cross / denom


def line_intersection(a1: np.ndarray, a2: np.ndarray, b1: np.ndarray, b2: np.ndarray) -> np.ndarray | None:
    r = a2 - a1
    s = b2 - b1
    matrix = np.array([[r[0], -s[0]], [r[1], -s[1]]], dtype=np.float64)
    det = float(np.linalg.det(matrix))
    if abs(det) < 1e-8:
        return None
    rhs = (b1 - a1).astype(np.float64)
    t, _ = np.linalg.solve(matrix, rhs)
    return a1 + (r * float(t))


def edge_median(points: np.ndarray) -> float:
    pts = np.asarray(points, dtype=np.float32)
    lengths = [float(np.linalg.norm(pts[(i + 1) % len(pts)] - pts[i])) for i in range(len(pts))]
    if not lengths:
        return 1.0
    return float(np.median(np.array(lengths, dtype=np.float32)))


def contour_to_hexagon(contour: np.ndarray) -> np.ndarray | None:
    perimeter = cv2.arcLength(contour, True)
    for epsilon_scale in (0.003, 0.005, 0.0075, 0.01, 0.015, 0.02, 0.03, 0.04):
        approx = cv2.approxPolyDP(contour, epsilon_scale * perimeter, True)
        if len(approx) == 6:
            pts = approx.reshape(-1, 2).astype(np.float32)
            if cv2.isContourConvex(pts.reshape(-1, 1, 2).astype(np.int32)):
                return pts

    hull = cv2.convexHull(contour)
    hull_perimeter = cv2.arcLength(hull, True)
    for epsilon_scale in (0.003, 0.005, 0.0075, 0.01, 0.015, 0.02, 0.03):
        approx_hull = cv2.approxPolyDP(hull, epsilon_scale * hull_perimeter, True)
        if len(approx_hull) == 6:
            pts = approx_hull.reshape(-1, 2).astype(np.float32)
            if cv2.isContourConvex(pts.reshape(-1, 1, 2).astype(np.int32)):
                return pts
    return None


def score_hexagon(hexagon: np.ndarray, image_shape: tuple[int, int, int]) -> float:
    img_h, img_w = image_shape[:2]
    img_area = float(img_h * img_w)
    contour = hexagon.reshape(-1, 1, 2).astype(np.float32)
    area = float(cv2.contourArea(contour))
    if area < 0.005 * img_area:
        return -1.0

    edges = [float(np.linalg.norm(hexagon[(i + 1) % 6] - hexagon[i])) for i in range(6)]
    min_edge = min(edges)
    max_edge = max(edges)
    if min_edge < 1e-6:
        return -1.0

    regularity = min_edge / max_edge
    return area * (0.65 + 0.35 * regularity)


def extract_cube_hexagon_candidates(scene_bgr: np.ndarray) -> List[np.ndarray]:
    if scene_bgr.ndim != 3 or scene_bgr.shape[2] < 3:
        raise ValueError("Expected a BGR image.")

    gray = cv2.cvtColor(scene_bgr, cv2.COLOR_BGR2GRAY)
    img_h, img_w = gray.shape
    min_dim = min(img_h, img_w)
    morph_k = max(3, int(round(min_dim * 0.006)))
    if morph_k % 2 == 0:
        morph_k += 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (morph_k, morph_k))

    masks: List[np.ndarray] = []

    # Strategy 1: non-zero foreground (works well for transparent/black-bg renders).
    fg_mask = (scene_bgr[:, :, :3].sum(axis=2) > 0).astype(np.uint8) * 255
    masks.append(
        cv2.morphologyEx(
            fg_mask,
            cv2.MORPH_CLOSE,
            cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)),
        )
    )

    # Strategy 2: bright region masks (covers thumbnails with white halo/UI backdrops).
    q90 = float(np.percentile(gray, 90))
    base_thr = int(np.clip(q90, 150, 235))
    for delta in (-20, -10, 0, 10):
        thr = int(np.clip(base_thr + delta, 120, 245))
        _, bright = cv2.threshold(gray, thr, 255, cv2.THRESH_BINARY)
        bright = cv2.morphologyEx(bright, cv2.MORPH_CLOSE, kernel)
        bright = cv2.morphologyEx(bright, cv2.MORPH_OPEN, kernel)
        masks.append(bright)

    # Strategy 3: edge closure fallback (when intensity segmentation is weak).
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 60, 180)
    edge_k = max(3, int(round(min_dim * 0.01)))
    if edge_k % 2 == 0:
        edge_k += 1
    edge_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (edge_k, edge_k))
    closed = cv2.dilate(edges, edge_kernel, iterations=1)
    closed = cv2.morphologyEx(closed, cv2.MORPH_CLOSE, edge_kernel)
    masks.append(closed)

    scored_hexagons: List[tuple[float, np.ndarray]] = []

    for mask in masks:
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue

        contours = sorted(contours, key=cv2.contourArea, reverse=True)[:40]
        for contour in contours:
            if cv2.contourArea(contour) < 0.003 * float(img_h * img_w):
                continue
            hexagon = contour_to_hexagon(contour)
            if hexagon is None:
                continue
            score = score_hexagon(hexagon, scene_bgr.shape)
            if score <= 0:
                continue
            scored_hexagons.append((score, hexagon))

    if not scored_hexagons:
        return []

    scored_hexagons.sort(key=lambda item: item[0], reverse=True)

    # De-duplicate very similar candidates from multiple mask strategies.
    deduped: List[np.ndarray] = []
    seen_centers: List[np.ndarray] = []
    seen_scales: List[float] = []
    for _, hexagon in scored_hexagons:
        center = hexagon.mean(axis=0)
        scale = edge_median(hexagon)
        is_duplicate = False
        for prev_center, prev_scale in zip(seen_centers, seen_scales):
            center_dist = float(np.linalg.norm(center - prev_center))
            scale_delta = abs(scale - prev_scale) / max(prev_scale, 1e-6)
            if center_dist <= 0.08 * max(scale, prev_scale) and scale_delta <= 0.20:
                is_duplicate = True
                break
        if not is_duplicate:
            deduped.append(hexagon)
            seen_centers.append(center)
            seen_scales.append(scale)
        if len(deduped) >= 20:
            break

    return deduped


def label_hexagon_vertices(hex_pts: np.ndarray) -> dict[str, np.ndarray]:
    pts = np.asarray(hex_pts, dtype=np.float32)
    if pts.shape != (6, 2):
        raise ValueError("Expected 6 silhouette vertices.")

    top_idx = int(np.argmin(pts[:, 1]))
    bottom_idx = int(np.argmax(pts[:, 1]))

    top = pts[top_idx]
    bottom = pts[bottom_idx]

    remaining_indices = [i for i in range(6) if i not in (top_idx, bottom_idx)]
    remaining = pts[remaining_indices]

    x_order = np.argsort(remaining[:, 0])
    left_two = remaining[x_order[:2]]
    right_two = remaining[x_order[2:]]

    left_upper = left_two[np.argmin(left_two[:, 1])]
    left_lower = left_two[np.argmax(left_two[:, 1])]
    right_upper = right_two[np.argmin(right_two[:, 1])]
    right_lower = right_two[np.argmax(right_two[:, 1])]

    return {
        "top": top,
        "left_upper": left_upper,
        "left_lower": left_lower,
        "bottom": bottom,
        "right_lower": right_lower,
        "right_upper": right_upper,
    }


def refine_front_top_with_contrib(
    scene_gray: np.ndarray,
    initial_front_top: np.ndarray,
    silhouette_scale: float,
) -> np.ndarray:
    fld = cv2.ximgproc.createFastLineDetector(length_threshold=25, do_merge=True)
    lines = fld.detect(scene_gray)
    if lines is None or len(lines) == 0:
        return initial_front_top

    min_line_length = max(10.0, 0.35 * silhouette_scale)
    best_pos: tuple[float, tuple[np.ndarray, np.ndarray]] | None = None
    best_neg: tuple[float, tuple[np.ndarray, np.ndarray]] | None = None

    for raw_line in lines[:, 0, :]:
        a = np.array([raw_line[0], raw_line[1]], dtype=np.float32)
        b = np.array([raw_line[2], raw_line[3]], dtype=np.float32)
        length = float(np.linalg.norm(b - a))
        if length < min_line_length:
            continue

        angle = math.degrees(math.atan2(float(b[1] - a[1]), float(b[0] - a[0])))
        if angle < -90.0:
            angle += 180.0
        if angle > 90.0:
            angle -= 180.0

        distance = point_to_line_distance(initial_front_top, a, b)

        if 15.0 <= angle <= 45.0:
            if best_pos is None or distance < best_pos[0]:
                best_pos = (distance, (a, b))
        elif -45.0 <= angle <= -15.0:
            if best_neg is None or distance < best_neg[0]:
                best_neg = (distance, (a, b))

    if best_pos is None or best_neg is None:
        return initial_front_top

    intersect = line_intersection(best_pos[1][0], best_pos[1][1], best_neg[1][0], best_neg[1][1])
    if intersect is None:
        return initial_front_top

    if float(np.linalg.norm(intersect - initial_front_top)) <= 0.60 * silhouette_scale:
        return intersect.astype(np.float32)
    return initial_front_top


def rotate_template_variants(template_gray: np.ndarray) -> List[np.ndarray]:
    return [
        template_gray,
        cv2.rotate(template_gray, cv2.ROTATE_90_CLOCKWISE),
        cv2.rotate(template_gray, cv2.ROTATE_180),
        cv2.rotate(template_gray, cv2.ROTATE_90_COUNTERCLOCKWISE),
    ]


def face_match_score(face_patch: np.ndarray, template_variants: Iterable[np.ndarray]) -> float:
    best = -1.0
    face_eq = cv2.equalizeHist(face_patch)
    for variant in template_variants:
        raw = float(cv2.matchTemplate(face_patch, variant, cv2.TM_CCOEFF_NORMED)[0, 0])
        var_eq = cv2.equalizeHist(variant)
        eq = float(cv2.matchTemplate(face_eq, var_eq, cv2.TM_CCOEFF_NORMED)[0, 0])
        best = max(best, raw, eq)
    return best


def detect_faces(template_gray: np.ndarray, scene_bgr: np.ndarray) -> List[np.ndarray]:
    scene_gray = cv2.cvtColor(scene_bgr, cv2.COLOR_BGR2GRAY)

    h_t, w_t = template_gray.shape[:2]
    dst_square = np.array([[0, 0], [w_t - 1, 0], [w_t - 1, h_t - 1], [0, h_t - 1]], dtype=np.float32)
    template_variants = rotate_template_variants(template_gray)

    hexagon_candidates = extract_cube_hexagon_candidates(scene_bgr)
    if not hexagon_candidates:
        raise RuntimeError("Could not extract a 6-point cube silhouette.")

    best_faces: List[np.ndarray] = []
    best_scores: List[float] = []
    best_metric = -1.0
    image_area = float(scene_bgr.shape[0] * scene_bgr.shape[1])

    for hexagon in hexagon_candidates:
        labels = label_hexagon_vertices(hexagon)

        vertical_left = labels["left_lower"] - labels["left_upper"]
        vertical_right = labels["right_lower"] - labels["right_upper"]
        vertical_avg = (vertical_left + vertical_right) * 0.5
        silhouette_scale = edge_median(hexagon)

        initial_front_top = labels["bottom"] - vertical_avg
        front_top = refine_front_top_with_contrib(scene_gray, initial_front_top, silhouette_scale)

        candidate_faces = [
            np.array([labels["left_upper"], labels["top"], labels["right_upper"], front_top], dtype=np.float32),
            np.array([labels["left_upper"], front_top, labels["bottom"], labels["left_lower"]], dtype=np.float32),
            np.array([front_top, labels["right_upper"], labels["right_lower"], labels["bottom"]], dtype=np.float32),
        ]

        scores: List[float] = []
        for quad in candidate_faces:
            transform = cv2.getPerspectiveTransform(quad, dst_square)
            patch = cv2.warpPerspective(scene_gray, transform, (w_t, h_t), flags=cv2.INTER_LINEAR)
            scores.append(face_match_score(patch, template_variants))

        # Prefer candidates where all faces are template-consistent, with a scale-relative size prior.
        base_metric = float(np.mean(scores) + 0.8 * np.min(np.array(scores, dtype=np.float32)))
        area = float(cv2.contourArea(hexagon.reshape(-1, 1, 2).astype(np.float32)))
        area_ratio = max(area / max(image_area, 1.0), 1e-6)
        size_weight = 1.0 + 0.75 * math.log1p(80.0 * area_ratio)
        metric = base_metric * size_weight
        if metric > best_metric:
            best_metric = metric
            best_faces = [order_points_clockwise(quad) for quad in candidate_faces]
            best_scores = scores

    if not best_faces:
        return []

    max_score = float(max(best_scores))
    mean_score = float(np.mean(np.array(best_scores, dtype=np.float32)))
    min_score = float(min(best_scores))

    # Dynamic acceptance tuned for scale/compression variation:
    # - reject weak overall candidates,
    # - keep all faces when candidate is coherent,
    # - otherwise keep only stronger faces.
    if max_score < 0.30 and mean_score < 0.22:
        return []
    if mean_score >= 0.22 and min_score >= 0.14:
        return best_faces

    detections: List[np.ndarray] = []
    for quad, score in zip(best_faces, best_scores):
        if score >= 0.24:
            detections.append(quad)

    return detections


def as_int_points(quad: np.ndarray) -> List[Point]:
    return [(int(round(x)), int(round(y))) for x, y in quad.tolist()]


class PointSample(TypedDict):
    pt: np.ndarray
    face: int
    vidx: int


class EdgeSample(TypedDict):
    endpoint: np.ndarray
    corner: np.ndarray
    face: int
    edge_label: str


def infer_detection_scale(detections: List[np.ndarray]) -> float:
    edge_lengths: List[float] = []
    for quad in detections:
        for i in range(4):
            a = quad[i]
            b = quad[(i + 1) % 4]
            edge_lengths.append(float(np.linalg.norm(b - a)))
    if not edge_lengths:
        return 1.0
    return float(np.median(np.array(edge_lengths, dtype=np.float32)))


def cluster_samples(samples: List[PointSample], tolerance: float) -> List[dict[str, object]]:
    clusters: List[dict[str, object]] = []
    for sample in samples:
        pt = sample["pt"]
        best_idx = -1
        best_dist = float("inf")
        for idx, cluster in enumerate(clusters):
            center = np.asarray(cluster["center"], dtype=np.float32)
            distance = float(np.linalg.norm(pt - center))
            if distance < best_dist:
                best_dist = distance
                best_idx = idx

        if best_idx >= 0 and best_dist <= tolerance:
            target_cluster = clusters[best_idx]
            members = target_cluster["members"]
            if isinstance(members, list):
                members.append(sample)
                pts = np.array([m["pt"] for m in members], dtype=np.float32)
                target_cluster["center"] = pts.mean(axis=0)
        else:
            clusters.append({"center": pt.copy(), "members": [sample]})

    return clusters


def cluster_edge_samples(samples: List[EdgeSample], tolerance: float) -> List[dict[str, object]]:
    clusters: List[dict[str, object]] = []
    for sample in samples:
        pt = sample["endpoint"]
        best_idx = -1
        best_dist = float("inf")
        for idx, cluster in enumerate(clusters):
            center = np.asarray(cluster["center"], dtype=np.float32)
            distance = float(np.linalg.norm(pt - center))
            if distance < best_dist:
                best_dist = distance
                best_idx = idx

        if best_idx >= 0 and best_dist <= tolerance:
            target_cluster = clusters[best_idx]
            members = target_cluster["members"]
            if isinstance(members, list):
                members.append(sample)
                pts = np.array([m["endpoint"] for m in members], dtype=np.float32)
                target_cluster["center"] = pts.mean(axis=0)
        else:
            clusters.append({"center": pt.copy(), "members": [sample]})

    return clusters


def fit_line_from_points(points: np.ndarray) -> tuple[np.ndarray, np.ndarray] | None:
    if points.shape[0] < 2:
        return None
    line = cv2.fitLine(points.astype(np.float32), cv2.DIST_L2, 0, 0.01, 0.01)
    vx, vy, x0, y0 = [float(v) for v in line.ravel().tolist()]
    direction = np.array([vx, vy], dtype=np.float64)
    norm = float(np.linalg.norm(direction))
    if norm < 1e-8:
        return None
    direction /= norm
    point = np.array([x0, y0], dtype=np.float64)
    return point, direction


def normalize_line_angle_degrees(a: np.ndarray, b: np.ndarray) -> float:
    angle = math.degrees(math.atan2(float(b[1] - a[1]), float(b[0] - a[0])))
    if angle < -90.0:
        angle += 180.0
    if angle > 90.0:
        angle -= 180.0
    return angle


def intersect_lines_parametric(a1: np.ndarray, a2: np.ndarray, b1: np.ndarray, b2: np.ndarray) -> np.ndarray | None:
    matrix = np.array(
        [
            [float(a2[0] - a1[0]), float(b1[0] - b2[0])],
            [float(a2[1] - a1[1]), float(b1[1] - b2[1])],
        ],
        dtype=np.float64,
    )
    det = float(np.linalg.det(matrix))
    if abs(det) < 1e-8:
        return None
    rhs = np.array([float(b1[0] - a1[0]), float(b1[1] - a1[1])], dtype=np.float64)
    t, _ = np.linalg.solve(matrix, rhs)
    return a1.astype(np.float64) + (a2.astype(np.float64) - a1.astype(np.float64)) * float(t)


def refine_corner_with_contrib_lines(
    scene_gray: np.ndarray,
    detections: List[np.ndarray],
    coarse_corner: np.ndarray,
) -> np.ndarray:
    if len(detections) < 2:
        return coarse_corner

    if not hasattr(cv2, "ximgproc"):
        return coarse_corner

    scale = infer_detection_scale(detections)
    min_line_length = max(12.0, 0.30 * scale)

    left_anchor = None
    right_anchor = None
    coarse_y = float(coarse_corner[1])

    top_neighbor_candidates: List[np.ndarray] = []
    for quad in detections:
        dists = [float(np.linalg.norm(pt.astype(np.float64) - coarse_corner.astype(np.float64))) for pt in quad]
        corner_idx = int(np.argmin(np.array(dists, dtype=np.float64)))
        prev_idx = (corner_idx - 1) % 4
        next_idx = (corner_idx + 1) % 4
        top_neighbor_candidates.append(quad[prev_idx].astype(np.float64))
        top_neighbor_candidates.append(quad[next_idx].astype(np.float64))

    top_neighbors = [
        point for point in top_neighbor_candidates if float(point[1]) <= coarse_y + 0.20 * scale
    ]
    if len(top_neighbors) < 2:
        return coarse_corner

    left_anchor = min(top_neighbors, key=lambda point: float(point[0]))
    right_anchor = max(top_neighbors, key=lambda point: float(point[0]))

    if left_anchor is None or right_anchor is None:
        return coarse_corner

    expected_center_x = 0.5 * float(left_anchor[0] + right_anchor[0])

    fld = cv2.ximgproc.createFastLineDetector(length_threshold=25, do_merge=True)
    lines = fld.detect(scene_gray)
    if lines is None or len(lines) == 0:
        return coarse_corner

    vertical_candidate = None
    for raw_line in lines[:, 0, :]:
        a = np.array([raw_line[0], raw_line[1]], dtype=np.float64)
        b = np.array([raw_line[2], raw_line[3]], dtype=np.float64)
        length = float(np.linalg.norm(b - a))
        if length < min_line_length:
            continue
        min_y = float(min(a[1], b[1]))
        max_y = float(max(a[1], b[1]))
        if min_y > coarse_y + 0.20 * scale:
            continue
        if max_y < coarse_y - 0.20 * scale:
            continue
        angle = normalize_line_angle_degrees(a, b)
        if abs(abs(angle) - 90.0) > 12.0:
            continue
        x_mid = 0.5 * float(a[0] + b[0])
        y_mid = 0.5 * float(a[1] + b[1])
        score = abs(x_mid - expected_center_x) + 0.02 * abs(y_mid - coarse_y)
        if vertical_candidate is None or score < vertical_candidate[0]:
            vertical_candidate = (score, a, b, x_mid)

    if vertical_candidate is None:
        return coarse_corner

    _, vert_a, vert_b, vert_x = vertical_candidate

    positive_candidate = None
    for raw_line in lines[:, 0, :]:
        a = np.array([raw_line[0], raw_line[1]], dtype=np.float64)
        b = np.array([raw_line[2], raw_line[3]], dtype=np.float64)
        if a[0] > b[0]:
            a, b = b, a
        length = float(np.linalg.norm(b - a))
        if length < min_line_length:
            continue
        angle = normalize_line_angle_degrees(a, b)
        if not (15.0 <= angle <= 45.0):
            continue
        if point_to_line_distance(left_anchor.astype(np.float32), a.astype(np.float32), b.astype(np.float32)) > 0.12 * scale:
            continue

        inter = intersect_lines_parametric(a, b, vert_a, vert_b)
        if inter is None:
            continue
        if inter[1] < -0.2 * scale or inter[1] > scene_gray.shape[0] + 0.2 * scale:
            continue

        score = 1.5 * abs(float(inter[1]) - coarse_y) + 2.0 * abs(float(inter[0]) - vert_x)
        score += 0.02 * abs(length - scale)
        if positive_candidate is None or score < positive_candidate[0]:
            positive_candidate = (score, inter)

    if positive_candidate is None:
        return coarse_corner

    refined = positive_candidate[1]
    if float(np.linalg.norm(refined - coarse_corner.astype(np.float64))) > 0.15 * scale:
        return coarse_corner

    coarse_center_error = abs(float(coarse_corner[0]) - expected_center_x)
    refined_center_error = abs(float(refined[0]) - expected_center_x)
    if refined_center_error > coarse_center_error + 0.02 * scale:
        return coarse_corner

    return refined.astype(np.float64)


def least_squares_intersection(lines: List[tuple[np.ndarray, np.ndarray]]) -> np.ndarray | None:
    if len(lines) < 2:
        return None

    a_rows = []
    b_rows = []
    for point, direction in lines:
        normal = np.array([-direction[1], direction[0]], dtype=np.float64)
        a_rows.append(normal)
        b_rows.append(float(np.dot(normal, point)))

    a = np.array(a_rows, dtype=np.float64)
    b = np.array(b_rows, dtype=np.float64)
    if np.linalg.matrix_rank(a) < 2:
        return None

    solution, *_ = np.linalg.lstsq(a, b, rcond=None)
    return solution.astype(np.float64)


def estimate_corner_from_faces(detections: List[np.ndarray]) -> np.ndarray | None:
    if len(detections) < 3:
        return None

    faces = detections[:3]
    scale = infer_detection_scale(faces)

    # All tolerances are relative to inferred face scale.
    tol_vertex = 0.07 * scale
    tol_endpoint = 0.09 * scale
    tol_residual = 0.03 * scale
    tol_seed = 0.12 * scale

    vertex_samples: List[PointSample] = []
    for fidx, quad in enumerate(faces):
        for vidx, pt in enumerate(quad):
            vertex_samples.append({"pt": pt.astype(np.float32), "face": fidx, "vidx": vidx})

    vertex_clusters = cluster_samples(vertex_samples, tol_vertex)
    if not vertex_clusters:
        return None

    # Candidate corner: vertex cluster supported by all three faces with best compactness.
    corner_cluster = None
    for cluster in vertex_clusters:
        members = cluster["members"]
        if not isinstance(members, list):
            continue
        face_set = {int(member["face"]) for member in members}
        if len(face_set) != 3:
            continue
        center = np.asarray(cluster["center"], dtype=np.float32)
        mean_dist = float(
            np.mean([np.linalg.norm(np.asarray(member["pt"], dtype=np.float32) - center) for member in members])
        )
        score = (len(members), -mean_dist)
        if corner_cluster is None or score > corner_cluster[0]:
            corner_cluster = (score, cluster)

    if corner_cluster is None:
        return None

    corner_seed = np.asarray(corner_cluster[1]["center"], dtype=np.float32)

    closest_corner_vertices: dict[int, tuple[int, np.ndarray]] = {}
    for fidx, quad in enumerate(faces):
        dists = [float(np.linalg.norm(pt - corner_seed)) for pt in quad]
        best_vidx = int(np.argmin(np.array(dists, dtype=np.float32)))
        if dists[best_vidx] > tol_vertex:
            return None
        closest_corner_vertices[fidx] = (best_vidx, quad[best_vidx].astype(np.float32))

    edge_samples: List[EdgeSample] = []
    for fidx, quad in enumerate(faces):
        corner_vidx, corner_pt = closest_corner_vertices[fidx]
        prev_idx = (corner_vidx - 1) % 4
        next_idx = (corner_vidx + 1) % 4

        edge_samples.append(
            {
                "endpoint": quad[prev_idx].astype(np.float32),
                "corner": corner_pt,
                "face": fidx,
                "edge_label": "prev",
            }
        )
        edge_samples.append(
            {
                "endpoint": quad[next_idx].astype(np.float32),
                "corner": corner_pt,
                "face": fidx,
                "edge_label": "next",
            }
        )

    endpoint_clusters = cluster_edge_samples(edge_samples, tol_endpoint)
    if len(endpoint_clusters) != 3:
        return None

    # Correct trihedral pattern: three shared corner-incident edges, each seen by exactly two faces.
    for cluster in endpoint_clusters:
        members = cluster["members"]
        if not isinstance(members, list) or len(members) != 2:
            return None
        faces_in_cluster = {int(member["face"]) for member in members}
        if len(faces_in_cluster) != 2:
            return None

    lines: List[tuple[np.ndarray, np.ndarray]] = []
    for cluster in endpoint_clusters:
        members = cluster["members"]
        if not isinstance(members, list):
            continue
        line_points: List[np.ndarray] = []
        for member in members:
            line_points.append(np.asarray(member["corner"], dtype=np.float32))
            line_points.append(np.asarray(member["endpoint"], dtype=np.float32))
        line_fit = fit_line_from_points(np.array(line_points, dtype=np.float32))
        if line_fit is None:
            return None
        lines.append(line_fit)

    if len(lines) != 3:
        return None

    corner = least_squares_intersection(lines)
    if corner is None:
        return None

    # Consistency checks: intersection must stay close to local support and line residuals.
    if float(np.linalg.norm(corner - corner_seed.astype(np.float64))) > tol_seed:
        return None

    residuals: List[float] = []
    for point, direction in lines:
        normal = np.array([-direction[1], direction[0]], dtype=np.float64)
        residuals.append(abs(float(np.dot(normal, corner - point))))
    if float(np.mean(np.array(residuals, dtype=np.float64))) > tol_residual:
        return None

    return corner.astype(np.float64)


def write_overlay(output_path: Path, scene_shape: tuple[int, int, int], detections: List[np.ndarray]) -> None:
    overlay = np.zeros((scene_shape[0], scene_shape[1], 4), dtype=np.uint8)
    rng = np.random.default_rng()

    for quad in detections:
        quad_int = np.round(quad).astype(np.int32).reshape(-1, 1, 2)
        b, g, r = [int(v) for v in rng.integers(0, 256, size=3)]
        cv2.polylines(
            overlay,
            [quad_int],
            isClosed=True,
            color=(b, g, r, 220),
            thickness=3,
            lineType=cv2.LINE_AA,
        )

    cv2.imwrite(str(output_path), overlay)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Find repeated appearances of texture.png in cube.png and output transparent quadrilateral overlay."
        )
    )
    parser.add_argument("--template", type=Path, default=Path("polished_andesite.png"))
    parser.add_argument("--scene", type=Path, default=Path("cube.png"))
    parser.add_argument("--output", type=Path, default=Path("detection.png"))
    args = parser.parse_args()

    require_contrib()

    base = Path(__file__).resolve().parent
    template_path = args.template if args.template.is_absolute() else (base / args.template)
    scene_path = args.scene if args.scene.is_absolute() else (base / args.scene)
    output_path = args.output if args.output.is_absolute() else (base / args.output)

    template_gray = cv2.imread(str(template_path), cv2.IMREAD_GRAYSCALE)
    scene_bgr = cv2.imread(str(scene_path), cv2.IMREAD_COLOR)

    if template_gray is None:
        raise FileNotFoundError(f"Failed to load template image: {template_path}")
    if scene_bgr is None:
        raise FileNotFoundError(f"Failed to load scene image: {scene_path}")

    detections = detect_faces(template_gray, scene_bgr)

    if detections:
        for i, quad in enumerate(detections, start=1):
            print(f"Detection {i}: {as_int_points(quad)}")
    else:
        print("No detections found.")

    corner = estimate_corner_from_faces(detections)
    if corner is not None:
        scene_gray = cv2.cvtColor(scene_bgr, cv2.COLOR_BGR2GRAY)
        corner = refine_corner_with_contrib_lines(scene_gray, detections, corner)
        print(f"Corner: ({corner[0]:.3f}, {corner[1]:.3f})")
    else:
        print("Corner: not found (faces did not form a scale-consistent trihedral corner).")

    write_overlay(output_path, scene_bgr.shape, detections)


if __name__ == "__main__":
    main()
