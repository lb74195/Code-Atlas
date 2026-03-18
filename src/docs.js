import fs from "node:fs";
import path from "node:path";

export function writeArtifacts(rootDir, outputDirName, config, dependencyReport, sourceReport, graph) {
  const outputDir = path.join(rootDir, outputDirName);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.join(outputDir, "modules"), { recursive: true });
  fs.mkdirSync(path.join(outputDir, "playbooks"), { recursive: true });
  fs.mkdirSync(path.join(outputDir, "playbooks", "upgrades"), { recursive: true });

  fs.writeFileSync(path.join(outputDir, "graph.json"), JSON.stringify(graph, null, 2));
  fs.writeFileSync(path.join(outputDir, "llms.txt"), buildLlmsTxt(config, dependencyReport, sourceReport));
  fs.writeFileSync(path.join(outputDir, "overview.md"), buildOverview(config, dependencyReport, sourceReport));
  fs.writeFileSync(path.join(outputDir, "dependencies.md"), buildDependencies(dependencyReport));
  fs.writeFileSync(path.join(outputDir, "playbooks", "refactor.md"), buildRefactorPlaybook());

  for (const advisory of dependencyReport.advisories) {
    fs.writeFileSync(
      path.join(outputDir, "playbooks", "upgrades", `${sanitizeModuleName(advisory.packageName)}.md`),
      buildUpgradePlaybook(advisory)
    );
  }

  for (const moduleReport of groupFilesByModule(sourceReport.files)) {
    fs.writeFileSync(
      path.join(outputDir, "modules", `${sanitizeModuleName(moduleReport.module)}.md`),
      buildModuleDoc(moduleReport)
    );
  }

  return outputDir;
}

function buildLlmsTxt(config, dependencyReport, sourceReport) {
  const moduleLinks = groupFilesByModule(sourceReport.files)
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

function buildOverview(config, dependencyReport, sourceReport) {
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

${renderList(getTopDirectories(sourceReport))}

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
    const occurrences = advisory.occurrences?.length
      ? advisory.occurrences
          .slice(0, 12)
          .map((occurrence) => `- Matched \`${occurrence.pattern}\` in \`${occurrence.filePath}:${occurrence.line}\` (${occurrence.confidence})`)
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
  const fileLines = moduleReport.files.map((file) => {
    const symbolSummary = file.symbols.length > 0
      ? file.symbols.map((symbol) => `${symbol.name} (${symbol.kind})`).join(", ")
      : "no exported symbols detected";

    return `- \`${file.path}\`: ${symbolSummary}`;
  });

  return `# Module: ${moduleReport.module}

## Files

${fileLines.join("\n")}

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
  const occurrenceLines = advisory.occurrences?.length
    ? advisory.occurrences
        .slice(0, 20)
        .map((occurrence) => `- \`${occurrence.filePath}:${occurrence.line}\` matched \`${occurrence.pattern}\` (${occurrence.confidence})`)
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

## Impacted Patterns

${advisory.affectedPatterns.length > 0
    ? advisory.affectedPatterns.map((pattern) => `- \`${pattern}\``).join("\n")
    : "- none recorded"}

## Source Matches

${occurrenceLines}

## References

${advisory.references.length > 0
    ? advisory.references.map((reference) => `- [${reference.label}](${reference.url})`).join("\n")
    : "- none"}
`;
}

function groupFilesByModule(files) {
  const modules = new Map();

  for (const file of files) {
    const moduleName = file.path.includes("/") ? file.path.split("/")[0] : "root";
    const existing = modules.get(moduleName) ?? { module: moduleName, files: [] };
    existing.files.push(file);
    modules.set(moduleName, existing);
  }

  return [...modules.values()].sort((a, b) => a.module.localeCompare(b.module));
}

function getTopDirectories(sourceReport) {
  return sourceReport.directories.slice(0, 12).map((directory) => `- \`${directory.path}\``);
}

function renderList(items, fallback = "- none") {
  return items.length > 0 ? items.join("\n") : fallback;
}

function sanitizeModuleName(name) {
  return name.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
}
