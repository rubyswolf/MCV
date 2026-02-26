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
  const videoApiUrl =
    typeof options.videoApiUrl === "string" && options.videoApiUrl.trim()
      ? options.videoApiUrl
      : "/mcv/videos";

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
      __MCV_VIDEO_API_URL__: JSON.stringify(videoApiUrl),
    },
  });

  const appBundle = result.outputFiles[0].text;
  await fs.writeFile(appBundlePath, appBundle, "utf8");

  const template = await fs.readFile(htmlTemplatePath, "utf8");
  const safeInlineBundle = appBundle.replace(/<\/script/gi, "<\\/script");
  const backendScripts =
    backendMode === "web"
      ? `<script src="${opencvUrl.replace(/"/g, "&quot;")}"></script>`
      : "";
  const inlineHtml = template
    .replace("__BACKEND_SCRIPTS__", backendScripts)
    .replace("__APP_JS__", safeInlineBundle);
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
