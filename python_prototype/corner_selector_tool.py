from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List

import cv2
import numpy as np


@dataclass
class LineCandidate:
    a: np.ndarray
    b: np.ndarray
    length: float
    angle: float
    near_endpoint: np.ndarray
    endpoint_dist: float
    score: float


@dataclass
class PendingSelection:
    click: np.ndarray
    mode: int
    lines: List[LineCandidate]


CHANNEL_MODE_LABELS = {
    "g": "gray",
    "a": "avg",
    "z": "red",
    "x": "green",
    "c": "blue",
    "s": "red-green",
    "d": "blue-yellow",
    "f": "saturation",
}


def normalize_angle_degrees(angle: float) -> float:
    while angle <= -90.0:
        angle += 180.0
    while angle > 90.0:
        angle -= 180.0
    return angle


def angle_diff_degrees(a: float, b: float) -> float:
    diff = abs(a - b)
    return min(diff, 180.0 - diff)


def point_to_segment_distance(point: np.ndarray, a: np.ndarray, b: np.ndarray) -> float:
    ab = b - a
    denom = float(np.dot(ab, ab))
    if denom < 1e-10:
        return float(np.linalg.norm(point - a))
    t = float(np.dot(point - a, ab) / denom)
    t = max(0.0, min(1.0, t))
    proj = a + t * ab
    return float(np.linalg.norm(point - proj))


def point_to_line_distance(point: np.ndarray, a: np.ndarray, b: np.ndarray) -> float:
    ab = b - a
    denom = float(np.linalg.norm(ab))
    if denom < 1e-10:
        return float("inf")
    cross = abs(float(ab[0] * (point[1] - a[1]) - ab[1] * (point[0] - a[0])))
    return cross / denom


def project_point_to_line(point: np.ndarray, a: np.ndarray, b: np.ndarray) -> np.ndarray:
    ab = b.astype(np.float64) - a.astype(np.float64)
    denom = float(np.dot(ab, ab))
    if denom < 1e-10:
        return a.astype(np.float64).copy()
    t = float(np.dot(point.astype(np.float64) - a.astype(np.float64), ab) / denom)
    return a.astype(np.float64) + t * ab


def intersect_two_lines(a1: np.ndarray, a2: np.ndarray, b1: np.ndarray, b2: np.ndarray) -> np.ndarray | None:
    matrix = np.array(
        [[a2[0] - a1[0], b1[0] - b2[0]], [a2[1] - a1[1], b1[1] - b2[1]]],
        dtype=np.float64,
    )
    det = float(np.linalg.det(matrix))
    if abs(det) < 1e-10:
        return None
    rhs = np.array([b1[0] - a1[0], b1[1] - a1[1]], dtype=np.float64)
    t, _ = np.linalg.solve(matrix, rhs)
    return a1.astype(np.float64) + (a2.astype(np.float64) - a1.astype(np.float64)) * float(t)


def least_squares_intersection(lines: List[LineCandidate]) -> np.ndarray | None:
    if len(lines) < 2:
        return None

    a_rows = []
    b_rows = []
    for line in lines:
        direction = line.b.astype(np.float64) - line.a.astype(np.float64)
        norm = float(np.linalg.norm(direction))
        if norm < 1e-10:
            continue
        direction /= norm
        normal = np.array([-direction[1], direction[0]], dtype=np.float64)
        a_rows.append(normal)
        b_rows.append(float(np.dot(normal, line.a.astype(np.float64))))

    if len(a_rows) < 2:
        return None

    a_mat = np.array(a_rows, dtype=np.float64)
    b_vec = np.array(b_rows, dtype=np.float64)
    if np.linalg.matrix_rank(a_mat) < 2:
        return None

    solution, *_ = np.linalg.lstsq(a_mat, b_vec, rcond=None)
    return solution.astype(np.float64)


def refine_subpixel(gray: np.ndarray, point: np.ndarray, max_shift: float = 20.0) -> np.ndarray:
    p = np.array([[float(point[0]), float(point[1])]], dtype=np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 80, 1e-3)
    cv2.cornerSubPix(gray, p, (9, 9), (-1, -1), criteria)
    refined = p[0].astype(np.float64)
    if float(np.linalg.norm(refined - point.astype(np.float64))) > max_shift:
        return point.astype(np.float64)
    return refined


