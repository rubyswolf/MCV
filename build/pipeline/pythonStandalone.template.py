#!/usr/bin/env python3
import sys
from pathlib import Path
import base64
import hashlib
import math

REQUIREMENTS_FILENAME = "mcv-requirements.txt"
# @mcv-insert REQUIREMENTS_TEXT


def write_requirements_file():
    output_path = Path.cwd() / REQUIREMENTS_FILENAME
    try:
        output_path.write_text(REQUIREMENTS_TEXT, encoding="utf-8")
        print(f"Wrote requirements file: {output_path}")
    except Exception as exc:
        print(f"Failed to write {REQUIREMENTS_FILENAME}: {exc}")
    return output_path

try:
    from flask import Flask, Response, jsonify, request
except ImportError as exc:
    requirements_path = write_requirements_file()
    print(f"Missing dependency: {exc.name}")
    print("Install requirements with:")
    print(f"  {sys.executable} -m pip install -r {requirements_path}")
    raise SystemExit(1)

try:
    import cv2
    import numpy as np
except ImportError as exc:
    requirements_path = write_requirements_file()
    print(f"Missing dependency: {exc.name}")
    print("Install requirements with:")
    print(f"  {sys.executable} -m pip install -r {requirements_path}")
    raise SystemExit(1)

# @mcv-insert HTML_PAGE

app = Flask(__name__)
SOBEL_CACHE_BY_SESSION = {}


def _normalize_session_id(raw):
    if not isinstance(raw, str):
        return "__default__"
    session_id = raw.strip()
    return session_id if session_id else "__default__"


def _decode_image_data_url_to_bgr(image_data_url):
    if not isinstance(image_data_url, str) or "," not in image_data_url:
        raise ValueError("Invalid image_data_url")
    header, encoded = image_data_url.split(",", 1)
    if ";base64" not in header:
        raise ValueError("image_data_url must be base64 encoded")
    try:
        raw_bytes = base64.b64decode(encoded, validate=True)
    except Exception as exc:
        raise ValueError("Invalid image_data_url base64 payload") from exc
    buffer = np.frombuffer(raw_bytes, dtype=np.uint8)
    image_bgr = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if image_bgr is None:
        raise ValueError("Could not decode image data")
    return image_bgr


def _compute_color_sobel(image_bgr):
    rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    channels = cv2.split(rgb)
    height, width = rgb.shape[:2]
    sobel_x = np.zeros((height, width, 3), dtype=np.float32)
    sobel_y = np.zeros((height, width, 3), dtype=np.float32)
    for index, channel in enumerate(channels):
        sobel_x[:, :, index] = cv2.Sobel(channel, cv2.CV_32F, 1, 0, ksize=3)
        sobel_y[:, :, index] = cv2.Sobel(channel, cv2.CV_32F, 0, 1, ksize=3)
    return sobel_x, sobel_y


def _precompute_sobel_cache(args):
    if not isinstance(args, dict):
        raise ValueError("args must be an object")
    image_data_url = args.get("image_data_url")
    if not isinstance(image_data_url, str) or not image_data_url.strip():
        raise ValueError("image_data_url is required")
    session_id = _normalize_session_id(args.get("session_id"))
    cache_key_raw = args.get("cache_key")
    if isinstance(cache_key_raw, str) and cache_key_raw.strip():
        cache_key = cache_key_raw.strip()
    else:
        cache_key = hashlib.sha1(image_data_url.encode("utf-8")).hexdigest()

    session_cache = SOBEL_CACHE_BY_SESSION.setdefault(session_id, {})
    cached_entry = session_cache.get(cache_key)
    if isinstance(cached_entry, dict):
        return {
            "session_id": session_id,
            "cache_key": cache_key,
            "cached": True,
            "width": int(cached_entry.get("width", 0)),
            "height": int(cached_entry.get("height", 0)),
        }

    image_bgr = _decode_image_data_url_to_bgr(image_data_url)
    sobel_x, sobel_y = _compute_color_sobel(image_bgr)
    height, width = image_bgr.shape[:2]
    session_cache[cache_key] = {
        "width": int(width),
        "height": int(height),
        "gx": sobel_x,
        "gy": sobel_y,
    }
    return {
        "session_id": session_id,
        "cache_key": cache_key,
        "cached": False,
        "width": int(width),
        "height": int(height),
    }


