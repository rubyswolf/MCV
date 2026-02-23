from __future__ import annotations

from pathlib import Path
from typing import Dict, Tuple

import cv2
import numpy as np


def load_known_points(csv_path: Path) -> tuple[np.ndarray, np.ndarray]:
    rows = []
    with csv_path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = [p.strip() for p in line.split(",")]
            if len(parts) != 5:
                raise ValueError(f"Expected 5 columns per row, got {len(parts)}: {line}")
            sx, sy, wx, wy, wz = map(float, parts)
            rows.append((sx, sy, wx, wy, wz))

    if len(rows) < 4:
        raise ValueError("Need at least 4 correspondences for PnP.")

    data = np.array(rows, dtype=np.float64)
    image_pts = data[:, 0:2].astype(np.float64)
    object_pts = data[:, 2:5].astype(np.float64)
    return image_pts, object_pts


def camera_matrix_from_focal(f: float, width: int, height: int) -> np.ndarray:
    cx = (width - 1) * 0.5
    cy = (height - 1) * 0.5
    return np.array([[f, 0.0, cx], [0.0, f, cy], [0.0, 0.0, 1.0]], dtype=np.float64)


def solve_pose_for_focal(
    object_pts: np.ndarray,
    image_pts: np.ndarray,
    width: int,
    height: int,
    focal: float,
) -> tuple[float, np.ndarray, np.ndarray, np.ndarray]:
    k = camera_matrix_from_focal(focal, width, height)
    dist = np.zeros((4, 1), dtype=np.float64)

    # Robust initial pose.
    ok, rvec, tvec, inliers = cv2.solvePnPRansac(
        object_pts,
        image_pts,
        k,
        dist,
        flags=cv2.SOLVEPNP_EPNP,
        reprojectionError=4.0,
        confidence=0.999,
        iterationsCount=800,
    )
    if not ok:
        return float("inf"), np.zeros((3, 1), dtype=np.float64), np.zeros((3, 1), dtype=np.float64), np.array([], dtype=np.int32)

    if inliers is None or len(inliers) < 4:
        inlier_idx = np.arange(object_pts.shape[0], dtype=np.int32)
    else:
        inlier_idx = inliers.reshape(-1).astype(np.int32)

    # Refine with inliers.
    obj_in = object_pts[inlier_idx]
    img_in = image_pts[inlier_idx]
    ok_refine, rvec, tvec = cv2.solvePnP(
        obj_in,
        img_in,
        k,
        dist,
        rvec=rvec,
        tvec=tvec,
        useExtrinsicGuess=True,
        flags=cv2.SOLVEPNP_ITERATIVE,
    )
    if not ok_refine:
        return float("inf"), np.zeros((3, 1), dtype=np.float64), np.zeros((3, 1), dtype=np.float64), inlier_idx

    if hasattr(cv2, "solvePnPRefineLM"):
        try:
            rvec, tvec = cv2.solvePnPRefineLM(obj_in, img_in, k, dist, rvec, tvec)
        except cv2.error:
            pass

    proj, _ = cv2.projectPoints(object_pts, rvec, tvec, k, dist)
    proj = proj.reshape(-1, 2)
    err = np.linalg.norm(proj - image_pts, axis=1)

    # Robust objective to tolerate occasional bad picks.
    delta = 5.0
    huber = np.where(err <= delta, 0.5 * (err**2), delta * (err - 0.5 * delta))
    outlier_penalty = (object_pts.shape[0] - len(inlier_idx)) * (delta**2)
    cost = float(np.mean(huber) + outlier_penalty)
    return cost, rvec, tvec, inlier_idx


def golden_section_search(
    fn,
    lo: float,
    hi: float,
    iterations: int = 48,
) -> tuple[float, float]:
    phi = (1.0 + np.sqrt(5.0)) * 0.5
    inv_phi = 1.0 / phi

    x1 = hi - (hi - lo) * inv_phi
    x2 = lo + (hi - lo) * inv_phi
    f1 = fn(x1)
    f2 = fn(x2)

    for _ in range(iterations):
        if f1 < f2:
            hi = x2
            x2 = x1
            f2 = f1
            x1 = hi - (hi - lo) * inv_phi
            f1 = fn(x1)
        else:
            lo = x1
            x1 = x2
            f1 = f2
            x2 = lo + (hi - lo) * inv_phi
            f2 = fn(x2)

    if f1 < f2:
        return x1, f1
    return x2, f2


def wrap_degrees(angle_deg: float) -> float:
    return ((angle_deg + 180.0) % 360.0) - 180.0


def pose_to_camera_world_and_minecraft_angles(
    rvec: np.ndarray,
    tvec: np.ndarray,
) -> tuple[np.ndarray, float, float]:
    rmat, _ = cv2.Rodrigues(rvec)

    # OpenCV projection: X_cam = R * X_world + t
    cam_world = -(rmat.T @ tvec).reshape(3)

    # Camera forward axis in camera coords is +Z.
    forward_world = rmat.T @ np.array([0.0, 0.0, 1.0], dtype=np.float64)
    n = float(np.linalg.norm(forward_world))
    if n > 1e-12:
        forward_world = forward_world / n

    # Minecraft-like convention:
    # yaw: 0 at +Z, +90 at -X
    # pitch: +down, -up
    pitch = float(np.degrees(np.arcsin(np.clip(-forward_world[1], -1.0, 1.0))))
    yaw = float(np.degrees(np.arctan2(-forward_world[0], forward_world[2])))
    yaw = wrap_degrees(yaw)
    return cam_world, pitch, yaw


