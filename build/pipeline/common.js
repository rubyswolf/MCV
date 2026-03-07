const fs = require("node:fs/promises");
const path = require("node:path");
const esbuild = require("esbuild");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const SRC_DIR = path.join(ROOT_DIR, "src");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const DIST_COMMON_DIR = path.join(DIST_DIR, "common");
const PYTHON_STANDALONE_TEMPLATE_PATH = path.join(__dirname, "pythonStandalone.template.py");

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
  const cssTemplatePath = path.join(SRC_DIR, "template.css");
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
  const cssTemplate = await fs.readFile(cssTemplatePath, "utf8");
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
  const css = cssTemplate.replace("__MCV_BODY_STYLE__", () => bodyStyleBlock);
  const inlineHtml = template
    .replace("__MCV_CSS__", () => css)
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyPythonTemplateInsertions(templateText, insertions) {
  let rendered = templateText;

  for (const [name, value] of Object.entries(insertions)) {
    const markerPattern = new RegExp(
      `^([\\t ]*)#\\s*@mcv-insert\\s+${escapeRegExp(name)}\\s*$`,
      "m"
    );
    if (!markerPattern.test(rendered)) {
      throw new Error(`Missing python template insertion marker: ${name}`);
    }
    rendered = rendered.replace(markerPattern, `$1${name} = ${value}`);
  }

  const unresolvedMarkers = rendered.match(
    /^[\t ]*#\s*@mcv-insert\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/gm
  );
  if (unresolvedMarkers && unresolvedMarkers.length > 0) {
    throw new Error(
      `Unresolved python template insertion marker(s): ${unresolvedMarkers.join(", ")}`
    );
  }

  return rendered;
}

async function renderPythonStandaloneScript(inlineHtml, requirementsText) {
  const templateText = await fs.readFile(PYTHON_STANDALONE_TEMPLATE_PATH, "utf8");
  return applyPythonTemplateInsertions(templateText, {
    REQUIREMENTS_TEXT: JSON.stringify(requirementsText),
    HTML_PAGE: JSON.stringify(inlineHtml),
  });
}

module.exports = {
  ROOT_DIR,
  DIST_DIR,
  DIST_COMMON_DIR,
  ensureDir,
  buildCommonArtifacts,
  renderPythonStandaloneScript,
};