def _clear_sobel_cache(args):
    session_id = _normalize_session_id(args.get("session_id") if isinstance(args, dict) else None)
    existing = SOBEL_CACHE_BY_SESSION.pop(session_id, None)
    cleared = len(existing) if isinstance(existing, dict) else 0
    return {
        "session_id": session_id,
        "cleared": int(cleared),
    }


def _clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def _fit_principal_line(points, fallback_dir):
    if points.size == 0:
        fallback = np.array(fallback_dir, dtype=np.float64)
        n = float(np.linalg.norm(fallback))
        if n <= 1e-12:
            fallback = np.array([1.0, 0.0], dtype=np.float64)
            n = 1.0
        return np.zeros((2,), dtype=np.float64), fallback / n

    center = np.mean(points, axis=0)
    if points.shape[0] < 2:
        fallback = np.array(fallback_dir, dtype=np.float64)
        n = float(np.linalg.norm(fallback))
        if n <= 1e-12:
            fallback = np.array([1.0, 0.0], dtype=np.float64)
            n = 1.0
        return center, fallback / n

    centered = points - center
    cov = centered.T @ centered
    evals, evecs = np.linalg.eigh(cov)
    direction = evecs[:, int(np.argmax(evals))]
    if float(np.linalg.norm(direction)) <= 1e-12:
        direction = np.array(fallback_dir, dtype=np.float64)
    n = float(np.linalg.norm(direction))
    if n <= 1e-12:
        direction = np.array([1.0, 0.0], dtype=np.float64)
        n = 1.0
    return center, direction / n


def _sample_bilinear_rgb(field, xs, ys):
    height, width = field.shape[:2]
    xs = np.clip(xs, 0.0, max(0.0, float(width - 1)))
    ys = np.clip(ys, 0.0, max(0.0, float(height - 1)))
    x0 = np.floor(xs).astype(np.int32)
    y0 = np.floor(ys).astype(np.int32)
    x1 = np.clip(x0 + 1, 0, width - 1)
    y1 = np.clip(y0 + 1, 0, height - 1)
    wx = (xs - x0).astype(np.float32)
    wy = (ys - y0).astype(np.float32)

    top_left = field[y0, x0]
    top_right = field[y0, x1]
    bot_left = field[y1, x0]
    bot_right = field[y1, x1]
    top = top_left * (1.0 - wx[..., None]) + top_right * wx[..., None]
    bottom = bot_left * (1.0 - wx[..., None]) + bot_right * wx[..., None]
    return top * (1.0 - wy[..., None]) + bottom * wy[..., None]


def _parse_opop_settings(raw):
    data = raw if isinstance(raw, dict) else {}
    whisker_mode = data.get("whiskerMode")
    if whisker_mode not in ("per_pixel", "per_line"):
        whisker_mode = "per_pixel"
    alignment = float(data.get("alignmentStrength", 1.0))
    straightness = float(data.get("straightnessStrength", 1.0))
    whiskers_per_pixel = int(round(float(data.get("whiskersPerPixel", 4))))
    whiskers_per_line = int(round(float(data.get("whiskersPerLine", 128))))
    normal_radius = float(data.get("normalSearchRadiusPx", 2.0))
    iterations = int(round(float(data.get("iterations", 6))))
    include_endpoints = bool(data.get("includeEndpoints", False))
    return {
        "whiskerMode": whisker_mode,
        "alignmentStrength": _clamp(alignment, 0.0, 5.0),
        "straightnessStrength": _clamp(straightness, 0.0, 5.0),
        "whiskersPerPixel": int(_clamp(whiskers_per_pixel, 1, 4096)),
        "whiskersPerLine": int(_clamp(whiskers_per_line, 1, 4096)),
        "normalSearchRadiusPx": _clamp(normal_radius, 0.0, 256.0),
        "iterations": int(_clamp(iterations, 1, 64)),
        "includeEndpoints": include_endpoints,
    }


def _compute_opop_whisker_count(line_length, settings):
    if not np.isfinite(line_length) or line_length <= 0.0:
        return 0
    if settings["whiskerMode"] == "per_pixel":
        return max(1, int(round(line_length / max(1, settings["whiskersPerPixel"]))))
    return max(1, int(round(settings["whiskersPerLine"])))


