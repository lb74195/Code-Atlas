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
const workspaceFixtureDir = path.resolve("test/fixtures/sample-workspace");
const rules = JSON.parse(fs.readFileSync(path.resolve("data/upgrade-advisories.json"), "utf8"));

test("analyzes a sample frontend app and emits docs", () => {
  const config = loadConfig(fixtureDir, path.join(fixtureDir, "context-graph.config.json"));
  const files = listSourceFiles(fixtureDir, config);
  const dependencyReport = analyzeDependencies(fixtureDir, config, rules);
  const sourceReport = analyzeSources(fixtureDir, files);
  dependencyReport.advisories = attachAdvisoryOccurrences(fixtureDir, files, dependencyReport.advisories, sourceReport);
  const graph = buildGraph(fixtureDir, config, dependencyReport, sourceReport);
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "fcg-test-"));

  writeArtifacts(fixtureDir, path.relative(fixtureDir, outputDir), config, dependencyReport, sourceReport, graph);

  assert.equal(files.length, 4);
  assert.ok(dependencyReport.advisories.some((advisory) => advisory.packageName === "next"));
  assert.ok(
    dependencyReport.advisories.some(
      (advisory) =>
        advisory.packageName === "next" &&
        advisory.occurrences.some((hit) => hit.filePath === "app/page.tsx" && hit.symbolName === "HomePage")
    )
  );
  assert.ok(sourceReport.routes.some((route) => route.routeType === "next-app-page"));
  assert.ok(graph.nodes.some((node) => node.kind === "advisory"));
  assert.ok(graph.edges.some((edge) => edge.kind === "AFFECTS_SYMBOL" && edge.to === "symbol:app/page.tsx:HomePage"));
  assert.ok(fs.existsSync(path.join(outputDir, "llms.txt")));
  assert.ok(fs.existsSync(path.join(outputDir, "overview.md")));
  assert.ok(fs.existsSync(path.join(outputDir, "dependencies.md")));
  assert.ok(fs.existsSync(path.join(outputDir, "evaluation.md")));
  assert.ok(fs.existsSync(path.join(outputDir, "evaluation.json")));
  assert.ok(fs.existsSync(path.join(outputDir, "playbooks", "upgrades", "next.md")));
  assert.match(
    fs.readFileSync(path.join(outputDir, "playbooks", "upgrades", "next.md"), "utf8"),
    /HomePage/
  );
  assert.match(
    fs.readFileSync(path.join(outputDir, "playbooks", "upgrades", "next.md"), "utf8"),
    /await cookies\(\)/
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(outputDir, "evaluation.json"), "utf8")).grade,
    "A"
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(outputDir, "evaluation.json"), "utf8")).metrics.largeModules,
    0
  );
});

test("discovers workspace source roots and resolves workspace package imports", () => {
  const config = loadConfig(workspaceFixtureDir, null);
  const files = listSourceFiles(workspaceFixtureDir, config);
  const sourceReport = analyzeSources(workspaceFixtureDir, files, config);
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "fcg-workspace-test-"));
  const graph = buildGraph(workspaceFixtureDir, config, {
    packageJsonPath: path.join(workspaceFixtureDir, "package.json"),
    packageManager: "pnpm@10.5.0",
    runtime: { requested: ">=20", currentMajor: 20, targetMajor: null },
    dependencies: [],
    advisories: []
  }, sourceReport);

  writeArtifacts(workspaceFixtureDir, path.relative(workspaceFixtureDir, outputDir), config, {
    packageJsonPath: path.join(workspaceFixtureDir, "package.json"),
    packageManager: "pnpm@10.5.0",
    runtime: { requested: ">=20", currentMajor: 20, targetMajor: null },
    dependencies: [],
    advisories: []
  }, sourceReport, graph);

  assert.equal(files.length, 5);
  assert.ok(sourceReport.files.some((file) => file.path === "apps/web/src/main.tsx"));
  assert.ok(sourceReport.files.some((file) => file.path === "packages/ui/Button.tsx"));
  assert.ok(sourceReport.files.some((file) => file.path === "packages/utils/index.ts"));
  assert.ok(sourceReport.files.some((file) => file.path === "apps/web/src/helpers/label.ts"));
  assert.ok(sourceReport.files.some((file) => file.path === "apps/web/src/helpers/common.util.ts"));
  assert.ok(
    sourceReport.importEdges.some(
      (edge) => edge.from === "file:apps/web/src/main.tsx" && edge.to === "file:packages/ui/Button.tsx"
    )
  );
  assert.ok(
    sourceReport.importEdges.some(
      (edge) => edge.from === "file:apps/web/src/main.tsx" && edge.to === "file:apps/web/src/styles.module.css"
    )
  );
  assert.ok(
    sourceReport.importEdges.some(
      (edge) => edge.from === "file:apps/web/src/main.tsx" && edge.to === "file:apps/web/src/locales/en.json"
    )
  );
  assert.ok(
    sourceReport.importEdges.some(
      (edge) => edge.from === "file:apps/web/src/main.tsx" && edge.to === "file:apps/web/src/assets/logo.svg"
    )
  );
  assert.ok(
    sourceReport.callEdges.some(
      (edge) => edge.from === "file:apps/web/src/main.tsx" && edge.to === "symbol:packages/utils/index.ts:formatLabel"
    )
  );
  assert.ok(
    sourceReport.callEdges.some(
      (edge) => edge.from === "file:apps/web/src/main.tsx" && edge.to === "symbol:apps/web/src/helpers/label.ts:formatAlias"
    )
  );
  assert.ok(
    sourceReport.callEdges.some(
      (edge) => edge.from === "file:apps/web/src/main.tsx" && edge.to === "symbol:apps/web/src/helpers/common.util.ts:formatPseudoExt"
    )
  );
  assert.ok(
    sourceReport.componentEdges.some(
      (edge) => edge.from === "file:apps/web/src/main.tsx" && edge.to === "symbol:packages/ui/Button.tsx:Button"
    )
  );
  assert.ok(fs.existsSync(path.join(outputDir, "modules", "apps-web.md")));
  assert.ok(fs.existsSync(path.join(outputDir, "modules", "packages-ui.md")));
  assert.match(fs.readFileSync(path.join(outputDir, "llms.txt"), "utf8"), /modules\/apps-web\.md/);
  assert.match(fs.readFileSync(path.join(outputDir, "modules", "apps-web.md"), "utf8"), /Depends on Modules/);
  assert.match(fs.readFileSync(path.join(outputDir, "modules", "apps-web.md"), "utf8"), /packages\/ui/);
  assert.match(fs.readFileSync(path.join(outputDir, "modules", "packages-ui.md"), "utf8"), /Used by Modules/);
  assert.match(fs.readFileSync(path.join(outputDir, "modules", "packages-ui.md"), "utf8"), /apps\/web/);
  assert.ok(graph.nodes.some((node) => node.kind === "resource" && node.path === "apps/web/src/styles.module.css"));
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(outputDir, "evaluation.json"), "utf8")).metrics.moduleDocsPresent,
    3
  );
});
