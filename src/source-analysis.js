import fs from "node:fs";
import path from "node:path";

export function analyzeSources(rootDir, files) {
  const directories = new Map();
  const fileReports = [];
  const symbolIndex = new Map();
  const importEdges = [];
  const callEdges = [];
  const componentEdges = [];
  const routeNodes = [];

  for (const filePath of files) {
    const relativePath = toPosix(path.relative(rootDir, filePath));
    const content = fs.readFileSync(filePath, "utf8");
    const report = analyzeFile(relativePath, content);
    fileReports.push(report);

    registerDirectory(directories, relativePath);

    for (const symbol of report.symbols) {
      symbolIndex.set(symbol.id, symbol);
    }

    for (const edge of report.imports) {
      importEdges.push(edge);
    }

    for (const edge of report.calls) {
      callEdges.push(edge);
    }

    for (const edge of report.componentUses) {
      componentEdges.push(edge);
    }

    if (report.route) {
      routeNodes.push(report.route);
    }
  }

  return {
    directories: [...directories.values()].sort((a, b) => a.path.localeCompare(b.path)),
    files: fileReports.sort((a, b) => a.path.localeCompare(b.path)),
    symbols: [...symbolIndex.values()].sort((a, b) => a.id.localeCompare(b.id)),
    routes: routeNodes.sort((a, b) => a.path.localeCompare(b.path)),
    importEdges,
    callEdges,
    componentEdges
  };
}

function analyzeFile(relativePath, content) {
  const imports = extractImports(relativePath, content);
  const symbols = extractSymbols(relativePath, content);
  const calls = extractCalls(relativePath, content, imports, symbols);
  const componentUses = extractComponentUses(relativePath, content, imports, symbols);
  const route = inferRoute(relativePath);

  return {
    id: `file:${relativePath}`,
    kind: "file",
    path: relativePath,
    imports,
    symbols,
    calls,
    componentUses,
    route
  };
}

function extractImports(relativePath, content) {
  const imports = [];
  const importRegex = /import\s+([^;]+?)\s+from\s+["']([^"']+)["'];?/g;
  const dynamicImportRegex = /import\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of content.matchAll(importRegex)) {
    imports.push({
      from: `file:${relativePath}`,
      to: `module:${match[2]}`,
      kind: "IMPORTS",
      specifier: match[2],
      imported: match[1].trim()
    });
  }

  for (const match of content.matchAll(dynamicImportRegex)) {
    imports.push({
      from: `file:${relativePath}`,
      to: `module:${match[1]}`,
      kind: "IMPORTS",
      specifier: match[1],
      imported: "dynamic"
    });
  }

  return imports;
}

function extractSymbols(relativePath, content) {
  const rawSymbols = [];
  const lineStarts = buildLineStarts(content);

  const functionRegex = /export\s+(?:default\s+)?function\s+([A-Za-z0-9_]+)/g;
  for (const match of content.matchAll(functionRegex)) {
    rawSymbols.push(createRawSymbol(match.index, match[1], "function"));
  }

  const variableRegex = /export\s+(?:const|let|var)\s+([A-Za-z0-9_]+)/g;
  for (const match of content.matchAll(variableRegex)) {
    rawSymbols.push(createRawSymbol(match.index, match[1], inferVariableKind(match[1])));
  }

  const typeRegex = /export\s+(?:type|interface)\s+([A-Za-z0-9_]+)/g;
  for (const match of content.matchAll(typeRegex)) {
    rawSymbols.push(createRawSymbol(match.index, match[1], "type"));
  }

  const sortedSymbols = rawSymbols.sort((a, b) => a.startIndex - b.startIndex);

  const symbols = sortedSymbols.map((symbol, index) => {
    const endIndex = index < sortedSymbols.length - 1
      ? Math.max(symbol.startIndex, sortedSymbols[index + 1].startIndex - 1)
      : Math.max(symbol.startIndex, content.length - 1);

    return createSymbol(relativePath, symbol.name, symbol.fallbackKind, content, symbol.startIndex, endIndex, lineStarts);
  });

  return dedupeById(symbols);
}

function createRawSymbol(startIndex, name, fallbackKind) {
  return {
    startIndex,
    name,
    fallbackKind
  };
}