def _opop_refine_line(args):
    if not isinstance(args, dict):
        raise ValueError("args must be an object")

    session_id = _normalize_session_id(args.get("session_id"))
    cache_key_raw = args.get("cache_key")
    if not isinstance(cache_key_raw, str) or not cache_key_raw.strip():
        raise ValueError("cache_key is required")
    cache_key = cache_key_raw.strip()

    session_cache = SOBEL_CACHE_BY_SESSION.get(session_id)
    if not isinstance(session_cache, dict):
        raise ValueError("No Sobel cache exists for this session")
    cache_entry = session_cache.get(cache_key)
    if not isinstance(cache_entry, dict):
        raise ValueError("Sobel cache entry not found for this image")

    gx = cache_entry.get("gx")
    gy = cache_entry.get("gy")
    width = int(cache_entry.get("width", 0))
    height = int(cache_entry.get("height", 0))
    if (
        not isinstance(gx, np.ndarray)
        or not isinstance(gy, np.ndarray)
        or gx.ndim != 3
        or gy.ndim != 3
        or gx.shape != gy.shape
        or gx.shape[2] != 3
        or width <= 0
        or height <= 0
    ):
        raise ValueError("Invalid Sobel cache entry")

    line = args.get("line")
    if not isinstance(line, dict):
        raise ValueError("line is required")
    line_from = line.get("from")
    line_to = line.get("to")
    if not isinstance(line_from, dict) or not isinstance(line_to, dict):
        raise ValueError("line.from and line.to are required")
    ax = float(line_from.get("x"))
    ay = float(line_from.get("y"))
    bx = float(line_to.get("x"))
    by = float(line_to.get("y"))
    if not (np.isfinite(ax) and np.isfinite(ay) and np.isfinite(bx) and np.isfinite(by)):
        raise ValueError("line endpoints must be finite")

    drag_line = args.get("drag_line")
    drag_ax = ax
    drag_ay = ay
    drag_bx = bx
    drag_by = by
    if isinstance(drag_line, dict):
        drag_from = drag_line.get("from")
        drag_to = drag_line.get("to")
        if isinstance(drag_from, dict) and isinstance(drag_to, dict):
            try:
                raw_drag_ax = float(drag_from.get("x"))
                raw_drag_ay = float(drag_from.get("y"))
                raw_drag_bx = float(drag_to.get("x"))
                raw_drag_by = float(drag_to.get("y"))
                if (
                    np.isfinite(raw_drag_ax)
                    and np.isfinite(raw_drag_ay)
                    and np.isfinite(raw_drag_bx)
                    and np.isfinite(raw_drag_by)
                ):
                    drag_ax = raw_drag_ax
                    drag_ay = raw_drag_ay
                    drag_bx = raw_drag_bx
                    drag_by = raw_drag_by
            except Exception:
                pass

    settings = _parse_opop_settings(args.get("settings"))
    base_dir = np.array([bx - ax, by - ay], dtype=np.float64)
    base_length = float(np.linalg.norm(base_dir))
    if base_length <= 1e-9:
        return {
            "from": {"x": float(ax), "y": float(ay)},
            "to": {"x": float(bx), "y": float(by)},
            "points": [],
            "whisker_count": 0,
        }

    whisker_count = _compute_opop_whisker_count(base_length, settings)
    if whisker_count <= 0:
        return {
            "from": {"x": float(ax), "y": float(ay)},
            "to": {"x": float(bx), "y": float(by)},
            "points": [],
            "whisker_count": 0,
        }

    include_endpoints = bool(settings.get("includeEndpoints", False))
    if whisker_count == 1:
        if include_endpoints:
            points = np.array([[ax, ay]], dtype=np.float64)
        else:
            points = np.array([[(ax + bx) * 0.5, (ay + by) * 0.5]], dtype=np.float64)
    else:
        if include_endpoints:
            t = np.linspace(0.0, 1.0, whisker_count, dtype=np.float64)
        else:
            t = np.arange(1, whisker_count + 1, dtype=np.float64) / float(whisker_count + 1)
        points = np.stack([ax + (bx - ax) * t, ay + (by - ay) * t], axis=1)

    fallback = base_dir / max(base_length, 1e-12)
    radius = int(max(0, int(math.floor(settings["normalSearchRadiusPx"]))))
    iterations = settings["iterations"]
    alignment_gain = _clamp(settings["alignmentStrength"] * 0.2, 0.0, 1.5)
    straightness_gain = _clamp(settings["straightnessStrength"] * 0.12, 0.0, 1.0)
    offsets = np.arange(-radius, radius + 1, dtype=np.float64)
    if offsets.size == 0:
        offsets = np.array([0.0], dtype=np.float64)

    for _ in range(iterations):
        if points.shape[0] >= 2:
            tangent_raw = points[-1] - points[0]
        else:
            tangent_raw = fallback
        tangent_norm = float(np.linalg.norm(tangent_raw))
        if tangent_norm <= 1e-12:
            tangent = fallback
        else:
            tangent = tangent_raw / tangent_norm
        normal = np.array([-tangent[1], tangent[0]], dtype=np.float64)
        fallback = tangent

        candidate = points[:, None, :] + offsets[None, :, None] * normal[None, None, :]
        samples_x = candidate[:, :, 0]
        samples_y = candidate[:, :, 1]
        gx_s = _sample_bilinear_rgb(gx, samples_x, samples_y)
        gy_s = _sample_bilinear_rgb(gy, samples_x, samples_y)
        proj_n = gx_s * normal[0] + gy_s * normal[1]
        proj_t = gx_s * tangent[0] + gy_s * tangent[1]
        normal_power = np.sqrt(np.sum(proj_n * proj_n, axis=2))
        tangent_power = np.sqrt(np.sum(proj_t * proj_t, axis=2))
        scores = normal_power - 0.2 * tangent_power
        best_idx = np.argmax(scores, axis=1)
        best_offsets = offsets[best_idx]
        targets = points + best_offsets[:, None] * normal[None, :]
        points = points + alignment_gain * (targets - points)

        if straightness_gain > 0.0 and points.shape[0] >= 2:
            center, direction = _fit_principal_line(points, fallback)
            scalars = (points - center) @ direction
            projected = center[None, :] + scalars[:, None] * direction[None, :]
            points = points + straightness_gain * (projected - points)

    center, direction = _fit_principal_line(points, fallback)
    # Preserve endpoint span by projecting original drag endpoints onto the fitted line.
    s_a = float(np.dot(np.array([drag_ax, drag_ay], dtype=np.float64) - center, direction))
    s_b = float(np.dot(np.array([drag_bx, drag_by], dtype=np.float64) - center, direction))
    refined_from = center + direction * s_a
    refined_to = center + direction * s_b
    if float(np.dot(refined_to - refined_from, base_dir)) < 0.0:
        refined_from, refined_to = refined_to, refined_from

    points[:, 0] = np.clip(points[:, 0], 0.0, max(0.0, float(width - 1)))
    points[:, 1] = np.clip(points[:, 1], 0.0, max(0.0, float(height - 1)))

    return {
        "from": {"x": float(refined_from[0]), "y": float(refined_from[1])},
        "to": {"x": float(refined_to[0]), "y": float(refined_to[1])},
        "points": [{"x": float(point[0]), "y": float(point[1])} for point in points.tolist()],
        "whisker_count": int(whisker_count),
    }


