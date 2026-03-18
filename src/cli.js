#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { loadConfig, validateConfig } from "./config.js";
import { analyzeDependencies } from "./dependency-analysis.js";
import { writeArtifacts } from "./docs.js";
import { listSourceFiles } from "./files.js";
import { buildGraph } from "./graph.js";
import { analyzeSources } from "./source-analysis.js";
import { attachAdvisoryOccurrences } from "./upgrade-impact.js";

const argv = process.argv.slice(2);
const command = argv[0];

if (command === "analyze") {
  runAnalyze(argv.slice(1));
} else if (command === "validate-config") {
  runValidateConfig(argv.slice(1));
} else {
  printHelp();
  process.exitCode = 1;
}

function runAnalyze(args) {
  const rootDir = path.resolve(args[0] ?? ".");
  const outputDir = readFlag(args, "--output") ?? "ai";
  const configPath = readFlag(args, "--config");
  const config = loadConfig(rootDir, configPath ? path.resolve(configPath) : null);
  const configErrors = validateConfig(config);

  if (configErrors.length > 0) {
    console.error("Invalid config:");
    for (const error of configErrors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  const rules = JSON.parse(
    fs.readFileSync(new URL("../data/upgrade-advisories.json", import.meta.url), "utf8")
  );
  const files = listSourceFiles(rootDir, config);
  const dependencyReport = analyzeDependencies(rootDir, config, rules);
  const sourceReport = analyzeSources(rootDir, files);
  dependencyReport.advisories = attachAdvisoryOccurrences(rootDir, files, dependencyReport.advisories);
  const graph = buildGraph(rootDir, config, dependencyReport, sourceReport);
  const outputPath = writeArtifacts(rootDir, outputDir, config, dependencyReport, sourceReport, graph);

  console.log(JSON.stringify({
    rootDir,
    outputPath,
    filesAnalyzed: files.length,
    advisories: dependencyReport.advisories.length,
    graphNodes: graph.nodes.length,
    graphEdges: graph.edges.length
  }, null, 2));
}

function runValidateConfig(args) {
  const rootDir = path.resolve(args[0] ?? ".");
  const config = loadConfig(rootDir, null);
  const errors = validateConfig(config);

  if (errors.length > 0) {
    console.error("Config validation failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log("Config is valid.");
}

function readFlag(args, flagName) {
  const index = args.indexOf(flagName);
  if (index === -1) {
    return null;
  }
  return args[index + 1] ?? null;
}

function printHelp() {
  console.log(`Usage:
  node ./src/cli.js analyze [path] [--output ai] [--config path]
  node ./src/cli.js validate-config [path]
`);
}
