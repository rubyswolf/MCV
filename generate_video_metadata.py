#!/usr/bin/env python3
"""
Generate MCV video frame metadata JSON using ffprobe.

Example:
  python generate_video_metadata.py "C:\\path\\to\\video.webm" --ffprobe "C:\\apps\\ffmpeg\\bin\\ffprobe.exe"
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


def _run_ffprobe(ffprobe_exe: str, args: list[str]) -> str:
  cmd = [ffprobe_exe, *args]
  result = subprocess.run(cmd, capture_output=True, text=True)
  if result.returncode != 0:
    stderr = (result.stderr or "").strip()
    stdout = (result.stdout or "").strip()
    details = stderr or stdout or f"exit code {result.returncode}"
    raise RuntimeError(f"ffprobe failed: {details}")
  return result.stdout


def _parse_ratio(value: Any) -> float | None:
  if isinstance(value, (int, float)):
    v = float(value)
    return v if v > 0 else None
  if not isinstance(value, str):
    return None
  text = value.strip()
  if not text:
    return None
  if "/" not in text:
    try:
      v = float(text)
      return v if v > 0 else None
    except ValueError:
      return None
  left, right = text.split("/", 1)
  try:
    numerator = float(left.strip())
    denominator = float(right.strip())
  except ValueError:
    return None
  if denominator <= 0:
    return None
  v = numerator / denominator
  return v if v > 0 else None


def _load_stream_info(ffprobe_exe: str, video_path: Path) -> dict[str, Any]:
  raw = _run_ffprobe(
    ffprobe_exe,
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=index,codec_name,avg_frame_rate,r_frame_rate,time_base,duration",
      "-of",
      "json",
      str(video_path),
    ],
  )
  parsed = json.loads(raw)
  streams = parsed.get("streams") or []
  if not streams:
    raise RuntimeError("No video stream found (v:0).")
  stream = streams[0]
  return {
    "index": stream.get("index"),
    "codec_name": stream.get("codec_name"),
    "avg_frame_rate": stream.get("avg_frame_rate"),
    "r_frame_rate": stream.get("r_frame_rate"),
    "time_base": stream.get("time_base"),
    "duration_seconds": float(stream["duration"]) if stream.get("duration") not in (None, "N/A") else None,
  }


def _load_frame_timestamps(ffprobe_exe: str, video_path: Path) -> list[float]:
  raw = _run_ffprobe(
    ffprobe_exe,
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "frame=best_effort_timestamp_time",
      "-of",
      "csv=p=0",
      str(video_path),
    ],
  )
  timestamps: list[float] = []
  prev = -1.0
  for line in raw.splitlines():
    text = line.strip()
    if not text:
      continue
    first = text.split(",", 1)[0].strip()
    try:
      value = float(first)
    except ValueError:
      continue
    if value < 0:
      continue
    # Keep non-decreasing order; drop out-of-order anomalies.
    if value < prev:
      continue
    prev = value
    timestamps.append(round(value, 6))
  return timestamps


def _build_metadata(video_path: Path, ffprobe_exe: str) -> dict[str, Any]:
  stream = _load_stream_info(ffprobe_exe, video_path)
  timestamps = _load_frame_timestamps(ffprobe_exe, video_path)
  if len(timestamps) < 2:
    raise RuntimeError("Could not extract enough frame timestamps from video.")

  fps_nominal = _parse_ratio(stream.get("avg_frame_rate")) or _parse_ratio(stream.get("r_frame_rate"))
  duration_seconds = stream.get("duration_seconds")
  if duration_seconds is None and timestamps:
    duration_seconds = timestamps[-1]

  deltas = [round(timestamps[i] - timestamps[i - 1], 6) for i in range(1, len(timestamps))]
  min_delta = min(deltas) if deltas else None
  max_delta = max(deltas) if deltas else None

  return {
    "schema": "mcv.video_metadata.v1",
    "generated_utc": _dt.datetime.now(tz=_dt.timezone.utc).isoformat().replace("+00:00", "Z"),
    "video_file": video_path.name,
    "video_path": str(video_path.resolve()),
    "ffprobe_path": ffprobe_exe,
    "stream": stream,
    "fps_nominal": fps_nominal,
    "frame_count": len(timestamps),
    "duration_seconds": duration_seconds,
    "delta_seconds_min": min_delta,
    "delta_seconds_max": max_delta,
    "frame_timestamps_seconds": timestamps,
  }


def main() -> int:
  parser = argparse.ArgumentParser(description="Generate MCV frame-timestamp metadata JSON from a video.")
  parser.add_argument("video", help="Input video path")
  parser.add_argument(
    "-o",
    "--output",
    help="Output JSON path (default: <video>.metadata.json next to the video)",
  )
  parser.add_argument(
    "--ffprobe",
    default="ffprobe",
    help="ffprobe executable path (default: ffprobe from PATH)",
  )
  args = parser.parse_args()

  video_path = Path(args.video).expanduser().resolve()
  if not video_path.is_file():
    print(f"Video not found: {video_path}", file=sys.stderr)
    return 1

  output_path = (
    Path(args.output).expanduser().resolve()
    if args.output
    else video_path.with_name(f"{video_path.name}.metadata.json")
  )
  output_path.parent.mkdir(parents=True, exist_ok=True)

  try:
    metadata = _build_metadata(video_path, args.ffprobe)
  except Exception as exc:  # noqa: BLE001
    print(f"Failed to generate metadata: {exc}", file=sys.stderr)
    return 1

  output_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
  print(f"Wrote metadata: {output_path}")
  print(
    "Summary: "
    f"frames={metadata['frame_count']}, "
    f"fps_nominal={metadata.get('fps_nominal')}, "
    f"duration_seconds={metadata.get('duration_seconds')}"
  )
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