def _is_finite_number(value):
    return isinstance(value, (int, float)) and np.isfinite(float(value))


def _extract_pose_correspondences(lines, vertices):
    if not isinstance(lines, list) or not isinstance(vertices, list):
        raise ValueError("lines and vertices must be arrays")
    out_rows = []
    endpoint_world_samples = {}
    max_line_index = len(lines) - 1
    for vertex in vertices:
        if not isinstance(vertex, dict):
            continue
        vx = vertex.get("x")
        vy = vertex.get("y")
        vz = vertex.get("z")
        if not (_is_finite_number(vx) and _is_finite_number(vy) and _is_finite_number(vz)):
            continue
        endpoint_ids = set()
        from_refs = vertex.get("from")
        to_refs = vertex.get("to")
        if isinstance(from_refs, list):
            for line_index in from_refs:
                if isinstance(line_index, int) and 0 <= line_index <= max_line_index:
                    endpoint_id = line_index * 2
                    endpoint_ids.add(endpoint_id)
                    endpoint_world_samples.setdefault(endpoint_id, []).append(
                        (float(vx), float(vy), float(vz))
                    )
        if isinstance(to_refs, list):
            for line_index in to_refs:
                if isinstance(line_index, int) and 0 <= line_index <= max_line_index:
                    endpoint_id = line_index * 2 + 1
                    endpoint_ids.add(endpoint_id)
                    endpoint_world_samples.setdefault(endpoint_id, []).append(
                        (float(vx), float(vy), float(vz))
                    )
        if not endpoint_ids:
            continue
        sum_x = 0.0
        sum_y = 0.0
        count = 0
        for endpoint_id in endpoint_ids:
            line_index = endpoint_id // 2
            endpoint_key = "from" if endpoint_id % 2 == 0 else "to"
            line = lines[line_index] if 0 <= line_index < len(lines) else None
            if not isinstance(line, dict):
                continue
            endpoint = line.get(endpoint_key)
            if not isinstance(endpoint, dict):
                continue
            px = endpoint.get("x")
            py = endpoint.get("y")
            if not (_is_finite_number(px) and _is_finite_number(py)):
                continue
            sum_x += float(px)
            sum_y += float(py)
            count += 1
        if count <= 0:
            continue
        out_rows.append((sum_x / count, sum_y / count, float(vx), float(vy), float(vz)))
    if len(out_rows) < 4:
        raise ValueError("Need at least 4 valid vertex correspondences with known world coordinates")
    data = np.array(out_rows, dtype=np.float64)
    image_pts = data[:, 0:2].astype(np.float64)
    object_pts = data[:, 2:5].astype(np.float64)
    endpoint_world = {}
    for endpoint_id, samples in endpoint_world_samples.items():
        if not samples:
            continue
        arr = np.array(samples, dtype=np.float64)
        endpoint_world[endpoint_id] = np.mean(arr, axis=0)

    line_correspondences = []
    for line_index, line in enumerate(lines):
        if not isinstance(line, dict):
            continue
        line_from = line.get("from")
        line_to = line.get("to")
        if not isinstance(line_from, dict) or not isinstance(line_to, dict):
            continue
        img_ax = line_from.get("x")
        img_ay = line_from.get("y")
        img_bx = line_to.get("x")
        img_by = line_to.get("y")
        if not (
            _is_finite_number(img_ax)
            and _is_finite_number(img_ay)
            and _is_finite_number(img_bx)
            and _is_finite_number(img_by)
        ):
            continue
        obs_a = np.array([float(img_ax), float(img_ay)], dtype=np.float64)
        obs_b = np.array([float(img_bx), float(img_by)], dtype=np.float64)
        if float(np.linalg.norm(obs_b - obs_a)) < 1.0:
            continue
        world_a = endpoint_world.get(line_index * 2)
        world_b = endpoint_world.get(line_index * 2 + 1)
        if world_a is None or world_b is None:
            continue
        if float(np.linalg.norm(world_b - world_a)) < 1e-9:
            continue
        line_correspondences.append(
            {
                "line_index": int(line_index),
                "obj_a": world_a.reshape(3),
                "obj_b": world_b.reshape(3),
                "img_a": obs_a,
                "img_b": obs_b,
            }
        )
    return image_pts, object_pts, line_correspondences


