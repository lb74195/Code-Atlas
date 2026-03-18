import fs from "node:fs";
import path from "node:path";

export function attachAdvisoryOccurrences(rootDir, files, advisories, sourceReport) {
  const fileReports = new Map((sourceReport?.files ?? []).map((file) => [file.path, file]));

  return advisories.map((advisory) => ({
    ...advisory,
    occurrences: findOccurrences(rootDir, files, advisory.affectedPatterns ?? [], fileReports)
  }));
}

function findOccurrences(rootDir, files, patterns, fileReports) {
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
          confidence: "heuristic",
          ...findOwningSymbol(fileReports.get(relativePath), index + 1)
        });
      });
    });
  }

  return occurrences;
}

function findOwningSymbol(fileReport, line) {
  if (!fileReport?.symbols?.length) {
    return {};
  }

  const containingSymbols = fileReport.symbols.filter((symbol) => {
    return typeof symbol.lineStart === "number" && typeof symbol.lineEnd === "number" && line >= symbol.lineStart && line <= symbol.lineEnd;
  });

  if (containingSymbols.length > 0) {
    const symbol = containingSymbols.sort((a, b) => {
      const rangeA = a.lineEnd - a.lineStart;
      const rangeB = b.lineEnd - b.lineStart;
      return rangeA - rangeB;
    })[0];

    return {
      symbolId: symbol.id,
      symbolName: symbol.name,
      symbolKind: symbol.kind
    };
  }

  const nearest = fileReport.symbols
    .filter((symbol) => typeof symbol.lineStart === "number" && symbol.lineStart <= line)
    .sort((a, b) => b.lineStart - a.lineStart)[0];

  if (!nearest) {
    return {};
  }

  return {
    symbolId: nearest.id,
    symbolName: nearest.name,
    symbolKind: nearest.kind
  };
}

function toPosix(input) {
  return input.split(path.sep).join("/");
}