def normalize_to_u8(image: np.ndarray) -> np.ndarray:
    out = np.zeros_like(image, dtype=np.float32)
    cv2.normalize(image, out, 0, 255, cv2.NORM_MINMAX)
    return out.astype(np.uint8)


def channel_from_mode(image_bgr: np.ndarray, mode: str) -> np.ndarray:
    b, g, r = cv2.split(image_bgr)

    if mode == "a":
        avg = (r.astype(np.float32) + g.astype(np.float32) + b.astype(np.float32)) / 3.0
        return np.clip(avg, 0, 255).astype(np.uint8)
    if mode == "z":
        return r
    if mode == "x":
        return g
    if mode == "c":
        return b
    if mode == "s":
        return normalize_to_u8(np.abs(r.astype(np.float32) - g.astype(np.float32)))
    if mode == "d":
        by = (0.5 * (r.astype(np.float32) + g.astype(np.float32))) - b.astype(np.float32)
        return normalize_to_u8(np.abs(by))
    if mode == "f":
        hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
        return hsv[:, :, 1]

    # Default regular grayscale.
    return cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)


def fuse_line_segments(raw_lines: np.ndarray, image_shape: tuple[int, int]) -> np.ndarray:
    if raw_lines is None or len(raw_lines) == 0:
        return np.empty((0, 1, 4), dtype=np.float32)

    h, w = image_shape
    min_dim = float(min(h, w))
    endpoint_thresh = float(np.clip(0.030 * min_dim, 3.0, 18.0))
    angle_thresh = 8.0
    collinear_thresh = float(np.clip(0.020 * min_dim, 2.0, 10.0))
    min_seg_len = 2.0

    segments: List[tuple[np.ndarray, np.ndarray]] = []
    for seg in raw_lines[:, 0, :]:
        a = np.array([float(seg[0]), float(seg[1])], dtype=np.float64)
        b = np.array([float(seg[2]), float(seg[3])], dtype=np.float64)
        if float(np.linalg.norm(b - a)) >= min_seg_len:
            segments.append((a, b))

    def segment_angle(seg: tuple[np.ndarray, np.ndarray]) -> float:
        a, b = seg
        return normalize_angle_degrees(float(np.degrees(np.arctan2(b[1] - a[1], b[0] - a[0]))))

    def try_fuse(
        seg1: tuple[np.ndarray, np.ndarray],
        seg2: tuple[np.ndarray, np.ndarray],
    ) -> tuple[bool, tuple[np.ndarray, np.ndarray] | None, float]:
        a1, b1 = seg1
        a2, b2 = seg2
        angle1 = segment_angle(seg1)
        angle2 = segment_angle(seg2)
        if angle_diff_degrees(angle1, angle2) > angle_thresh:
            return False, None, float("inf")

        endpoint_pairs = [
            (a1, a2),
            (a1, b2),
            (b1, a2),
            (b1, b2),
        ]
        closest = min(endpoint_pairs, key=lambda pair: float(np.linalg.norm(pair[0] - pair[1])))
        close_dist = float(np.linalg.norm(closest[0] - closest[1]))
        if close_dist > endpoint_thresh:
            return False, None, close_dist

        # Prevent fusing adjacent but distinct parallels: endpoints must be near the opposite segment line.
        if point_to_line_distance(closest[0], a2, b2) > collinear_thresh:
            return False, None, close_dist
        if point_to_line_distance(closest[1], a1, b1) > collinear_thresh:
            return False, None, close_dist

        # Merge by taking the two farthest endpoints among both segments.
        endpoints = [a1, b1, a2, b2]
        best_i, best_j = 0, 1
        best_d = float(np.linalg.norm(endpoints[0] - endpoints[1]))
        for i in range(4):
            for j in range(i + 1, 4):
                d = float(np.linalg.norm(endpoints[i] - endpoints[j]))
                if d > best_d:
                    best_d = d
                    best_i, best_j = i, j

        merged = (endpoints[best_i].copy(), endpoints[best_j].copy())
        if float(np.linalg.norm(merged[1] - merged[0])) < min_seg_len:
            return False, None, close_dist

        return True, merged, close_dist

    changed = True
    while changed and len(segments) >= 2:
        changed = False
        best_merge: tuple[int, int, tuple[np.ndarray, np.ndarray], float] | None = None

        for i in range(len(segments)):
            for j in range(i + 1, len(segments)):
                ok, merged, close_dist = try_fuse(segments[i], segments[j])
                if not ok or merged is None:
                    continue
                if best_merge is None or close_dist < best_merge[3]:
                    best_merge = (i, j, merged, close_dist)

        if best_merge is not None:
            i, j, merged_seg, _ = best_merge
            new_segments: List[tuple[np.ndarray, np.ndarray]] = []
            for idx, seg in enumerate(segments):
                if idx not in (i, j):
                    new_segments.append(seg)
            new_segments.append(merged_seg)
            segments = new_segments
            changed = True

    fused = np.zeros((len(segments), 1, 4), dtype=np.float32)
    for i, (a, b) in enumerate(segments):
        fused[i, 0, 0] = float(a[0])
        fused[i, 0, 1] = float(a[1])
        fused[i, 0, 2] = float(b[0])
        fused[i, 0, 3] = float(b[1])
    return fused


