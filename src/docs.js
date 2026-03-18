import fs from "node:fs";
import path from "node:path";

import { buildDisclosureEvaluation } from "./disclosure-evaluation.js";

const MAX_MODULE_FILES = 40;

export function writeArtifacts(rootDir, outputDirName, config, dependencyReport, sourceReport, graph) {
  const outputDir = path.isAbsolute(outputDirName) ? outputDirName : path.join(rootDir, outputDirName);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.join(outputDir, "modules"), { recursive: true });
  fs.mkdirSync(path.join(outputDir, "playbooks"), { recursive: true });
  fs.mkdirSync(path.join(outputDir, "playbooks", "upgrades"), { recursive: true });
  const moduleReports = buildModuleReports(sourceReport);

  const llmsTxt = buildLlmsTxt(config, dependencyReport, moduleReports);
  const overview = buildOverview(config, dependencyReport, sourceReport, moduleReports);
  const dependencies = buildDependencies(dependencyReport);
  const refactorPlaybook = buildRefactorPlaybook();

  fs.writeFileSync(path.join(outputDir, "graph.json"), JSON.stringify(graph, null, 2));
  fs.writeFileSync(path.join(outputDir, "llms.txt"), llmsTxt);
  fs.writeFileSync(path.join(outputDir, "overview.md"), overview);
  fs.writeFileSync(path.join(outputDir, "dependencies.md"), dependencies);
  fs.writeFileSync(path.join(outputDir, "playbooks", "refactor.md"), refactorPlaybook);

  for (const advisory of dependencyReport.advisories) {
    fs.writeFileSync(
      path.join(outputDir, "playbooks", "upgrades", `${sanitizeModuleName(advisory.packageName)}.md`),
      buildUpgradePlaybook(advisory)
    );
  }

  for (const moduleReport of moduleReports) {
    fs.writeFileSync(
      path.join(outputDir, "modules", `${sanitizeModuleName(moduleReport.module)}.md`),
      buildModuleDoc(moduleReport)
    );
  }

  const evaluation = buildDisclosureEvaluation(outputDir, dependencyReport, sourceReport);
  fs.writeFileSync(path.join(outputDir, "evaluation.json"), JSON.stringify(evaluation.json, null, 2));
  fs.writeFileSync(path.join(outputDir, "evaluation.md"), evaluation.markdown);

  return outputDir;
}

function buildLlmsTxt(config, dependencyReport, moduleReports) {
  const moduleLinks = moduleReports
    .map((moduleReport) => `- [modules/${sanitizeModuleName(moduleReport.module)}.md](modules/${sanitizeModuleName(moduleReport.module)}.md): module breakdown for ${moduleReport.module}`)
    .join("\n");

  const upgradeLinks = [...new Set(dependencyReport.advisories.map((advisory) => advisory.packageName))]
    .map((packageName) => `- [playbooks/upgrades/${sanitizeModuleName(packageName)}.md](playbooks/upgrades/${sanitizeModuleName(packageName)}.md): upgrade guidance for ${packageName}`)
    .join("\n");

  return `# ${config.projectName}

This directory contains AI-facing generated documentation for the repository.

Start with these files in order:

- [overview.md](overview.md): high-level repository shape and reading order
- [dependencies.md](dependencies.md): runtime and package upgrade risks
- [playbooks/refactor.md](playbooks/refactor.md): generic multi-file refactor procedure

Module documents:

${moduleLinks || "- none"}

Upgrade playbooks:

${upgradeLinks || "- none"}

When editing code, prefer the smallest relevant module and upgrade playbook instead of loading the entire repository at once.
`;
}

function buildOverview(config, dependencyReport, sourceReport, moduleReports) {
  const componentCount = sourceReport.symbols.filter((symbol) => symbol.kind === "component").length;
  const hookCount = sourceReport.symbols.filter((symbol) => symbol.kind === "hook").length;

  return `# ${config.projectName} Overview

## Snapshot

- Files analyzed: ${sourceReport.files.length}
- Directories mapped: ${sourceReport.directories.length}
- Symbols detected: ${sourceReport.symbols.length}
- Routes detected: ${sourceReport.routes.length}
- Components detected: ${componentCount}
- Hooks detected: ${hookCount}
- Dependencies tracked: ${dependencyReport.dependencies.length}
- Upgrade advisories: ${dependencyReport.advisories.length}

## Primary modules

${renderList(renderPrimaryModules(moduleReports))}

## Routes

${renderList(sourceReport.routes.map((route) => `- \`${route.path}\` (${route.routeType})`), "- none detected")}

