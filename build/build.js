const { buildPythonTarget } = require("./pipeline/pythonTarget");
const { buildWebTarget } = require("./pipeline/webTarget");
const fs = require("node:fs/promises");
const path = require("node:path");

function parseOption(argv, key) {
  const keyEquals = `--${key}=`;
  const keyFlag = `--${key}`;
  const direct = argv.find((arg) => arg.startsWith(keyEquals));
  if (direct) {
    return direct.slice(keyEquals.length);
  }
  const idx = argv.indexOf(keyFlag);
  if (idx >= 0 && idx + 1 < argv.length) {
    return argv[idx + 1];
  }
  return null;
}

function parsePositionals(argv, knownValueOptions) {
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const optionName = arg.includes("=") ? arg.slice(2, arg.indexOf("=")) : arg.slice(2);
      if (!arg.includes("=") && knownValueOptions.has(optionName)) {
        i += 1;
      }
      continue;
    }
    positionals.push(arg);
  }
  return positionals;
}

function printResult(title, result, extraLabel, extraPath) {
  console.log(`${title} complete.`);
  console.log("Common artifacts:");
  console.log(`- ${result.commonArtifacts.appBundlePath}`);
  console.log(`- ${result.commonArtifacts.inlineHtmlPath}`);
  console.log(`${extraLabel}:`);
  console.log(`- ${extraPath}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const target = parseOption(argv, "target");
  const knownValueOptions = new Set(["target", "dest", "config"]);
  const positionals = parsePositionals(argv, knownValueOptions);
  const destinationDir = parseOption(argv, "dest") || (target === "web" ? positionals[0] ?? null : null);
  const configPath = parseOption(argv, "config") || path.join(__dirname, "config.json");

  let rootConfig = { common: {}, web: {}, python: {} };
  try {
    const configRaw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(configRaw);
    rootConfig = {
      common: parsed && typeof parsed.common === "object" ? parsed.common : {},
      web: parsed && typeof parsed.web === "object" ? parsed.web : {},
      python: parsed && typeof parsed.python === "object" ? parsed.python : {},
    };
  } catch (error) {
    if (!error || error.code !== "ENOENT") {
      throw error;
    }
  }

  if (target === "python") {
    const result = await buildPythonTarget({
      commonConfig: rootConfig.common,
      pythonConfig: rootConfig.python,
    });
    printResult("Python build", result, "Python standalone", result.standaloneScriptPath);
    return;
  }

  if (target === "web") {
    const webConfig = rootConfig.web;
    const commonConfig = rootConfig.common;
    let configuredDestinations = [];
    if (Array.isArray(webConfig.destinations)) {
      configuredDestinations = webConfig.destinations.filter(
          (value) => typeof value === "string" && value.trim()
        );
    }

    const result = await buildWebTarget({
      destinationDir,
      destinations: configuredDestinations,
      webConfig,
      commonConfig,
    });
    printResult("Web build", result, "Web target placeholder", result.webHtmlPath);
    console.log("React wrapper:");
    console.log(`- ${result.reactComponentPath}`);
    if (result.destinationSync.length > 0) {
      console.log("Synced destinations:");
      for (const syncResult of result.destinationSync) {
        console.log(`- ${syncResult.resolvedDest}`);
        for (const file of syncResult.copied) {
          console.log(`  - ${file}`);
        }
      }
    }
    return;
  }

  console.error("Invalid or missing target.");
  console.error("Usage: node build/build.js --target python");
  console.error("   or: node build/build.js --target web [--dest <folder>]");
  console.error("   or: node build/build.js --target web [--config <path-to-config.json>]");
  console.error("   or: npm run build:web -- <folder>");
  process.exit(1);
}

main().catch((error) => {
  console.error("build/build.js failed");
  console.error(error);
  process.exit(1);
});