def _project_reprojected_lines(line_corr, rvec, tvec, k, dist):
    out = []
    for line in line_corr:
        line_index = line.get("line_index")
        if not isinstance(line_index, int):
            continue
        obj_line = np.array([line["obj_a"], line["obj_b"]], dtype=np.float64).reshape(-1, 1, 3)
        proj_line, _ = cv2.projectPoints(obj_line, rvec, tvec, k, dist)
        proj_line = proj_line.reshape(-1, 2)
        out.append(
            {
                "line_index": int(line_index),
                "from": {
                    "x": float(proj_line[0][0]),
                    "y": float(proj_line[0][1]),
                },
                "to": {
                    "x": float(proj_line[1][0]),
                    "y": float(proj_line[1][1]),
                },
            }
        )
    return out


def _camera_matrix_from_focal(focal, width, height):
    cx = (width - 1) * 0.5
    cy = (height - 1) * 0.5
    return np.array(
        [[focal, 0.0, cx], [0.0, focal, cy], [0.0, 0.0, 1.0]],
        dtype=np.float64,
    )


def _point_to_line_distance(point_xy, line_a_xy, line_b_xy):
    direction = line_b_xy - line_a_xy
    denom = float(np.linalg.norm(direction))
    if denom < 1e-9:
        return float(np.linalg.norm(point_xy - line_a_xy))
    vec = point_xy - line_a_xy
    cross = direction[0] * vec[1] - direction[1] * vec[0]
    return abs(float(cross)) / denom