function createSymbol(relativePath, name, fallbackKind, content, startIndex, endIndex, lineStarts) {
  const kind = fallbackKind === "type" ? "type" : inferNamedSymbolKind(name, fallbackKind, content);

  return {
    id: `symbol:${relativePath}:${name}`,
    name,
    path: relativePath,
    kind,
    confidence: kind === "type" ? "high" : "heuristic",
    lineStart: indexToLine(startIndex, lineStarts),
    lineEnd: indexToLine(endIndex, lineStarts)
  };
}

function inferVariableKind(name) {
  if (name.startsWith("use")) {
    return "hook";
  }
  if (/^[A-Z]/.test(name)) {
    return "component";
  }
  return "value";
}

function inferNamedSymbolKind(name, fallbackKind, content) {
  if (name.startsWith("use")) {
    return "hook";
  }

  if (/^[A-Z]/.test(name) && /<[A-Z][A-Za-z0-9]*/.test(content)) {
    return "component";
  }

  return fallbackKind;
}

function extractCalls(relativePath, content, imports, symbols) {
  const localNames = new Set(symbols.map((symbol) => symbol.name));
  const importedNames = new Set();

  for (const edge of imports) {
    for (const name of extractImportedNames(edge.imported)) {
      importedNames.add(name);
    }
  }

  const calls = [];
  const callRegex = /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
  for (const match of content.matchAll(callRegex)) {
    const callee = match[1];
    if (!localNames.has(callee) && !importedNames.has(callee)) {
      continue;
    }

    calls.push({
      from: `file:${relativePath}`,
      to: localNames.has(callee) ? `symbol:${relativePath}:${callee}` : `symbol:external:${callee}`,
      kind: "CALLS",
      callee
    });
  }

  return calls;
}

function extractComponentUses(relativePath, content, imports, symbols) {
  const localComponentNames = new Set(
    symbols.filter((symbol) => symbol.kind === "component").map((symbol) => symbol.name)
  );
  const importedNames = new Set();

  for (const edge of imports) {
    for (const name of extractImportedNames(edge.imported)) {
      if (/^[A-Z]/.test(name)) {
        importedNames.add(name);
      }
    }
  }

  const componentUses = [];
  const jsxRegex = /<([A-Z][A-Za-z0-9_]*)\b/g;
  for (const match of content.matchAll(jsxRegex)) {
    const componentName = match[1];
    if (!localComponentNames.has(componentName) && !importedNames.has(componentName)) {
      continue;
    }

    componentUses.push({
      from: `file:${relativePath}`,
      to: localComponentNames.has(componentName)
        ? `symbol:${relativePath}:${componentName}`
        : `symbol:external:${componentName}`,
      kind: "USES_COMPONENT",
      componentName
    });
  }

  return componentUses;
}

function inferRoute(relativePath) {
  if (/^app\/(?:.*\/)?page\.(jsx?|tsx?)$/.test(relativePath)) {
    return {
      id: `route:${relativePath}`,
      kind: "route",
      path: relativePath,
      routeType: "next-app-page"
    };
  }

  if (/^pages\/(?:.*\/)?[^/]+\.(jsx?|tsx?)$/.test(relativePath) && !relativePath.includes("/api/")) {
    return {
      id: `route:${relativePath}`,
      kind: "route",
      path: relativePath,
      routeType: "next-pages-route"
    };
  }

  return null;
}

function registerDirectory(directories, relativePath) {
  const parts = relativePath.split("/");
  let current = [];

  for (let i = 0; i < parts.length - 1; i += 1) {
    current.push(parts[i]);
    const joined = current.join("/");
    directories.set(joined, {
      id: `directory:${joined}`,
      kind: "directory",
      path: joined
    });
  }
}

function extractImportedNames(rawImportClause) {
  const cleaned = rawImportClause
    .replace(/[{}]/g, " ")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return cleaned
    .map((part) => part.split(/\s+as\s+/i)[1] ?? part)
    .map((part) => part.trim())
    .filter((part) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(part));
}

function dedupeById(items) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return [...byId.values()];
}

function buildLineStarts(content) {
  const starts = [0];

  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === "\n") {
      starts.push(i + 1);
    }
  }

  return starts;
}

function indexToLine(index, lineStarts) {
  let low = 0;
  let high = lineStarts.length - 1;
  let result = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= index) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return result + 1;
}

function toPosix(input) {
  return input.split(path.sep).join("/");
}
