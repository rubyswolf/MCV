const fs = require("node:fs/promises");
const path = require("node:path");
const esbuild = require("esbuild");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const SRC_DIR = path.join(ROOT_DIR, "src");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const DIST_COMMON_DIR = path.join(DIST_DIR, "common");

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function buildCommonArtifacts() {
  const options = arguments[0] || {};
  const backendMode = options.backendMode === "web" ? "web" : "python";
  const opencvUrl =
    typeof options.opencvUrl === "string" && options.opencvUrl.trim()
      ? options.opencvUrl
      : "/opencv.js";
  const mediaApiUrl =
    typeof options.mediaApiUrl === "string"
      ? options.mediaApiUrl
      : "";
  const dataApiUrl =
    typeof options.dataApiUrl === "string"
      ? options.dataApiUrl
      : "";

  await ensureDir(DIST_COMMON_DIR);

  const appEntry = path.join(SRC_DIR, "app.ts");
  const htmlTemplatePath = path.join(SRC_DIR, "template.html");
  const appBundlePath = path.join(DIST_COMMON_DIR, "app.bundle.js");
  const inlineHtmlPath = path.join(DIST_COMMON_DIR, "index.inline.html");

  const result = await esbuild.build({
    entryPoints: [appEntry],
    bundle: true,
    minify: true,
    format: "iife",
    platform: "browser",
    target: ["es2020"],
    legalComments: "none",
    write: false,
    logLevel: "silent",
    define: {
      __MCV_BACKEND__: JSON.stringify(backendMode),
      __MCV_OPENCV_URL__: JSON.stringify(opencvUrl),
      __MCV_MEDIA_API_URL__: JSON.stringify(mediaApiUrl),
      __MCV_DATA_API_URL__: JSON.stringify(dataApiUrl),
    },
  });

  const appBundle = result.outputFiles[0].text;
  await fs.writeFile(appBundlePath, appBundle, "utf8");

  const template = await fs.readFile(htmlTemplatePath, "utf8");
  const bodyStyleBlock =
    backendMode === "web"
      ? [
          "      background: transparent;",
          "      min-height: 100vh;",
          "      display: grid;",
          "      place-items: center;",
          "      padding: 24px;",
        ].join("\n")
      : [
          "      background: radial-gradient(1200px 600px at 30% -10%, #233247, var(--bg));",
          "      min-height: 100vh;",
          "      display: grid;",
          "      place-items: center;",
          "      padding: 24px;",
        ].join("\n");
  const safeInlineBundle = appBundle.replace(/<\/script/gi, "<\\/script");
  const backendScripts =
    backendMode === "web"
      ? `<script src="${opencvUrl.replace(/"/g, "&quot;")}"></script>`
      : "";
  const inlineHtml = template
    .replace("__MCV_BODY_STYLE__", () => bodyStyleBlock)
    .replace("__BACKEND_SCRIPTS__", () => backendScripts)
    .replace("__APP_JS__", () => safeInlineBundle);
  await fs.writeFile(inlineHtmlPath, inlineHtml, "utf8");

  return {
    rootDir: ROOT_DIR,
    distDir: DIST_DIR,
    distCommonDir: DIST_COMMON_DIR,
    appBundlePath,
    inlineHtmlPath,
    appBundle,
    inlineHtml,
  };
}

function renderPythonStandaloneScript(inlineHtml, requirementsText) {
  const htmlAsPythonString = JSON.stringify(inlineHtml);
  const requirementsAsPythonString = JSON.stringify(requirementsText);
  return `#!/usr/bin/env python3
import sys
from pathlib import Path
import base64
import time

REQUIREMENTS_FILENAME = "mcv-requirements.txt"
REQUIREMENTS_TEXT = ${requirementsAsPythonString}


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

HTML_PAGE = ${htmlAsPythonString}

app = Flask(__name__)


def parse_positive_float(value, default_value):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return float(default_value)
    if parsed < 0:
        return 0.0
    return parsed


def decode_image_data_url_to_bgr(image_data_url):
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


def encode_png_data_url(image):
    ok, encoded = cv2.imencode(".png", image)
    if not ok:
        raise ValueError("Failed to encode PNG")
    payload = base64.b64encode(encoded.tobytes()).decode("ascii")
    return f"data:image/png;base64,{payload}"


def run_pipeline(args):
    started_at = time.time()
    image_data_url = args.get("image_data_url")
    image_bgr = decode_image_data_url_to_bgr(image_data_url)
    gray = np.mean(image_bgr, axis=2).astype(np.uint8)
    if not hasattr(cv2, "createLineSegmentDetector"):
        raise ValueError("LineSegmentDetector is unavailable in this OpenCV build")
    lsd = cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD)
    detect_result = lsd.detect(gray)
    lines = detect_result[0] if isinstance(detect_result, tuple) else detect_result
    line_segments = []
    if lines is not None:
        for raw in lines[:, 0, :]:
            line_segments.append(
                [
                    float(raw[0]),
                    float(raw[1]),
                    float(raw[2]),
                    float(raw[3]),
                ]
            )
    duration_ms = int((time.time() - started_at) * 1000)
    return {
        "grayscale_image_data_url": encode_png_data_url(gray),
        "line_segments": line_segments,
        "width": int(gray.shape[1]),
        "height": int(gray.shape[0]),
        "duration_ms": duration_ms,
    }


def handle_mcv_cv_opencv_test(_args):
    rgb = np.array([[[255, 0, 0], [0, 255, 0], [0, 0, 255]]], dtype=np.uint8)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    return {
        "opencv_version": cv2.__version__,
        "gray_values": gray.reshape(-1).tolist(),
        "shape": [int(gray.shape[0]), int(gray.shape[1])],
        "mean_gray": float(np.mean(gray)),
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

    if op == "cv.opencvTest":
        return jsonify({"ok": True, "data": handle_mcv_cv_opencv_test(args)})

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


@app.post("/api/mcv/pipeline")
def api_mcv_pipeline():
    payload = request.get_json(silent=True) or {}
    args = payload.get("args") or {}
    image_data_url = args.get("image_data_url")
    if not isinstance(image_data_url, str) or not image_data_url.strip():
        return (
            jsonify(
                {
                    "ok": False,
                    "error": {
                        "code": "INVALID_ARGS",
                        "message": "image_data_url is required",
                    },
                }
            ),
            400,
        )

    try:
        result = run_pipeline(args)
    except Exception as exc:
        return (
            jsonify(
                {
                    "ok": False,
                    "error": {
                        "code": "PIPELINE_ERROR",
                        "message": str(exc),
                    },
                }
            ),
            400,
        )

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
`;
}

module.exports = {
  ROOT_DIR,
  DIST_DIR,
  DIST_COMMON_DIR,
  ensureDir,
  buildCommonArtifacts,
  renderPythonStandaloneScript,
};