def _closest_point_on_line(point_xy, line_a_xy, line_b_xy):
    direction = line_b_xy - line_a_xy
    denom = float(np.dot(direction, direction))
    if denom < 1e-9:
        return line_a_xy.copy()
    t = float(np.dot(point_xy - line_a_xy, direction) / denom)
    return line_a_xy + direction * t


def _line_guided_refine_pose(object_pts, image_pts, line_corr, k, dist, rvec, tvec, iterations=4):
    if not line_corr:
        return rvec, tvec
    base_obj = object_pts.reshape(-1, 3)
    base_img = image_pts.reshape(-1, 2)
    for _ in range(iterations):
        line_obj = []
        line_img = []
        for line in line_corr:
            obj_line = np.array([line["obj_a"], line["obj_b"]], dtype=np.float64).reshape(-1, 1, 3)
            proj_line, _ = cv2.projectPoints(obj_line, rvec, tvec, k, dist)
            proj_line = proj_line.reshape(-1, 2)
            snapped_a = _closest_point_on_line(proj_line[0], line["img_a"], line["img_b"])
            snapped_b = _closest_point_on_line(proj_line[1], line["img_a"], line["img_b"])
            line_obj.append(line["obj_a"])
            line_obj.append(line["obj_b"])
            line_img.append(snapped_a)
            line_img.append(snapped_b)
        if not line_obj:
            break
        aug_obj = np.vstack([base_obj, np.array(line_obj, dtype=np.float64)])
        aug_img = np.vstack([base_img, np.array(line_img, dtype=np.float64)])
        ok_refine, next_rvec, next_tvec = cv2.solvePnP(
            aug_obj,
            aug_img,
            k,
            dist,
            rvec=rvec,
            tvec=tvec,
            useExtrinsicGuess=True,
            flags=cv2.SOLVEPNP_ITERATIVE,
        )
        if not ok_refine:
            break
        rvec, tvec = next_rvec, next_tvec
    return rvec, tvec


def _line_residuals_px(line_corr, rvec, tvec, k, dist):
    if not line_corr:
        return np.zeros((0,), dtype=np.float64)
    errors = []
    for line in line_corr:
        obj_line = np.array([line["obj_a"], line["obj_b"]], dtype=np.float64).reshape(-1, 1, 3)
        proj_line, _ = cv2.projectPoints(obj_line, rvec, tvec, k, dist)
        proj_line = proj_line.reshape(-1, 2)
        errors.append(_point_to_line_distance(proj_line[0], line["img_a"], line["img_b"]))
        errors.append(_point_to_line_distance(proj_line[1], line["img_a"], line["img_b"]))
    return np.array(errors, dtype=np.float64)


def _solve_pose_for_focal(object_pts, image_pts, line_corr, width, height, focal):
    k = _camera_matrix_from_focal(focal, width, height)
    dist = np.zeros((4, 1), dtype=np.float64)
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
        return (
            float("inf"),
            np.zeros((3, 1), dtype=np.float64),
            np.zeros((3, 1), dtype=np.float64),
            np.array([], dtype=np.int32),
            float("inf"),
            float("inf"),
        )

    if inliers is None or len(inliers) < 4:
        inlier_idx = np.arange(object_pts.shape[0], dtype=np.int32)
    else:
        inlier_idx = inliers.reshape(-1).astype(np.int32)

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
        return (
            float("inf"),
            np.zeros((3, 1), dtype=np.float64),
            np.zeros((3, 1), dtype=np.float64),
            inlier_idx,
            float("inf"),
            float("inf"),
        )

    if hasattr(cv2, "solvePnPRefineLM"):
        try:
            rvec, tvec = cv2.solvePnPRefineLM(obj_in, img_in, k, dist, rvec, tvec)
        except cv2.error:
            pass
    rvec, tvec = _line_guided_refine_pose(obj_in, img_in, line_corr, k, dist, rvec, tvec)

    proj, _ = cv2.projectPoints(object_pts, rvec, tvec, k, dist)
    proj = proj.reshape(-1, 2)
    point_err = np.linalg.norm(proj - image_pts, axis=1)
    point_rmse = float(np.sqrt(np.mean(point_err**2)))

    delta_point = 5.0
    point_huber = np.where(
        point_err <= delta_point,
        0.5 * (point_err**2),
        delta_point * (point_err - 0.5 * delta_point),
    )
    point_cost = float(np.mean(point_huber))

    line_err = _line_residuals_px(line_corr, rvec, tvec, k, dist)
    if line_err.size > 0:
        delta_line = 3.0
        line_huber = np.where(
            line_err <= delta_line,
            0.5 * (line_err**2),
            delta_line * (line_err - 0.5 * delta_line),
        )
        line_cost = float(np.mean(line_huber))
        line_rmse = float(np.sqrt(np.mean(line_err**2)))
    else:
        line_cost = 0.0
        line_rmse = 0.0

    outlier_penalty = (object_pts.shape[0] - len(inlier_idx)) * (delta_point**2)
    cost = float(point_cost + 0.7 * line_cost + outlier_penalty)
    return cost, rvec, tvec, inlier_idx, point_rmse, line_rmse


