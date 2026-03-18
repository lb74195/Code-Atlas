import fs from "node:fs";
import path from "node:path";

export function attachAdvisoryOccurrences(rootDir, files, advisories) {
  return advisories.map((advisory) => ({
    ...advisory,
    occurrences: findOccurrences(rootDir, files, advisory.affectedPatterns ?? [])
  }));
}

function findOccurrences(rootDir, files, patterns) {
  if (patterns.length === 0) {
    return [];
  }

  const occurrences = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    const relativePath = toPosix(path.relative(rootDir, filePath));

    patterns.forEach((pattern) => {
      lines.forEach((line, index) => {
        if (!line.includes(pattern)) {
          return;
        }

        occurrences.push({
          filePath: relativePath,
          line: index + 1,
          pattern,
          confidence: "heuristic"
        });
      });
    });
  }

  return occurrences;
}

function toPosix(input) {
  return input.split(path.sep).join("/");
}
