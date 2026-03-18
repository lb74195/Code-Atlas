import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "../src/config.js";
import { analyzeDependencies } from "../src/dependency-analysis.js";
import { writeArtifacts } from "../src/docs.js";
import { listSourceFiles } from "../src/files.js";
import { buildGraph } from "../src/graph.js";
import { analyzeSources } from "../src/source-analysis.js";
import { attachAdvisoryOccurrences } from "../src/upgrade-impact.js";

const fixtureDir = path.resolve("test/fixtures/sample-app");
const rules = JSON.parse(fs.readFileSync(path.resolve("data/upgrade-advisories.json"), "utf8"));

test("analyzes a sample frontend app and emits docs", () => {
  const config = loadConfig(fixtureDir, path.join(fixtureDir, "context-graph.config.json"));
  const files = listSourceFiles(fixtureDir, config);
  const dependencyReport = analyzeDependencies(fixtureDir, config, rules);
  const sourceReport = analyzeSources(fixtureDir, files);
  dependencyReport.advisories = attachAdvisoryOccurrences(fixtureDir, files, dependencyReport.advisories);
  const graph = buildGraph(fixtureDir, config, dependencyReport, sourceReport);
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "fcg-test-"));

  writeArtifacts(fixtureDir, path.relative(fixtureDir, outputDir), config, dependencyReport, sourceReport, graph);

  assert.equal(files.length, 4);
  assert.ok(dependencyReport.advisories.some((advisory) => advisory.packageName === "next"));
  assert.ok(
    dependencyReport.advisories.some(
      (advisory) => advisory.packageName === "next" && advisory.occurrences.some((hit) => hit.filePath === "app/page.tsx")
    )
  );
  assert.ok(sourceReport.routes.some((route) => route.routeType === "next-app-page"));
  assert.ok(graph.nodes.some((node) => node.kind === "advisory"));
  assert.ok(fs.existsSync(path.join(outputDir, "llms.txt")));
  assert.ok(fs.existsSync(path.join(outputDir, "overview.md")));
  assert.ok(fs.existsSync(path.join(outputDir, "dependencies.md")));
  assert.ok(fs.existsSync(path.join(outputDir, "playbooks", "upgrades", "next.md")));
  assert.match(
    fs.readFileSync(path.join(outputDir, "playbooks", "upgrades", "next.md"), "utf8"),
    /app\/page\.tsx:6/
  );
});