def _golden_section_search(fn, lo, hi, iterations=48):
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
    return (x1, f1) if f1 < f2 else (x2, f2)


def _wrap_degrees(angle_deg):
    return ((angle_deg + 180.0) % 360.0) - 180.0


def _pose_to_camera_world_and_minecraft_angles(rvec, tvec):
    rmat, _ = cv2.Rodrigues(rvec)
    cam_world = -(rmat.T @ tvec).reshape(3)
    forward_world = rmat.T @ np.array([0.0, 0.0, 1.0], dtype=np.float64)
    n = float(np.linalg.norm(forward_world))
    if n > 1e-12:
        forward_world = forward_world / n
    pitch = float(np.degrees(np.arcsin(np.clip(-forward_world[1], -1.0, 1.0))))
    yaw = float(np.degrees(np.arctan2(-forward_world[0], forward_world[2])))
    yaw = _wrap_degrees(yaw)
    return cam_world, pitch, yaw


def run_pose_solve(args):
    width_raw = args.get("width")
    height_raw = args.get("height")
    if not isinstance(width_raw, (int, float)) or not isinstance(height_raw, (int, float)):
        raise ValueError("width and height are required")
    width = int(width_raw)
    height = int(height_raw)
    if width <= 0 or height <= 0:
        raise ValueError("width and height must be positive")

    lines = args.get("lines")
    vertices = args.get("vertices")
    image_pts, object_pts, line_corr = _extract_pose_correspondences(lines, vertices)

    initial_vfov_raw = args.get("initial_vfov_deg")
    initial_vfov_deg = (
        float(initial_vfov_raw)
        if isinstance(initial_vfov_raw, (int, float)) and np.isfinite(float(initial_vfov_raw))
        else 70.0
    )
    if not (1.0 < initial_vfov_deg < 179.0):
        initial_vfov_deg = 70.0
    f_init = (height * 0.5) / np.tan(np.deg2rad(initial_vfov_deg * 0.5))
    f_min = max(20.0, f_init * 0.30)
    f_max = f_init * 3.00

    cache = {}

    def eval_logf(logf):
        key = float(logf)
        if key not in cache:
            focal = float(np.exp(logf))
            cache[key] = _solve_pose_for_focal(object_pts, image_pts, line_corr, width, height, focal)
        return cache[key][0]

    logs = np.linspace(np.log(f_min), np.log(f_max), 44)
    costs = np.array([eval_logf(float(l)) for l in logs], dtype=np.float64)
    best_idx = int(np.argmin(costs))
    lo_idx = max(0, best_idx - 2)
    hi_idx = min(len(logs) - 1, best_idx + 2)
    lo = float(logs[lo_idx])
    hi = float(logs[hi_idx])
    if hi <= lo:
        lo = float(logs[0])
        hi = float(logs[-1])

    best_logf, _ = _golden_section_search(eval_logf, lo, hi, iterations=32)
    best_f = float(np.exp(best_logf))
    best_cost, best_rvec, best_tvec, best_inliers, point_rmse, line_rmse = _solve_pose_for_focal(
        object_pts, image_pts, line_corr, width, height, best_f
    )
    if not np.isfinite(best_cost):
        raise RuntimeError("Focal search failed to find a valid PnP solution")

    k_best = _camera_matrix_from_focal(best_f, width, height)
    dist_best = np.zeros((4, 1), dtype=np.float64)
    reprojected_lines = _project_reprojected_lines(line_corr, best_rvec, best_tvec, k_best, dist_best)

    cam_world, pitch_deg, yaw_deg = _pose_to_camera_world_and_minecraft_angles(best_rvec, best_tvec)
    player_y = float(cam_world[1] - 1.62)
    hfov_deg = float(np.degrees(2.0 * np.arctan((width * 0.5) / best_f)))
    vfov_deg = float(np.degrees(2.0 * np.arctan((height * 0.5) / best_f)))
    tp_command = (
        f"/tp @s {cam_world[0]:.6f} {player_y:.6f} {cam_world[2]:.6f} "
        f"{yaw_deg:.6f} {pitch_deg:.6f}"
    )

    return {
        "point_count": int(len(object_pts)),
        "inlier_count": int(len(best_inliers)),
        "image_width": int(width),
        "image_height": int(height),
        "initial_vfov_deg": float(initial_vfov_deg),
        "initial_focal_px": float(f_init),
        "optimized_focal_px": float(best_f),
        "optimized_hfov_deg": float(hfov_deg),
        "optimized_vfov_deg": float(vfov_deg),
        "reprojection_rmse_px": float(point_rmse),
        "line_rmse_px": float(line_rmse),
        "line_count": int(len(line_corr)),
        "camera_position": {
            "x": float(cam_world[0]),
            "y": float(cam_world[1]),
            "z": float(cam_world[2]),
        },
        "player_position": {
            "x": float(cam_world[0]),
            "y": float(player_y),
            "z": float(cam_world[2]),
        },
        "rotation": {
            "yaw": float(yaw_deg),
            "pitch": float(pitch_deg),
        },
        "tp_command": tp_command,
        "reprojected_lines": reprojected_lines,
    }


