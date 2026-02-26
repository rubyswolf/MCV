const fs = require("node:fs/promises");
const path = require("node:path");
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
      sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"
    />
  );
}
`;
}

async function copyToDestination(destDir, artifacts) {
  const resolvedDest = path.resolve(destDir);
  await ensureDir(resolvedDest);

  const copied = [];

  const commonTargets = [
    [artifacts.reactComponentPath, path.join(resolvedDest, "MCV.tsx")],
  ];

  for (const [src, dst] of commonTargets) {
    await fs.copyFile(src, dst);
    copied.push(dst);
  }

  return { resolvedDest, copied };
}

async function syncDestinations(destinations, artifacts) {
  const results = [];
  for (const destination of destinations) {
    const syncResult = await copyToDestination(destination, artifacts);
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

async function syncWebConfigDestinations(webConfig, artifacts) {
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
    syncMap.set(componentDest, [destinationPath]);
  }

  const opencvDest = resolveConfiguredPath(siteRoot, webConfig.opencv_dest);
  if (opencvDest) {
    await ensureDir(opencvDest);
    const opencvSource =
      (typeof webConfig.opencv_source === "string" && webConfig.opencv_source.trim()
        ? path.resolve(webConfig.opencv_source)
        : path.join(ROOT_DIR, "build", "opencv_js_mcv_single", "bin", "opencv.js"));
    const opencvFilename = path.basename(
      (typeof webConfig.opencv_url === "string" && webConfig.opencv_url.trim()) || "/opencv.js"
    );
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
  const opencvUrl =
    options.webConfig &&
    typeof options.webConfig.opencv_url === "string" &&
    options.webConfig.opencv_url.trim()
      ? options.webConfig.opencv_url
      : "/opencv.js";

  const commonArtifacts = await buildCommonArtifacts({
    backendMode: "web",
    opencvUrl,
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
    const configuredSync = await syncWebConfigDestinations(options.webConfig, artifacts);
    destinationSync.push(...configuredSync);
  }
  if (destinationList.length > 0) {
    const uniqueDestinations = [...new Set(destinationList)];
    const fallbackSync = await syncDestinations(uniqueDestinations, artifacts);
    destinationSync.push(...fallbackSync);
  }

  return {
    distWebDir: DIST_WEB_DIR,
    webHtmlPath,
    reactComponentPath,
    commonArtifacts,
    destinationSync,
  };
}

module.exports = {
  buildWebTarget,
};