def build_line_candidates(
    raw_lines: np.ndarray,
    click: np.ndarray,
    image_shape: tuple[int, int],
    needed_count: int,
) -> List[LineCandidate]:
    h, w = image_shape
    max_dist = 0.32 * float(max(h, w))
    min_len = max(10.0, 0.035 * float(min(h, w)))

    # Tight endpoint gating; fallback is only slightly relaxed.
    primary_endpoint_dist = float(np.clip(0.020 * float(min(h, w)), 5.0, 12.0))
    secondary_endpoint_dist = float(np.clip(0.035 * float(min(h, w)), 8.0, 20.0))

    def collect(max_endpoint_dist: float) -> List[LineCandidate]:
        out: List[LineCandidate] = []
        for raw in raw_lines[:, 0, :]:
            a = np.array([float(raw[0]), float(raw[1])], dtype=np.float64)
            b = np.array([float(raw[2]), float(raw[3])], dtype=np.float64)
            length = float(np.linalg.norm(b - a))
            if length < min_len:
                continue

            dist_a = float(np.linalg.norm(click - a))
            dist_b = float(np.linalg.norm(click - b))
            if dist_a <= dist_b:
                near_endpoint = a
                endpoint_dist = dist_a
            else:
                near_endpoint = b
                endpoint_dist = dist_b

            # Hard requirement: one endpoint must be near the click.
            if endpoint_dist > max_endpoint_dist:
                continue

            dist_seg = point_to_segment_distance(click, a, b)
            if dist_seg > max_dist:
                continue

            dist_line = point_to_line_distance(click, a, b)
            angle = normalize_angle_degrees(np.degrees(np.arctan2(b[1] - a[1], b[0] - a[0])))

            score = (0.8 * length) / (1.0 + 3.2 * endpoint_dist + 0.5 * dist_seg + 0.2 * dist_line)
            out.append(
                LineCandidate(
                    a=a,
                    b=b,
                    length=length,
                    angle=angle,
                    near_endpoint=near_endpoint.copy(),
                    endpoint_dist=endpoint_dist,
                    score=score,
                )
            )

        out.sort(key=lambda c: c.score, reverse=True)
        return out

    primary = collect(primary_endpoint_dist)
    if len(primary) >= needed_count:
        return primary

    secondary = collect(secondary_endpoint_dist)
    return secondary if len(secondary) > len(primary) else primary


def select_diverse_lines(
    candidates: List[LineCandidate],
    count: int,
    image_shape: tuple[int, int],
) -> List[LineCandidate]:
    if count <= 0:
        return []

    min_sep = 18.0 if count >= 3 else 12.0
    h, w = image_shape
    cluster_radius = float(np.clip(0.025 * float(min(h, w)), 6.0, 16.0))

    best: List[LineCandidate] = []
    best_score = -1.0
    seed_limit = min(12, len(candidates))

    for seed_idx in range(seed_limit):
        seed = candidates[seed_idx]
        trial: List[LineCandidate] = [seed]
        center = seed.near_endpoint.copy()

        for cand in candidates:
            if any(existing is cand for existing in trial):
                continue
            if any(angle_diff_degrees(cand.angle, s.angle) < min_sep for s in trial):
                continue
            if float(np.linalg.norm(cand.near_endpoint - center)) > cluster_radius:
                continue

            trial.append(cand)
            pts = np.array([line.near_endpoint for line in trial], dtype=np.float64)
            center = pts.mean(axis=0)
            if len(trial) == count:
                break

        trial_score = float(sum(line.score for line in trial))
        if len(trial) > len(best) or (len(trial) == len(best) and trial_score > best_score):
            best = trial
            best_score = trial_score
        if len(best) == count:
            break

    return best


