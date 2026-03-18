import fs from "node:fs";
import path from "node:path";

const MAX_MODULE_FILES = 40;

export function buildDisclosureEvaluation(outputDir, dependencyReport, sourceReport) {
  const llmsPath = path.join(outputDir, "llms.txt");
  const overviewPath = path.join(outputDir, "overview.md");
  const dependenciesPath = path.join(outputDir, "dependencies.md");
  const refactorPath = path.join(outputDir, "playbooks", "refactor.md");

  const llmsText = fs.existsSync(llmsPath) ? fs.readFileSync(llmsPath, "utf8") : "";
  const llmsLinks = extractMarkdownLinks(llmsText);
  const brokenLinks = llmsLinks.filter((link) => !fs.existsSync(path.join(outputDir, link.target)));

  const moduleReports = groupFilesByModule(sourceReport.files);
  const expectedModuleDocs = moduleReports.map((moduleReport) => `modules/${sanitizeModuleName(moduleReport.module)}.md`);
  const referencedModuleDocs = new Set(
    llmsLinks
      .map((link) => link.target)
      .filter((target) => target.startsWith("modules/"))
  );
  const missingModuleDocs = expectedModuleDocs.filter((relativePath) => !fs.existsSync(path.join(outputDir, relativePath)));
  const unlinkedModuleDocs = expectedModuleDocs.filter((relativePath) => !referencedModuleDocs.has(relativePath));
  const largeModules = moduleReports.filter((moduleReport) => moduleReport.files.length > MAX_MODULE_FILES);
  const summarizedLargeModules = largeModules.filter((moduleReport) => {
    const moduleDocPath = path.join(outputDir, "modules", `${sanitizeModuleName(moduleReport.module)}.md`);
    if (!fs.existsSync(moduleDocPath)) {
      return false;
    }

    const moduleDoc = fs.readFileSync(moduleDocPath, "utf8");
    return moduleDoc.includes("Additional files omitted from this summary:");
  });

  const expectedUpgradePlaybooks = [...new Set(dependencyReport.advisories.map((advisory) => `playbooks/upgrades/${sanitizeModuleName(advisory.packageName)}.md`))];
  const referencedUpgradePlaybooks = new Set(
    llmsLinks
      .map((link) => link.target)
      .filter((target) => target.startsWith("playbooks/upgrades/"))
  );
  const missingUpgradePlaybooks = expectedUpgradePlaybooks.filter((relativePath) => !fs.existsSync(path.join(outputDir, relativePath)));
  const unlinkedUpgradePlaybooks = expectedUpgradePlaybooks.filter((relativePath) => !referencedUpgradePlaybooks.has(relativePath));

  const checkResults = [
    {
      id: "root-index",
      label: "Root index exists",
      passed: fs.existsSync(llmsPath),
      detail: "`llms.txt` should be present as the AI entrypoint."
    },
    {
      id: "core-docs",
      label: "Core docs exist",
      passed: fs.existsSync(overviewPath) && fs.existsSync(dependenciesPath) && fs.existsSync(refactorPath),
      detail: "Expected `overview.md`, `dependencies.md`, and `playbooks/refactor.md`."
    },
    {
      id: "core-links",
      label: "Root index links core docs",
      passed: ["overview.md", "dependencies.md", "playbooks/refactor.md"].every((target) => llmsLinks.some((link) => link.target === target)),
      detail: "`llms.txt` should reference overview, dependency guidance, and refactor guidance."
    },
    {
      id: "module-coverage",
      label: "Module docs cover discovered modules",
      passed: missingModuleDocs.length === 0,
      detail: missingModuleDocs.length === 0
        ? `Covered ${expectedModuleDocs.length}/${expectedModuleDocs.length} modules.`
        : `Missing module docs: ${missingModuleDocs.join(", ")}`
    },
    {
      id: "module-links",
      label: "Root index links module docs",
      passed: unlinkedModuleDocs.length === 0,
      detail: unlinkedModuleDocs.length === 0
        ? `Linked ${expectedModuleDocs.length}/${expectedModuleDocs.length} module docs.`
        : `Unlinked module docs: ${unlinkedModuleDocs.join(", ")}`
    },
    {
      id: "module-budget",
      label: "Large modules are summarized",
      passed: summarizedLargeModules.length === largeModules.length,
      detail: largeModules.length === 0
        ? "No module exceeded the current file budget."
        : summarizedLargeModules.length === largeModules.length
          ? `Summarized ${summarizedLargeModules.length}/${largeModules.length} large modules.`
          : `Large modules missing truncation hints: ${largeModules.filter((moduleReport) => !summarizedLargeModules.includes(moduleReport)).map((moduleReport) => moduleReport.module).join(", ")}`
    },
    {
      id: "upgrade-coverage",
      label: "Upgrade playbooks cover advisories",
      passed: missingUpgradePlaybooks.length === 0,
      detail: expectedUpgradePlaybooks.length === 0
        ? "No upgrade advisories were triggered."
        : missingUpgradePlaybooks.length === 0
          ? `Covered ${expectedUpgradePlaybooks.length}/${expectedUpgradePlaybooks.length} upgrade playbooks.`
          : `Missing upgrade playbooks: ${missingUpgradePlaybooks.join(", ")}`
    },
    {
      id: "upgrade-links",
      label: "Root index links upgrade playbooks",
      passed: unlinkedUpgradePlaybooks.length === 0,
      detail: expectedUpgradePlaybooks.length === 0
        ? "No upgrade playbooks needed linking."
        : unlinkedUpgradePlaybooks.length === 0
          ? `Linked ${expectedUpgradePlaybooks.length}/${expectedUpgradePlaybooks.length} upgrade playbooks.`
          : `Unlinked upgrade playbooks: ${unlinkedUpgradePlaybooks.join(", ")}`
    },
    {
      id: "broken-links",
      label: "Root index has no broken links",
      passed: brokenLinks.length === 0,
      detail: brokenLinks.length === 0
        ? `Validated ${llmsLinks.length} links.`
        : `Broken links: ${brokenLinks.map((link) => link.target).join(", ")}`
    }
  ];

  const passedCount = checkResults.filter((check) => check.passed).length;
  const score = Math.round((passedCount / checkResults.length) * 100);
  const grade = score >= 95 ? "A" : score >= 85 ? "B" : score >= 70 ? "C" : "D";

  const evaluation = {
    score,
    grade,
    checks: checkResults,
    metrics: {
      modulesDiscovered: expectedModuleDocs.length,
      moduleDocsPresent: expectedModuleDocs.length - missingModuleDocs.length,
      moduleDocsLinked: expectedModuleDocs.length - unlinkedModuleDocs.length,
      largeModules: largeModules.length,
      largeModulesSummarized: summarizedLargeModules.length,
      upgradePlaybooksExpected: expectedUpgradePlaybooks.length,
      upgradePlaybooksPresent: expectedUpgradePlaybooks.length - missingUpgradePlaybooks.length,
      upgradePlaybooksLinked: expectedUpgradePlaybooks.length - unlinkedUpgradePlaybooks.length,
      rootLinksChecked: llmsLinks.length,
      brokenLinks: brokenLinks.length
    },
    gaps: {
      missingModuleDocs,
      unlinkedModuleDocs,
      missingUpgradePlaybooks,
      unlinkedUpgradePlaybooks,
      brokenLinks: brokenLinks.map((link) => link.target)
    }
  };

  return {
    json: evaluation,
    markdown: buildEvaluationMarkdown(evaluation)
  };
}