def rmse_px(
    object_pts: np.ndarray,
    image_pts: np.ndarray,
    rvec: np.ndarray,
    tvec: np.ndarray,
    k: np.ndarray,
) -> float:
    proj, _ = cv2.projectPoints(object_pts, rvec, tvec, k, np.zeros((4, 1), dtype=np.float64))
    proj = proj.reshape(-1, 2)
    err = np.linalg.norm(proj - image_pts, axis=1)
    return float(np.sqrt(np.mean(err**2)))


def main() -> None:
    base_dir = Path(__file__).resolve().parent
    csv_path = base_dir / "../examples/labeled/1/points.csv"
    image_path = base_dir / "../examples/labeled/1/original_image.png"

    image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
    if image is None:
        raise FileNotFoundError(f"Failed to load image: {image_path}")
    h, w = image.shape[:2]

    image_pts, object_pts = load_known_points(csv_path)

    # Minecraft "Normal" FOV setting is 70; treat it as an initial vertical-FOV guess.
    initial_vfov_deg = 70.0
    f_init = (h * 0.5) / np.tan(np.deg2rad(initial_vfov_deg * 0.5))

    # 1D scalar search over focal length in log-space.
    f_min = max(20.0, f_init * 0.30)
    f_max = f_init * 3.00

    cache: Dict[float, tuple[float, np.ndarray, np.ndarray, np.ndarray]] = {}

    def eval_logf(logf: float) -> float:
        key = float(logf)
        if key not in cache:
            focal = float(np.exp(logf))
            cache[key] = solve_pose_for_focal(object_pts, image_pts, w, h, focal)
        return cache[key][0]

    logs = np.linspace(np.log(f_min), np.log(f_max), 44)
    costs = np.array([eval_logf(float(l)) for l in logs], dtype=np.float64)
    best_idx = int(np.argmin(costs))

    lo_idx = max(0, best_idx - 2)
    hi_idx = min(len(logs) - 1, best_idx + 2)
    lo = float(logs[lo_idx])
    hi = float(logs[hi_idx])
    if hi <= lo:
        lo, hi = float(logs[0]), float(logs[-1])

    best_logf, _ = golden_section_search(eval_logf, lo, hi, iterations=32)
    best_f = float(np.exp(best_logf))
    best_cost, best_rvec, best_tvec, best_inliers = solve_pose_for_focal(object_pts, image_pts, w, h, best_f)

    if not np.isfinite(best_cost):
        raise RuntimeError("Focal search failed to find a valid PnP solution.")

    k_best = camera_matrix_from_focal(best_f, w, h)
    rmse = rmse_px(object_pts, image_pts, best_rvec, best_tvec, k_best)
    cam_world, pitch_deg, yaw_deg = pose_to_camera_world_and_minecraft_angles(best_rvec, best_tvec)

    # Ground truth provided by user.
    # Minecraft rotation is normally yaw, pitch.
    gt_pos = np.array([24.10319081385771, 33.71892840326218, 254.05654024039364], dtype=np.float64)
    gt_yaw = 3.1681824
    gt_pitch = 44.775566

    pos_err = float(np.linalg.norm(cam_world - gt_pos))
    pitch_err = abs(float(pitch_deg - gt_pitch))
    yaw_err = abs(float(wrap_degrees(yaw_deg - gt_yaw)))
    rot_combined_err = float(np.sqrt(pitch_err**2 + yaw_err**2))

    hfov_deg = float(np.degrees(2.0 * np.arctan((w * 0.5) / best_f)))
    vfov_deg = float(np.degrees(2.0 * np.arctan((h * 0.5) / best_f)))

    print(f"Points: {len(object_pts)} (inliers used in best RANSAC pass: {len(best_inliers)})")
    print(f"Image: {w}x{h}")
    print(f"Initial guess: vfov={initial_vfov_deg:.6f} deg, focal={f_init:.6f} px")
    print(f"Optimized focal: {best_f:.6f} px")
    print(f"Optimized FOV: h={hfov_deg:.6f} deg, v={vfov_deg:.6f} deg")
    print(f"Reprojection RMSE: {rmse:.6f} px")
    print()
    print(f"Predicted position: {cam_world[0]:.12f}, {cam_world[1]:.12f}, {cam_world[2]:.12f}")
    print(f"Predicted rotation (yaw, pitch): {yaw_deg:.7f}, {pitch_deg:.7f}")
    print()
    print(f"Ground truth position: {gt_pos[0]:.12f}, {gt_pos[1]:.12f}, {gt_pos[2]:.12f}")
    print(f"Ground truth rotation (yaw, pitch): {gt_yaw:.7f}, {gt_pitch:.7f}")
    print()
    print(f"Position error distance: {pos_err:.12f} blocks")
    print(f"Rotation error distance: {rot_combined_err:.12f} deg")

if __name__ == "__main__":
    main()
