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
    if len(selection.lines) < 2:
        return None

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


def draw_ui(
    base: np.ndarray,
    pending: PendingSelection | None,
    confirmed_points: List[np.ndarray],
    roi: tuple[int, int, int, int] | None,
    roi_scale: float,
    drag_start: tuple[int, int] | None,
    drag_current: tuple[int, int] | None,
) -> tuple[np.ndarray, dict[str, float] | None]:
    if roi is None:
        canvas = base.copy()

        for pt in confirmed_points:
            cv2.circle(canvas, (int(round(pt[0])), int(round(pt[1]))), 3, (0, 0, 255), -1, cv2.LINE_AA)

        if drag_start is not None and drag_current is not None:
            x0, y0 = drag_start
            x1, y1 = drag_current
            cv2.rectangle(canvas, (x0, y0), (x1, y1), (0, 255, 0), 2, cv2.LINE_AA)

        text = "Full view: drag LMB to select ROI | Esc=reset | q=quit"
        cv2.putText(canvas, text, (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (230, 230, 230), 2, cv2.LINE_AA)
        cv2.putText(canvas, text, (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (30, 30, 30), 1, cv2.LINE_AA)
        return canvas, None

    x0, y0, x1, y1 = roi
    crop = base[y0:y1, x0:x1].copy()
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

    for pt in confirmed_points:
        if point_in_roi(pt, roi):
            cx, cy = full_to_roi_display(pt, roi, render)
            cv2.circle(canvas, (cx, cy), 3, (0, 0, 255), -1, cv2.LINE_AA)

    if pending is not None:
        preview_corner = estimate_corner_from_selection(pending) if len(pending.lines) >= 2 else None
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

    text = "ROI view: LMB=2 lines | Space=confirm | Esc=full view | q=quit"
    cv2.putText(canvas, text, (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.54, (230, 230, 230), 2, cv2.LINE_AA)
    cv2.putText(canvas, text, (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.54, (30, 30, 30), 1, cv2.LINE_AA)
    return canvas, render


def choose_default_image(base_dir: Path) -> Path:
    for name in ("frame.png", "corners.png"):
        p = base_dir / name
        if p.exists():
            return p
    return base_dir / "corners.png"


def main() -> None:
    if not hasattr(cv2, "ximgproc"):
        raise RuntimeError("OpenCV contrib is required (cv2.ximgproc missing).")

    base_dir = Path(__file__).resolve().parent
    image_path = choose_default_image(base_dir)
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
        "drag_start": None,
        "drag_current": None,
    }

    def reset_to_full_view() -> None:
        state["pending"] = None
        state["roi"] = None
        state["roi_scale"] = 1.0
        state["roi_render"] = None
        state["drag_start"] = None
        state["drag_current"] = None

    def start_line_selection(full_x: int, full_y: int, mode: int) -> None:
        click_full = np.array([float(full_x), float(full_y)], dtype=np.float64)
        roi = state["roi"]
        if roi is None:
            state["pending"] = None
            return

        x0, y0, x1, y1 = roi
        roi_gray = gray[y0:y1, x0:x1]
        if roi_gray.size == 0:
            state["pending"] = PendingSelection(click=click_full, mode=mode, lines=[])
            return

        click_local = np.array([float(full_x - x0), float(full_y - y0)], dtype=np.float64)

        length_thr = max(6.0, 0.02 * float(min(roi_gray.shape[0], roi_gray.shape[1])))
        fld = cv2.ximgproc.createFastLineDetector(length_threshold=int(round(length_thr)), do_merge=True)
        raw = fld.detect(roi_gray)
        if raw is None or len(raw) == 0:
            state["pending"] = PendingSelection(click=click_full, mode=mode, lines=[])
            return

        local_candidates = build_line_candidates(raw, click_local, roi_gray.shape[:2], needed_count=mode)
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

        selected = select_diverse_lines(full_candidates, mode, roi_gray.shape[:2])
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

            return

        render = state["roi_render"]
        if render is None:
            return

        if not in_roi_display_bounds(x, y, render):
            return

        if event == cv2.EVENT_LBUTTONDOWN:
            fx, fy = roi_display_to_full(x, y, roi, render)
            start_line_selection(fx, fy, mode=2)

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
            drag_start=state["drag_start"],
            drag_current=state["drag_current"],
        )
        state["roi_render"] = render
        cv2.imshow(window, frame)

        key = cv2.waitKey(20) & 0xFF
        if key == ord("q"):
            break

        if key == 27:  # Esc: always return to full view.
            reset_to_full_view()
            continue

        if key == 32:  # Space
            pending = state["pending"]
            if pending is None:
                continue

            # Manual fallback: if fewer than 2 lines are available, accept clicked point.
            if len(pending.lines) < 2:
                refined = pending.click.astype(np.float64)
                print(f"Corner: ({refined[0]:.3f}, {refined[1]:.3f}) mode={pending.mode} source=manual")
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
            print(f"Corner: ({corner_xy[0]:.3f}, {corner_xy[1]:.3f}) mode={pending.mode} source=auto_intersection")
            state["confirmed"].append(corner_xy)
            reset_to_full_view()

    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