## Reading order

1. Start with this file for repository shape.
2. Read \`dependencies.md\` before planning upgrades or framework changes.
3. Read the relevant module doc under \`modules/\` before editing a subsystem.
4. Use \`playbooks/refactor.md\` when planning multi-file changes.
`;
}

function buildDependencies(dependencyReport) {
  const runtimeLine = dependencyReport.runtime?.requested
    ? `- Node engine requested: \`${dependencyReport.runtime.requested}\``
    : "- Node engine requested: not declared";

  const dependencyLines = dependencyReport.dependencies.map((dependency) => {
    const target = dependency.targetMajor != null ? ` -> target ${dependency.targetMajor}` : "";
    return `- \`${dependency.name}\`: \`${dependency.version}\`${target}`;
  });

  const advisoryLines = dependencyReport.advisories.map((advisory) => {
    const references = advisory.references.map((ref) => `[${ref.label}](${ref.url})`).join(", ");
    const patterns = advisory.affectedPatterns.length > 0
      ? ` Affected patterns: ${advisory.affectedPatterns.map((pattern) => `\`${pattern}\``).join(", ")}.`
      : "";
    const suggestedActions = advisory.suggestedActions?.length
      ? `\nSuggested actions:\n${advisory.suggestedActions.map((action) => `- ${action}`).join("\n")}`
      : "";
    const occurrences = advisory.occurrences?.length
      ? advisory.occurrences
          .slice(0, 12)
          .map((occurrence) => {
            const migration = occurrence.migration ? ` -> ${occurrence.migration}` : "";
            return `- Matched \`${occurrence.pattern}\` in ${formatOccurrenceLocation(occurrence)} (${occurrence.confidence})${migration}`;
          })
          .join("\n")
      : "- No matching source pattern found in scanned files.";

    return `### ${advisory.packageName}: ${advisory.title}

- Severity: ${advisory.severity}
- Current major: ${advisory.currentMajor ?? "n/a"}
- Target major: ${advisory.targetMajor ?? "n/a"}
- Summary: ${advisory.summary}
${advisory.notes.map((note) => `- ${note}`).join("\n")}
- References: ${references || "none"}
${patterns}
${suggestedActions}
${occurrences}
`;
  });

  return `# Dependency Map

## Runtime

${runtimeLine}
- Package manager: ${dependencyReport.packageManager ?? "not declared"}

## Dependencies

${renderList(dependencyLines, "- no dependencies discovered")}

## Upgrade advisories

${advisoryLines.length > 0 ? advisoryLines.join("\n") : "No configured upgrade advisories were triggered.\n"}
`;
}

function buildModuleDoc(moduleReport) {
  const focusFiles = rankModuleFiles(moduleReport.files).slice(0, MAX_MODULE_FILES);
  const omittedFileCount = Math.max(moduleReport.files.length - focusFiles.length, 0);
  const fileLines = focusFiles.map((file) => {
    const symbolSummary = file.symbols.length > 0
      ? file.symbols.map((symbol) => `${symbol.name} (${symbol.kind})`).join(", ")
      : "no exported symbols detected";

    return `- \`${file.path}\`: ${symbolSummary}`;
  });

  return `# Module: ${moduleReport.module}

## Snapshot

- Files: ${moduleReport.fileCount}
- Symbols: ${moduleReport.symbolCount}
- Routes: ${moduleReport.routeCount}
- Depends on modules: ${moduleReport.outgoingModules.length}
- Used by modules: ${moduleReport.incomingModules.length}

## Key Files

${fileLines.join("\n")}

${omittedFileCount > 0 ? `\nAdditional files omitted from this summary: ${omittedFileCount}\n` : ""}

## Key Exports

${renderList(
    moduleReport.keySymbols.map((symbol) => `- \`${symbol.name}\` (${symbol.kind}) in \`${symbol.path}\``),
    "- no exported symbols detected"
  )}

