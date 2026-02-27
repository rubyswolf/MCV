const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { ROOT_DIR, DIST_DIR, buildCommonArtifacts, ensureDir } = require("./common");

const DIST_WEB_DIR = path.join(DIST_DIR, "web");

function escapeForTemplateLiteral(input) {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function renderReactWrapperTsx(inlineHtml) {
  const htmlLiteral = escapeForTemplateLiteral(inlineHtml);
  return `"use client";

import React from "react";

const MCV_HTML = \`${htmlLiteral}\`;

export type MCVProps = {
  className?: string;
  style?: React.CSSProperties;
  title?: string;
};

export default function MCV(props: MCVProps) {
  const { className, style, title = "MinecraftCV" } = props;
  return (
    <iframe
      title={title}
      className={className}
      style={{ width: "100%", minHeight: 480, border: 0, ...style }}
      srcDoc={MCV_HTML}
      sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox"
    />
  );
}
`;
}

let prettierModulePromise = null;

async function getPrettierModule() {
  if (prettierModulePromise) {
    return prettierModulePromise;
  }
  prettierModulePromise = (async () => {
    try {
      return await import("prettier");
    } catch {
      return null;
    }
  })();
  return prettierModulePromise;
}

function findNearestPackageRoot(startPath) {
  let currentDir = path.dirname(startPath);
  const root = path.parse(currentDir).root;
  while (true) {
    const packageJson = path.join(currentDir, "package.json");
    try {
      // eslint-disable-next-line no-sync
      require("node:fs").accessSync(packageJson);
      return currentDir;
    } catch {
      // continue
    }
    if (currentDir === root) {
      return null;
    }
    currentDir = path.dirname(currentDir);
  }
}

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: true,
      stdio: "ignore",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed: ${command} ${args.join(" ")} (exit ${code})`));
      }
    });
  });
}

async function maybePrettierWriteViaCli(filePath) {
  const cwd = findNearestPackageRoot(filePath) || path.dirname(filePath);
  const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
  const targetPath = path.relative(cwd, filePath) || path.basename(filePath);
  await runCommand(npxCommand, ["prettier", "--write", targetPath], cwd);
  return { available: true, wrote: true };
}

function resolvePrettierApi(prettierModule) {
  if (!prettierModule) {
    return null;
  }
  return prettierModule.default || prettierModule;
}

async function maybePrettierWrite(filePath) {
  const prettierApi = resolvePrettierApi(await getPrettierModule());
  if (!prettierApi) {
    try {
      return await maybePrettierWriteViaCli(filePath);
    } catch {
      return { available: false, wrote: false };
    }
  }

  const current = await fs.readFile(filePath, "utf8");
  const resolvedConfig = (await prettierApi.resolveConfig(filePath)) || {};
  const formatOptions = {
    ...resolvedConfig,
    filepath: filePath,
  };
  const formatted = await prettierApi.format(current, formatOptions);

  if (formatted !== current) {
    await fs.writeFile(filePath, formatted, "utf8");
  }

  return { available: true, wrote: true };
}

function createPrettierSummary() {
  return {
    available: false,
    writtenFiles: 0,
  };
}

function mergePrettierSummary(summary, result) {
  if (!result) {
    return;
  }
  summary.available = summary.available || Boolean(result.available);
  if (result.wrote) {
    summary.writtenFiles += 1;
  }
}

async function copyToDestination(destDir, artifacts, prettierSummary) {
  const resolvedDest = path.resolve(destDir);
  await ensureDir(resolvedDest);

  const copied = [];

  const commonTargets = [
    [artifacts.reactComponentPath, path.join(resolvedDest, "MCV.tsx")],
  ];

  for (const [src, dst] of commonTargets) {
    await fs.copyFile(src, dst);
    mergePrettierSummary(prettierSummary, await maybePrettierWrite(dst));
    copied.push(dst);
  }

  return { resolvedDest, copied };
}

async function syncDestinations(destinations, artifacts, prettierSummary) {
  const results = [];
  for (const destination of destinations) {
    const syncResult = await copyToDestination(destination, artifacts, prettierSummary);
    results.push(syncResult);
  }
  return results;
}

function resolveConfiguredPath(baseRoot, configuredPath) {
  if (!configuredPath || typeof configuredPath !== "string") {
    return null;
  }
  const isDriveAbsolute = /^[A-Za-z]:[\\/]/.test(configuredPath);
  const isNetworkAbsolute = /^\\\\/.test(configuredPath);
  const isRootRelative = /^[\\/]/.test(configuredPath) && !isDriveAbsolute && !isNetworkAbsolute;

  if (isRootRelative && baseRoot) {
    const normalizedRelative = configuredPath.replace(/^[\\/]+/, "");
    return path.resolve(baseRoot, normalizedRelative);
  }
  if (path.isAbsolute(configuredPath)) {
    return path.resolve(configuredPath);
  }
  const normalizedRelative = configuredPath.replace(/^[\\/]+/, "");
  if (!baseRoot) {
    return path.resolve(normalizedRelative);
  }
  return path.resolve(baseRoot, normalizedRelative);
}

function resolveOpencvOutputFilename(opencvUrl) {
  const rawValue = typeof opencvUrl === "string" && opencvUrl.trim() ? opencvUrl.trim() : "/opencv.js";
  try {
    const parsed = new URL(rawValue, "https://local.invalid");
    const candidate = path.basename(parsed.pathname || "");
    return candidate || "opencv.js";
  } catch {
    const candidate = path.basename(rawValue.split("?")[0].split("#")[0]);
    return candidate || "opencv.js";
  }
}

async function syncWebConfigDestinations(webConfig, artifacts, prettierSummary) {
  const syncMap = new Map();
  const siteRoot =
    typeof webConfig.site_root === "string" && webConfig.site_root.trim()
      ? path.resolve(webConfig.site_root)
      : null;

  const componentDest = resolveConfiguredPath(siteRoot, webConfig.component_dest);
  if (componentDest) {
    await ensureDir(componentDest);
    const destinationPath = path.join(componentDest, "MCV.tsx");
    await fs.copyFile(artifacts.reactComponentPath, destinationPath);
    mergePrettierSummary(prettierSummary, await maybePrettierWrite(destinationPath));
    syncMap.set(componentDest, [destinationPath]);
  }

  const opencvDest = resolveConfiguredPath(siteRoot, webConfig.opencv_dest);
  if (opencvDest) {
    await ensureDir(opencvDest);
    const opencvSource =
      (typeof webConfig.opencv_source === "string" && webConfig.opencv_source.trim()
        ? path.resolve(webConfig.opencv_source)
        : path.join(ROOT_DIR, "build", "opencv_js_mcv_single", "bin", "opencv.js"));
    const opencvFilename = resolveOpencvOutputFilename(webConfig.opencv_url);
    const destinationPath = path.join(opencvDest, opencvFilename || "opencv.js");
    await fs.copyFile(opencvSource, destinationPath);
    const existing = syncMap.get(opencvDest) || [];
    existing.push(destinationPath);
    syncMap.set(opencvDest, existing);
  }

  return Array.from(syncMap.entries()).map(([resolvedDest, copied]) => ({
    resolvedDest,
    copied,
  }));
}

async function buildWebTarget(options = {}) {
  const webConfig = options.webConfig && typeof options.webConfig === "object" ? options.webConfig : {};
  const commonConfig =
    options.commonConfig && typeof options.commonConfig === "object" ? options.commonConfig : {};
  const opencvUrl =
    typeof webConfig.opencv_url === "string" && webConfig.opencv_url.trim()
      ? webConfig.opencv_url
      : "/opencv.js";
  const mediaApiUrl =
    typeof commonConfig.media_api === "string" && commonConfig.media_api.trim()
      ? commonConfig.media_api
      : "";
  const dataApiUrl =
    typeof commonConfig.data_api === "string" && commonConfig.data_api.trim()
      ? commonConfig.data_api
      : "";

  const prettierSummary = createPrettierSummary();

  const commonArtifacts = await buildCommonArtifacts({
    backendMode: "web",
    opencvUrl,
    mediaApiUrl,
    dataApiUrl,
  });
  await ensureDir(DIST_WEB_DIR);

  const webHtmlPath = path.join(DIST_WEB_DIR, "index.html");
  await fs.writeFile(webHtmlPath, commonArtifacts.inlineHtml, "utf8");
  const reactComponentPath = path.join(DIST_WEB_DIR, "MCV.tsx");
  await fs.writeFile(
    reactComponentPath,
    renderReactWrapperTsx(commonArtifacts.inlineHtml),
    "utf8"
  );
  mergePrettierSummary(prettierSummary, await maybePrettierWrite(reactComponentPath));

  const artifacts = {
    commonArtifacts,
    webHtmlPath,
    reactComponentPath,
  };

  const destinationList = [];
  if (Array.isArray(options.destinations)) {
    for (const dest of options.destinations) {
      if (typeof dest === "string" && dest.trim()) {
        destinationList.push(dest);
      }
    }
  }
  if (options.destinationDir) {
    destinationList.push(options.destinationDir);
  }

  let destinationSync = [];
  if (options.webConfig && typeof options.webConfig === "object") {
    const configuredSync = await syncWebConfigDestinations(options.webConfig, artifacts, prettierSummary);
    destinationSync.push(...configuredSync);
  }
  if (destinationList.length > 0) {
    const uniqueDestinations = [...new Set(destinationList)];
    const fallbackSync = await syncDestinations(uniqueDestinations, artifacts, prettierSummary);
    destinationSync.push(...fallbackSync);
  }

  return {
    distWebDir: DIST_WEB_DIR,
    webHtmlPath,
    reactComponentPath,
    commonArtifacts,
    destinationSync,
    prettier: prettierSummary,
  };
}

module.exports = {
  buildWebTarget,
};