@app.get("/api/mcv/health")
def api_mcv_health():
    return jsonify({
        "ok": True,
        "backend": "python-cv2",
        "opencv_version": cv2.__version__,
    })


@app.post("/api/mcv")
def api_mcv():
    payload = request.get_json(silent=True) or {}
    op = payload.get("op")
    args = payload.get("args") or {}

    if op == "cv.precomputeSobel":
        try:
            return jsonify({"ok": True, "data": _precompute_sobel_cache(args)})
        except Exception as exc:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": {
                            "code": "SOBEL_CACHE_ERROR",
                            "message": str(exc),
                        },
                    }
                ),
                400,
            )
    if op == "cv.clearCache":
        try:
            return jsonify({"ok": True, "data": _clear_sobel_cache(args)})
        except Exception as exc:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": {
                            "code": "SOBEL_CACHE_CLEAR_ERROR",
                            "message": str(exc),
                        },
                    }
                ),
                400,
            )

    if op == "cv.poseSolve":
        try:
            return jsonify({"ok": True, "data": run_pose_solve(args)})
        except Exception as exc:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": {
                            "code": "POSE_SOLVE_ERROR",
                            "message": str(exc),
                        },
                    }
                ),
                400,
            )
    if op == "cv.opopRefineLine":
        try:
            return jsonify({"ok": True, "data": _opop_refine_line(args)})
        except Exception as exc:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": {
                            "code": "OPOP_REFINE_ERROR",
                            "message": str(exc),
                        },
                    }
                ),
                400,
            )

    return (
        jsonify(
            {
                "ok": False,
                "error": {
                    "code": "UNKNOWN_OP",
                    "message": f"Unsupported operation: {op}",
                },
            }
        ),
        400,
    )


@app.route("/api/mcv/cache/clear", methods=["GET", "POST"])
def api_mcv_cache_clear():
    payload = request.get_json(silent=True) or {}
    session_id = payload.get("session_id")
    if session_id is None:
        session_id = request.args.get("session_id")
    result = _clear_sobel_cache({"session_id": session_id})
    return jsonify({"ok": True, "data": result})


@app.get("/")
def index():
    return Response(HTML_PAGE, mimetype="text/html")


def parse_port(argv):
    if len(argv) < 2:
        return 8765
    try:
        return int(argv[1])
    except ValueError:
        return 8765


if __name__ == "__main__":
    host = "127.0.0.1"
    port = parse_port(sys.argv)
    url = f"http://{host}:{port}/"
    print("MinecraftCV Python standalone server is running.")
    print("Open this link in your browser:")
    print(url)
    app.run(host=host, port=port, debug=False)
