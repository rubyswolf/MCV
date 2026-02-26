const fs = require("node:fs/promises");
const path = require("node:path");
const {
  ROOT_DIR,
  DIST_DIR,
  buildCommonArtifacts,
  ensureDir,
  renderPythonStandaloneScript,
} = require("./common");

const DIST_PYTHON_DIR = path.join(DIST_DIR, "python");

function combineAbsoluteUrl(baseUrl, relativePath) {
  const safeBase = typeof baseUrl === "string" ? baseUrl.trim() : "";
  const safePath = typeof relativePath === "string" ? relativePath.trim() : "";
  if (!safeBase || !safePath) {
    return null;
  }
  try {
    return new URL(safePath, safeBase.endsWith("/") ? safeBase : `${safeBase}/`).toString();
  } catch {
    return null;
  }
}

async function buildPythonTarget(options = {}) {
  const requirementsPath = path.join(ROOT_DIR, "mcv-requirements.txt");
  const requirementsText = await fs.readFile(requirementsPath, "utf8");
  const commonConfig =
    options.commonConfig && typeof options.commonConfig === "object" ? options.commonConfig : {};

  const relativeVideoApiUrl =
    typeof commonConfig.video_api_url === "string" && commonConfig.video_api_url.trim()
      ? commonConfig.video_api_url
      : "/mcv/videos";
  const websiteUrl =
    typeof commonConfig.website_url === "string" && commonConfig.website_url.trim()
      ? commonConfig.website_url
      : "";
  const absoluteVideoApiUrl = combineAbsoluteUrl(websiteUrl, relativeVideoApiUrl);

  const commonArtifacts = await buildCommonArtifacts({
    backendMode: "python",
    videoApiUrl: absoluteVideoApiUrl || relativeVideoApiUrl,
  });
  await ensureDir(DIST_PYTHON_DIR);

  const standaloneScriptPath = path.join(DIST_PYTHON_DIR, "mcv_standalone.py");
  const standaloneScript = renderPythonStandaloneScript(commonArtifacts.inlineHtml, requirementsText);
  await fs.writeFile(standaloneScriptPath, standaloneScript, "utf8");

  return {
    distPythonDir: DIST_PYTHON_DIR,
    standaloneScriptPath,
    commonArtifacts,
  };
}

module.exports = {
  buildPythonTarget,
};