def estimate_corner_from_selection(selection: PendingSelection) -> np.ndarray | None:
    if len(selection.lines) == 0:
        return None

    if len(selection.lines) == 1:
        line = selection.lines[0]
        return project_point_to_line(selection.click, line.a, line.b)

    # Always use exact 2-line intersection when exactly two lines are selected.
    if len(selection.lines) == 2 or selection.mode == 2:
        return intersect_two_lines(
            selection.lines[0].a,
            selection.lines[0].b,
            selection.lines[1].a,
            selection.lines[1].b,
        )

    return least_squares_intersection(selection.lines)


def clamp_rect_to_image(
    x0: int,
    y0: int,
    x1: int,
    y1: int,
    shape: tuple[int, int, int],
    min_size: int = 20,
) -> tuple[int, int, int, int] | None:
    h, w = shape[:2]
    xa = int(max(0, min(x0, x1)))
    xb = int(min(w - 1, max(x0, x1)))
    ya = int(max(0, min(y0, y1)))
    yb = int(min(h - 1, max(y0, y1)))
    if xb - xa + 1 < min_size or yb - ya + 1 < min_size:
        return None
    return xa, ya, xb + 1, yb + 1


def compute_roi_scale(full_shape: tuple[int, int, int], roi: tuple[int, int, int, int]) -> float:
    full_h, full_w = full_shape[:2]
    x0, y0, x1, y1 = roi
    roi_w = max(1, x1 - x0)
    roi_h = max(1, y1 - y0)

    target_long = float(max(full_w, full_h))
    roi_long = float(max(roi_w, roi_h))
    scale = target_long / max(roi_long, 1.0)
    return float(np.clip(scale, 1.0, 6.0))


def full_to_roi_display(
    point: np.ndarray,
    roi: tuple[int, int, int, int],
    render: dict[str, float],
) -> tuple[int, int]:
    x0, y0, _, _ = roi
    scale = float(render["scale"])
    pad_x = int(render["pad_x"])
    pad_y = int(render["pad_y"])
    dx = int(round(pad_x + (float(point[0]) - x0) * scale))
    dy = int(round(pad_y + (float(point[1]) - y0) * scale))
    return dx, dy


def roi_display_to_full(
    x: int,
    y: int,
    roi: tuple[int, int, int, int],
    render: dict[str, float],
) -> tuple[int, int]:
    x0, y0, x1, y1 = roi
    scale = float(render["scale"])
    pad_x = int(render["pad_x"])
    pad_y = int(render["pad_y"])
    local_x = x - pad_x
    local_y = y - pad_y
    fx = int(round(x0 + (local_x / max(scale, 1e-6))))
    fy = int(round(y0 + (local_y / max(scale, 1e-6))))
    fx = max(x0, min(x1 - 1, fx))
    fy = max(y0, min(y1 - 1, fy))
    return fx, fy


def in_roi_display_bounds(x: int, y: int, render: dict[str, float]) -> bool:
    pad_x = int(render["pad_x"])
    pad_y = int(render["pad_y"])
    disp_w = int(render["disp_w"])
    disp_h = int(render["disp_h"])
    return pad_x <= x < pad_x + disp_w and pad_y <= y < pad_y + disp_h


def make_roi_render(roi: tuple[int, int, int, int], roi_scale: float) -> dict[str, float]:
    x0, y0, x1, y1 = roi
    roi_w = max(1, x1 - x0)
    roi_h = max(1, y1 - y0)

    disp_w = max(1, int(round(roi_w * roi_scale)))
    disp_h = max(1, int(round(roi_h * roi_scale)))
    side = max(disp_w, disp_h)

    pad_x = (side - disp_w) // 2
    pad_y = (side - disp_h) // 2

    return {
        "scale": float(roi_scale),
        "disp_w": float(disp_w),
        "disp_h": float(disp_h),
        "side": float(side),
        "pad_x": float(pad_x),
        "pad_y": float(pad_y),
    }


