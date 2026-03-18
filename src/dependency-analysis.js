import fs from "node:fs";
import path from "node:path";

import { extractMajor } from "./semver.js";

export function analyzeDependencies(rootDir, config, rules) {
  const packageJsonPath = path.join(rootDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return {
      packageJsonPath: null,
      packageManager: null,
      runtime: null,
      dependencies: [],
      advisories: []
    };
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const dependencyEntries = [
    ...Object.entries(packageJson.dependencies ?? {}),
    ...Object.entries(packageJson.devDependencies ?? {}),
    ...Object.entries(packageJson.peerDependencies ?? {})
  ].map(([name, version]) => ({
    name,
    version,
    currentMajor: extractMajor(version),
    targetMajor: extractMajor(config.targets[name])
  }));

  const runtime = {
    requested: packageJson.engines?.node ?? null,
    currentMajor: extractMajor(packageJson.engines?.node),
    targetMajor: extractMajor(config.targets.node)
  };

  const advisories = [
    ...collectPackageAdvisories("node", runtime.currentMajor, runtime.targetMajor, rules),
    ...dependencyEntries.flatMap((entry) =>
      collectPackageAdvisories(entry.name, entry.currentMajor, entry.targetMajor, rules).map((advisory) => ({
        ...advisory,
        packageName: entry.name,
        currentVersion: entry.version
      }))
    )
  ];

  return {
    packageJsonPath,
    packageManager: packageJson.packageManager ?? null,
    runtime,
    dependencies: dependencyEntries.sort((a, b) => a.name.localeCompare(b.name)),
    advisories
  };
}

function collectPackageAdvisories(packageName, currentMajor, targetMajor, rules) {
  if (currentMajor == null || targetMajor == null) {
    return [];
  }

  return (rules[packageName] ?? [])
    .filter((rule) => currentMajor < (rule.fromBelow ?? Number.MAX_SAFE_INTEGER) && targetMajor >= (rule.targetAtLeast ?? 0))
    .map((rule) => ({
      packageName,
      currentMajor,
      targetMajor,
      severity: rule.severity,
      title: rule.title,
      summary: rule.summary,
      notes: rule.notes ?? [],
      affectedPatterns: rule.affectedPatterns ?? [],
      references: rule.references ?? []
    }));
}
