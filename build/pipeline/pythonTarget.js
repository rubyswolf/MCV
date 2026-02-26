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

async function buildPythonTarget() {
  const requirementsPath = path.join(ROOT_DIR, "mcv-requirements.txt");
  const requirementsText = await fs.readFile(requirementsPath, "utf8");

  const commonArtifacts = await buildCommonArtifacts({
    backendMode: "python",
    videoApiUrl: "/mcv/videos",
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