def point_in_roi(point: np.ndarray, roi: tuple[int, int, int, int]) -> bool:
    x0, y0, x1, y1 = roi
    return x0 <= float(point[0]) < x1 and y0 <= float(point[1]) < y1


def line_endpoint_away_from_point(line: LineCandidate, point: np.ndarray) -> np.ndarray:
    dist_a = float(np.linalg.norm(line.a.astype(np.float64) - point.astype(np.float64)))
    dist_b = float(np.linalg.norm(line.b.astype(np.float64) - point.astype(np.float64)))
    return line.a if dist_a >= dist_b else line.b


def select_two_closest_segments(
    point_full: np.ndarray,
    cached_lines_full: List[tuple[np.ndarray, np.ndarray]],
) -> List[tuple[np.ndarray, np.ndarray]]:
    if len(cached_lines_full) == 0:
        return []

    ranked: List[tuple[float, tuple[np.ndarray, np.ndarray]]] = []
    for a_full, b_full in cached_lines_full:
        d = point_to_segment_distance(point_full.astype(np.float64), a_full.astype(np.float64), b_full.astype(np.float64))
        ranked.append((d, (a_full, b_full)))

    ranked.sort(key=lambda item: item[0])
    return [seg for _, seg in ranked[:2]]


def draw_ui(
    base: np.ndarray,
    pending: PendingSelection | None,
    confirmed_points: List[np.ndarray],
    roi: tuple[int, int, int, int] | None,
    roi_scale: float,
    channel_mode: str,
    show_all_lines: bool,
    cached_lines_full: List[tuple[np.ndarray, np.ndarray]],
    hover_full: np.ndarray | None,
    drag_start: tuple[int, int] | None,
    drag_current: tuple[int, int] | None,
) -> tuple[np.ndarray, dict[str, float] | None]:
    mode_label = CHANNEL_MODE_LABELS.get(channel_mode, "gray")

    if roi is None:
        canvas = base.copy()

        for pt in confirmed_points:
            cv2.circle(canvas, (int(round(pt[0])), int(round(pt[1]))), 3, (0, 0, 255), -1, cv2.LINE_AA)

        if drag_start is not None and drag_current is not None:
            x0, y0 = drag_start
            x1, y1 = drag_current
            cv2.rectangle(canvas, (x0, y0), (x1, y1), (0, 255, 0), 2, cv2.LINE_AA)

        text = "Full view: drag LMB=ROI | Esc=reset | q=quit"
        cv2.putText(canvas, text, (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (230, 230, 230), 2, cv2.LINE_AA)
        cv2.putText(canvas, text, (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (30, 30, 30), 1, cv2.LINE_AA)
        text2 = "Modes: g=gray a=avg z=R x=G c=B s=R-G d=B-Y f=sat"
        cv2.putText(canvas, text2, (10, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (230, 230, 230), 2, cv2.LINE_AA)
        cv2.putText(canvas, text2, (10, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (30, 30, 30), 1, cv2.LINE_AA)
        return canvas, None

    x0, y0, x1, y1 = roi
    crop_bgr = base[y0:y1, x0:x1].copy()
    crop_channel = channel_from_mode(crop_bgr, channel_mode)
    crop = cv2.cvtColor(crop_channel, cv2.COLOR_GRAY2BGR)
    render = make_roi_render(roi, roi_scale)
    disp_w = int(render["disp_w"])
    disp_h = int(render["disp_h"])
    side = int(render["side"])
    pad_x = int(render["pad_x"])
    pad_y = int(render["pad_y"])

    if abs(roi_scale - 1.0) > 1e-6:
        resized = cv2.resize(crop, (disp_w, disp_h), interpolation=cv2.INTER_NEAREST)
    else:
        resized = crop

    canvas = np.zeros((side, side, 3), dtype=np.uint8)
    canvas[pad_y : pad_y + disp_h, pad_x : pad_x + disp_w] = resized

    if show_all_lines and hover_full is not None:
        # Draw all cached segments in white.
        for a_full, b_full in cached_lines_full:
            ax, ay = full_to_roi_display(a_full, roi, render)
            bx, by = full_to_roi_display(b_full, roi, render)
            cv2.line(canvas, (ax, ay), (bx, by), (255, 255, 255), 1, cv2.LINE_AA)

        # Highlight the two nearest segments on top: red then green.
        nearest = select_two_closest_segments(hover_full, cached_lines_full)
        colors = [(0, 0, 255), (0, 255, 0)]  # red, green (BGR)
        for i, (a_full, b_full) in enumerate(nearest):
            ax, ay = full_to_roi_display(a_full, roi, render)
            bx, by = full_to_roi_display(b_full, roi, render)
            cv2.line(canvas, (ax, ay), (bx, by), colors[i % len(colors)], 2, cv2.LINE_AA)

    for pt in confirmed_points:
        if point_in_roi(pt, roi):
            cx, cy = full_to_roi_display(pt, roi, render)
            cv2.circle(canvas, (cx, cy), 3, (0, 0, 255), -1, cv2.LINE_AA)

    if pending is not None:
        preview_corner = estimate_corner_from_selection(pending)
        colors = [(255, 255, 0), (0, 255, 255), (255, 0, 255)]
        for i, line in enumerate(pending.lines):
            color = colors[i % len(colors)]
            if preview_corner is not None:
                start = line_endpoint_away_from_point(line, preview_corner)
                end = preview_corner
            else:
                start = line.a
                end = line.b

            ax, ay = full_to_roi_display(start, roi, render)
            bx, by = full_to_roi_display(end, roi, render)
            cv2.line(canvas, (ax, ay), (bx, by), color, 2, cv2.LINE_AA)

        click_xy = full_to_roi_display(pending.click, roi, render)
        cv2.circle(canvas, click_xy, 4, (0, 255, 0), -1, cv2.LINE_AA)

    text = f"ROI view ({mode_label}): LMB=2 lines | hold RMB=2 nearest | Space=confirm | Esc=full view | q=quit"
    cv2.putText(canvas, text, (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.54, (230, 230, 230), 2, cv2.LINE_AA)
    cv2.putText(canvas, text, (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.54, (30, 30, 30), 1, cv2.LINE_AA)
    text2 = "Modes: g=gray a=avg z=R x=G c=B s=R-G d=B-Y f=sat"
    cv2.putText(canvas, text2, (10, 46), cv2.FONT_HERSHEY_SIMPLEX, 0.46, (230, 230, 230), 2, cv2.LINE_AA)
    cv2.putText(canvas, text2, (10, 46), cv2.FONT_HERSHEY_SIMPLEX, 0.46, (30, 30, 30), 1, cv2.LINE_AA)
    return canvas, render


def prompt_world_xyz() -> tuple[int, int, int]:
    while True:
        raw = input("Enter world x y z (integers): ").strip()
        parts = raw.replace(",", " ").split()
        if len(parts) != 3:
            print("Expected exactly 3 integers: x y z")
            continue
        try:
            x, y, z = (int(parts[0]), int(parts[1]), int(parts[2]))
        except ValueError:
            print("Invalid input. Use integers like: 12 64 -3")
            continue
        return x, y, z


def append_known_point(csv_path: Path, screen_xy: np.ndarray, world_xyz: tuple[int, int, int]) -> None:
    sx = float(screen_xy[0])
    sy = float(screen_xy[1])
    wx, wy, wz = world_xyz
    with csv_path.open("a", encoding="utf-8", newline="") as f:
        f.write(f"{sx:.6f},{sy:.6f},{wx},{wy},{wz}\n")


def main() -> None:
    if not hasattr(cv2, "ximgproc"):
        raise RuntimeError("OpenCV contrib is required (cv2.ximgproc missing).")

    base_dir = Path(__file__).resolve().parent
    known_points_path = base_dir / "points.csv"
    image_path = "../examples/images/corners.png"
    image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
    if image is None:
        raise FileNotFoundError(f"Failed to load image: {image_path}")

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    state = {
        "pending": None,
        "confirmed": [],
        "roi": None,
        "roi_scale": 1.0,
        "roi_render": None,
        "channel_mode": "a",
        "show_all_lines": False,
        "cached_raw_lines": None,
        "cached_roi_shape": None,
        "cached_lines_full": [],
        "hover_full": None,
        "drag_start": None,
        "drag_current": None,
    }

    def reset_to_full_view() -> None:
        state["pending"] = None
        state["roi"] = None
        state["roi_scale"] = 1.0
        state["roi_render"] = None
        state["show_all_lines"] = False
        state["cached_raw_lines"] = None
        state["cached_roi_shape"] = None
        state["cached_lines_full"] = []
        state["hover_full"] = None
        state["drag_start"] = None
        state["drag_current"] = None

    def refresh_roi_detection_cache() -> None:
        roi = state["roi"]
        if roi is None:
            state["cached_raw_lines"] = None
            state["cached_roi_shape"] = None
            state["cached_lines_full"] = []
            return

        x0, y0, x1, y1 = roi
        roi_bgr = image[y0:y1, x0:x1]
        if roi_bgr.size == 0:
            state["cached_raw_lines"] = None
            state["cached_roi_shape"] = None
            state["cached_lines_full"] = []
            return

        roi_channel = channel_from_mode(roi_bgr, str(state["channel_mode"]))
        if roi_channel.size == 0:
            state["cached_raw_lines"] = None
            state["cached_roi_shape"] = None
            state["cached_lines_full"] = []
            return

        length_thr = max(6.0, 0.02 * float(min(roi_channel.shape[0], roi_channel.shape[1])))
        fld = cv2.ximgproc.createFastLineDetector(length_threshold=int(round(length_thr)), do_merge=True)
        raw = fld.detect(roi_channel)

        if raw is None or len(raw) == 0:
            state["cached_raw_lines"] = np.empty((0, 1, 4), dtype=np.float32)
            state["cached_roi_shape"] = roi_channel.shape[:2]
            state["cached_lines_full"] = []
            return

        fused_raw = fuse_line_segments(raw, roi_channel.shape[:2])

        offset = np.array([float(x0), float(y0)], dtype=np.float64)
        lines_full: List[tuple[np.ndarray, np.ndarray]] = []
        for seg in fused_raw[:, 0, :]:
            a = np.array([float(seg[0]), float(seg[1])], dtype=np.float64) + offset
            b = np.array([float(seg[2]), float(seg[3])], dtype=np.float64) + offset
            lines_full.append((a, b))

        state["cached_raw_lines"] = fused_raw
        state["cached_roi_shape"] = roi_channel.shape[:2]
        state["cached_lines_full"] = lines_full

    def start_line_selection(full_x: int, full_y: int, mode: int) -> None:
        click_full = np.array([float(full_x), float(full_y)], dtype=np.float64)
        roi = state["roi"]
        if roi is None:
            state["pending"] = None
            return

        if state["cached_raw_lines"] is None or state["cached_roi_shape"] is None:
            refresh_roi_detection_cache()

        x0, y0, x1, y1 = roi
        click_local = np.array([float(full_x - x0), float(full_y - y0)], dtype=np.float64)
        raw = state["cached_raw_lines"]
        roi_shape = state["cached_roi_shape"]
        if raw is None or roi_shape is None or len(raw) == 0:
            state["pending"] = PendingSelection(click=click_full, mode=mode, lines=[])
            return

        local_candidates = build_line_candidates(raw, click_local, roi_shape, needed_count=mode)
        if not local_candidates:
            state["pending"] = PendingSelection(click=click_full, mode=mode, lines=[])
            return

        offset = np.array([float(x0), float(y0)], dtype=np.float64)
        full_candidates: List[LineCandidate] = []
        for cand in local_candidates:
            full_candidates.append(
                LineCandidate(
                    a=cand.a + offset,
                    b=cand.b + offset,
                    length=cand.length,
                    angle=cand.angle,
                    near_endpoint=cand.near_endpoint + offset,
                    endpoint_dist=cand.endpoint_dist,
                    score=cand.score,
                )
            )

        selected = select_diverse_lines(full_candidates, mode, roi_shape)
        state["pending"] = PendingSelection(
            click=click_full,
            mode=mode,
            lines=selected,
        )

    def on_mouse(event: int, x: int, y: int, _flags: int, _userdata: object) -> None:
        roi = state["roi"]

        if roi is None:
            if event == cv2.EVENT_LBUTTONDOWN:
                state["drag_start"] = (x, y)
                state["drag_current"] = (x, y)
            elif event == cv2.EVENT_MOUSEMOVE:
                if state["drag_start"] is not None:
                    state["drag_current"] = (x, y)
            elif event == cv2.EVENT_LBUTTONUP:
                if state["drag_start"] is None:
                    return
                start = state["drag_start"]
                end = (x, y)
                rect = clamp_rect_to_image(start[0], start[1], end[0], end[1], image.shape)
                state["drag_start"] = None
                state["drag_current"] = None
                state["pending"] = None

                if rect is None:
                    return

                state["roi"] = rect
                state["roi_scale"] = compute_roi_scale(image.shape, rect)
                state["roi_render"] = None
                state["show_all_lines"] = False
                refresh_roi_detection_cache()

            return

        render = state["roi_render"]
        if render is None:
            return

        if not in_roi_display_bounds(x, y, render):
            state["hover_full"] = None
            return

        if event == cv2.EVENT_MOUSEMOVE:
            fx, fy = roi_display_to_full(x, y, roi, render)
            state["hover_full"] = np.array([float(fx), float(fy)], dtype=np.float64)

        if event == cv2.EVENT_LBUTTONDOWN:
            fx, fy = roi_display_to_full(x, y, roi, render)
            start_line_selection(fx, fy, mode=2)
        elif event == cv2.EVENT_RBUTTONDOWN:
            fx, fy = roi_display_to_full(x, y, roi, render)
            state["hover_full"] = np.array([float(fx), float(fy)], dtype=np.float64)
            state["show_all_lines"] = True
        elif event == cv2.EVENT_RBUTTONUP:
            state["show_all_lines"] = False

    window = "click_corner_tool"
    cv2.namedWindow(window, cv2.WINDOW_NORMAL)
    cv2.setMouseCallback(window, on_mouse)

    while True:
        frame, render = draw_ui(
            base=image,
            pending=state["pending"],
            confirmed_points=state["confirmed"],
            roi=state["roi"],
            roi_scale=float(state["roi_scale"]),
            channel_mode=str(state["channel_mode"]),
            show_all_lines=bool(state["show_all_lines"]),
            cached_lines_full=list(state["cached_lines_full"]),
            hover_full=state["hover_full"],
            drag_start=state["drag_start"],
            drag_current=state["drag_current"],
        )
        state["roi_render"] = render
        cv2.imshow(window, frame)

        key = cv2.waitKey(20) & 0xFF
        if key == ord("q"):
            break

        if key in (ord("g"), ord("a"), ord("z"), ord("x"), ord("c"), ord("s"), ord("d"), ord("f")):
            state["channel_mode"] = chr(key)
            refresh_roi_detection_cache()
            # If a click is already pending, immediately recompute lines in the new mode.
            pending = state["pending"]
            if pending is not None and state["roi"] is not None:
                px = int(round(float(pending.click[0])))
                py = int(round(float(pending.click[1])))
                start_line_selection(px, py, mode=int(pending.mode))
            continue

        if key == 27:  # Esc: always return to full view.
            reset_to_full_view()
            continue

        if key == 32:  # Space
            pending = state["pending"]
            if pending is None:
                continue

            # Manual fallback: if no lines are available, accept clicked point.
            if len(pending.lines) == 0:
                refined = pending.click.astype(np.float64)
                world_xyz = prompt_world_xyz()
                append_known_point(known_points_path, refined, world_xyz)
                print(f"Corner: ({refined[0]:.3f}, {refined[1]:.3f}) mode={pending.mode} source=manual")
                print(f"Saved: screen=({refined[0]:.3f}, {refined[1]:.3f}) world=({world_xyz[0]}, {world_xyz[1]}, {world_xyz[2]})")
                state["confirmed"].append(refined)
                reset_to_full_view()
                continue

            corner = estimate_corner_from_selection(pending)
            if corner is None:
                print("Could not estimate corner from current line selection.")
                reset_to_full_view()
                continue

            # In two-line mode, use the direct line intersection without extra refinement.
            corner_xy = corner.astype(np.float64)
            world_xyz = prompt_world_xyz()
            append_known_point(known_points_path, corner_xy, world_xyz)
            print(f"Corner: ({corner_xy[0]:.3f}, {corner_xy[1]:.3f}) mode={pending.mode} source=auto_intersection")
            print(f"Saved: screen=({corner_xy[0]:.3f}, {corner_xy[1]:.3f}) world=({world_xyz[0]}, {world_xyz[1]}, {world_xyz[2]})")
            state["confirmed"].append(corner_xy)
            reset_to_full_view()

    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