function buildEvaluationMarkdown(evaluation) {
  const checkLines = evaluation.checks.map((check) => {
    const status = check.passed ? "PASS" : "FAIL";
    return `- ${status} ${check.label}: ${check.detail}`;
  });

  const nextActions = [];
  if (evaluation.gaps.missingModuleDocs.length > 0 || evaluation.gaps.unlinkedModuleDocs.length > 0) {
    nextActions.push("- Fill module coverage gaps before relying on module-level progressive disclosure.");
  }
  if (evaluation.gaps.missingUpgradePlaybooks.length > 0 || evaluation.gaps.unlinkedUpgradePlaybooks.length > 0) {
    nextActions.push("- Regenerate or repair upgrade playbooks before planning dependency migrations.");
  }
  if (evaluation.gaps.brokenLinks.length > 0) {
    nextActions.push("- Fix broken `llms.txt` links so agents can traverse the disclosure tree deterministically.");
  }

  return `# Disclosure Evaluation

## Score

- Score: ${evaluation.score}/100
- Grade: ${evaluation.grade}

## Checks

${checkLines.join("\n")}

## Coverage

- Modules discovered: ${evaluation.metrics.modulesDiscovered}
- Module docs present: ${evaluation.metrics.moduleDocsPresent}
- Module docs linked from \`llms.txt\`: ${evaluation.metrics.moduleDocsLinked}
- Large modules discovered: ${evaluation.metrics.largeModules}
- Large modules summarized: ${evaluation.metrics.largeModulesSummarized}
- Upgrade playbooks expected: ${evaluation.metrics.upgradePlaybooksExpected}
- Upgrade playbooks present: ${evaluation.metrics.upgradePlaybooksPresent}
- Upgrade playbooks linked from \`llms.txt\`: ${evaluation.metrics.upgradePlaybooksLinked}
- Root links checked: ${evaluation.metrics.rootLinksChecked}
- Broken root links: ${evaluation.metrics.brokenLinks}

## Next Actions

${nextActions.length > 0 ? nextActions.join("\n") : "- Progressive disclosure coverage is healthy enough for agent consumption."}
`;
}

function extractMarkdownLinks(content) {
  const links = [];
  const pattern = /\[[^\]]+\]\(([^)]+)\)/g;
  let match = pattern.exec(content);

  while (match) {
    links.push({ target: match[1] });
    match = pattern.exec(content);
  }

  return links;
}

function groupFilesByModule(files) {
  const modules = new Map();

  for (const file of files) {
    const moduleName = inferModuleName(file.path);
    if (!modules.has(moduleName)) {
      modules.set(moduleName, []);
    }
    modules.get(moduleName).push(file.path);
  }

  return [...modules.entries()].map(([module, moduleFiles]) => ({ module, files: moduleFiles }));
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

function sanitizeModuleName(name) {
  return name.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
}