## Depends on Modules

${renderList(
    moduleReport.outgoingModules.map((dependency) => `- \`${dependency.module}\` (${dependency.count} imports)`),
    "- no cross-module imports detected"
  )}

## Used by Modules

${renderList(
    moduleReport.incomingModules.map((dependency) => `- \`${dependency.module}\` (${dependency.count} imports)`),
    "- no inbound cross-module imports detected"
  )}

## External Packages

${renderList(
    moduleReport.externalDependencies.map((dependency) => `- \`${dependency.packageName}\` (${dependency.count} imports)`),
    "- no unresolved external package imports recorded"
  )}

## Notes for AI agents

- Read the whole module before editing shared hooks or components.
- Validate inbound imports before moving files across module boundaries.
- Treat symbol kinds as heuristic unless reinforced by tests or runtime evidence.
`;
}

function buildRefactorPlaybook() {
  return `# Refactor Playbook

1. Read \`overview.md\` and the relevant module file to identify local boundaries.
2. Read \`dependencies.md\` if the change touches runtime, framework, or package upgrades.
3. Search for files that import the target symbol before moving or renaming it.
4. If an upgrade advisory is present, search for affected patterns before editing code.
5. Regenerate the graph after the change and review module drift.
`;
}

function buildUpgradePlaybook(advisory) {
  const migrationTasks = [...new Map(
    (advisory.occurrences ?? [])
      .filter((occurrence) => occurrence.migration)
      .map((occurrence) => [occurrence.pattern, occurrence.migration])
  ).entries()];
  const impactedSymbols = advisory.occurrences
    ?.filter((occurrence) => occurrence.symbolName)
    .map((occurrence) => `- \`${occurrence.symbolName}\` (${occurrence.symbolKind}) in \`${occurrence.filePath}\``);
  const occurrenceLines = advisory.occurrences?.length
    ? advisory.occurrences
        .slice(0, 20)
        .map((occurrence) => {
          const migration = occurrence.migration ? ` -> ${occurrence.migration}` : "";
          return `- ${formatOccurrenceLocation(occurrence)} matched \`${occurrence.pattern}\` (${occurrence.confidence})${migration}`;
        })
        .join("\n")
    : "- No source matches were found in scanned files.";

  return `# Upgrade Playbook: ${advisory.packageName}

## Risk Summary

- Severity: ${advisory.severity}
- Current major: ${advisory.currentMajor ?? "n/a"}
- Target major: ${advisory.targetMajor ?? "n/a"}
- Advisory: ${advisory.title}
- Summary: ${advisory.summary}

## Checks

${advisory.notes.map((note) => `- ${note}`).join("\n")}

## Suggested Actions

${advisory.suggestedActions?.length
    ? advisory.suggestedActions.map((action) => `- ${action}`).join("\n")
    : "- no general actions recorded"}

## Impacted Patterns

${advisory.affectedPatterns.length > 0
    ? advisory.affectedPatterns.map((pattern) => `- \`${pattern}\``).join("\n")
    : "- none recorded"}

## Migration Tasks From Current Matches

${migrationTasks.length > 0
    ? migrationTasks.map(([pattern, migration]) => `- \`${pattern}\`: ${migration}`).join("\n")
    : "- No pattern-specific migrations were inferred from the current matches."}

## Impacted Symbols

${impactedSymbols?.length ? [...new Set(impactedSymbols)].join("\n") : "- No owning export or component was inferred for the current matches."}

## Source Matches

${occurrenceLines}

## References

${advisory.references.length > 0
    ? advisory.references.map((reference) => `- [${reference.label}](${reference.url})`).join("\n")
    : "- none"}
`;
}

function buildModuleReports(sourceReport) {
  const modules = new Map();

  for (const file of sourceReport.files) {
    const moduleName = inferModuleName(file.path);
    const existing = modules.get(moduleName) ?? {
      module: moduleName,
      files: [],
      routes: [],
      incomingMap: new Map(),
      outgoingMap: new Map(),
      externalMap: new Map()
    };
    existing.files.push(file);
    modules.set(moduleName, existing);
  }

  for (const route of sourceReport.routes) {
    const moduleName = inferModuleName(route.path);
    const existing = modules.get(moduleName);
    if (existing) {
      existing.routes.push(route);
    }
  }

  const fileToModule = new Map(sourceReport.files.map((file) => [file.id, inferModuleName(file.path)]));

  for (const edge of sourceReport.importEdges) {
    const fromModule = fileToModule.get(edge.from);
    if (!fromModule) {
      continue;
    }

    if (edge.to.startsWith("file:")) {
      const toModule = inferModuleName(edge.to.replace(/^file:/, ""));
      if (toModule !== fromModule) {
        incrementCount(modules.get(fromModule).outgoingMap, toModule);
        incrementCount(modules.get(toModule)?.incomingMap, fromModule);
      }
      continue;
    }

    const packageName = normalizeExternalPackage(edge.specifier);
    if (packageName) {
      incrementCount(modules.get(fromModule).externalMap, packageName);
    }
  }

  return [...modules.values()]
    .map((moduleReport) => ({
      module: moduleReport.module,
      files: moduleReport.files,
      fileCount: moduleReport.files.length,
      symbolCount: moduleReport.files.reduce((total, file) => total + file.symbols.length, 0),
      routeCount: moduleReport.routes.length,
      keySymbols: moduleReport.files.flatMap((file) => file.symbols).slice(0, 12),
      incomingModules: sortCountEntries(moduleReport.incomingMap, "module"),
      outgoingModules: sortCountEntries(moduleReport.outgoingMap, "module"),
      externalDependencies: sortCountEntries(moduleReport.externalMap, "packageName")
    }))
    .sort((a, b) => a.module.localeCompare(b.module));
}

function renderPrimaryModules(moduleReports) {
  return moduleReports
    .slice()
    .sort((left, right) => {
      const score = (report) => report.fileCount + report.incomingModules.length + report.outgoingModules.length;
      return score(right) - score(left) || left.module.localeCompare(right.module);
    })
    .slice(0, 12)
    .map((moduleReport) => `- \`${moduleReport.module}\`: ${moduleReport.fileCount} files, ${moduleReport.symbolCount} symbols, ${moduleReport.incomingModules.length} inbound modules, ${moduleReport.outgoingModules.length} outbound modules`);
}

function rankModuleFiles(files) {
  return files
    .slice()
    .sort((left, right) => {
      const score = (file) => file.symbols.length;
      return score(right) - score(left) || left.path.localeCompare(right.path);
    });
}

function renderList(items, fallback = "- none") {
  return items.length > 0 ? items.join("\n") : fallback;
}

function sanitizeModuleName(name) {
  return name.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
}

function incrementCount(counter, key) {
  if (!counter || !key) {
    return;
  }

  counter.set(key, (counter.get(key) ?? 0) + 1);
}

function sortCountEntries(counter, label) {
  return [...counter.entries()]
    .map(([value, count]) => ({ [label]: value, count }))
    .sort((left, right) => right.count - left.count || left[label].localeCompare(right[label]));
}

function formatOccurrenceLocation(occurrence) {
  const base = `\`${occurrence.filePath}:${occurrence.line}\``;
  if (!occurrence.symbolName) {
    return base;
  }

  return `${base} in \`${occurrence.symbolName}\` (${occurrence.symbolKind})`;
}

function inferModuleName(filePath) {
  const parts = filePath.split("/");

  if (parts.length === 1) {
    return "root";
  }

  if (["apps", "packages", "internal", "tools"].includes(parts[0]) && parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }

  return parts[0];
}

function normalizeExternalPackage(specifier) {
  if (!specifier || specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("@/") || specifier.startsWith("~/")) {
    return null;
  }

  if (specifier.startsWith("@")) {
    return specifier.split("/").slice(0, 2).join("/");
  }

  return specifier.split("/")[0];
}
