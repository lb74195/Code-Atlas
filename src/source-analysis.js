import fs from "node:fs";
import path from "node:path";

import { buildProjectContext, resolveImportSpecifier } from "./project-context.js";

export function analyzeSources(rootDir, files, config = {}) {
  const projectContext = buildProjectContext(rootDir, files, config);
  const directories = new Map();
  const fileReports = [];
  const symbolIndex = new Map();
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

    if (report.route) {
      routeNodes.push(report.route);
    }
  }

  const linkedReports = resolveInternalLinks(fileReports, projectContext);
  const importEdges = linkedReports.flatMap((report) => report.imports);
  const callEdges = linkedReports.flatMap((report) => report.calls);
  const componentEdges = linkedReports.flatMap((report) => report.componentUses);

  return {
    directories: [...directories.values()].sort((a, b) => a.path.localeCompare(b.path)),
    files: linkedReports.sort((a, b) => a.path.localeCompare(b.path)),
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
      imported: match[1].trim(),
      bindings: parseImportBindings(match[1].trim())
    });
  }

  for (const match of content.matchAll(dynamicImportRegex)) {
    imports.push({
      from: `file:${relativePath}`,
      to: `module:${match[1]}`,
      kind: "IMPORTS",
      specifier: match[1],
      imported: "dynamic",
      bindings: []
    });
  }

  return imports;
}

function extractSymbols(relativePath, content) {
  const rawSymbols = [];
  const lineStarts = buildLineStarts(content);

  const functionRegex = /export\s+(default\s+)?function\s+([A-Za-z0-9_]+)/g;
  for (const match of content.matchAll(functionRegex)) {
    rawSymbols.push(createRawSymbol(match.index, match[2], "function", match[1] ? "default" : match[2]));
  }

  const variableRegex = /export\s+(?:const|let|var)\s+([A-Za-z0-9_]+)/g;
  for (const match of content.matchAll(variableRegex)) {
    rawSymbols.push(createRawSymbol(match.index, match[1], inferVariableKind(match[1]), match[1]));
  }

  const typeRegex = /export\s+(?:type|interface)\s+([A-Za-z0-9_]+)/g;
  for (const match of content.matchAll(typeRegex)) {
    rawSymbols.push(createRawSymbol(match.index, match[1], "type", match[1]));
  }

  const defaultExportRegex = /export\s+default\b(?!\s+function\s+[A-Za-z0-9_]+)/g;
  const defaultExportMatch = defaultExportRegex.exec(content);
  if (defaultExportMatch) {
    rawSymbols.push(
      createRawSymbol(
        defaultExportMatch.index,
        inferDefaultSymbolName(relativePath),
        inferDefaultSymbolKind(relativePath),
        "default"
      )
    );
  }

  const sortedSymbols = rawSymbols.sort((a, b) => a.startIndex - b.startIndex);

  const symbols = sortedSymbols.map((symbol, index) => {
    const endIndex = index < sortedSymbols.length - 1
      ? Math.max(symbol.startIndex, sortedSymbols[index + 1].startIndex - 1)
      : Math.max(symbol.startIndex, content.length - 1);

    return createSymbol(
      relativePath,
      symbol.name,
      symbol.fallbackKind,
      symbol.exportName,
      content,
      symbol.startIndex,
      endIndex,
      lineStarts
    );
  });

  return dedupeById(symbols);
}

function createRawSymbol(startIndex, name, fallbackKind, exportName) {
  return {
    startIndex,
    name,
    fallbackKind,
    exportName
  };
}

function createSymbol(relativePath, name, fallbackKind, exportName, content, startIndex, endIndex, lineStarts) {
  const kind = fallbackKind === "type" ? "type" : inferNamedSymbolKind(name, fallbackKind, content);

  return {
    id: `symbol:${relativePath}:${name}`,
    name,
    path: relativePath,
    kind,
    confidence: kind === "type" ? "high" : "heuristic",
    exportName: exportName ?? name,
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
    for (const binding of edge.bindings ?? []) {
      importedNames.add(binding.localName);
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
    for (const binding of edge.bindings ?? []) {
      if (/^[A-Z]/.test(binding.localName)) {
        importedNames.add(binding.localName);
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

function parseImportBindings(rawImportClause) {
  if (!rawImportClause || rawImportClause === "dynamic") {
    return [];
  }

  const bindings = [];
  const remaining = rawImportClause.trim();

  const namedMatch = remaining.match(/\{([^}]+)\}/);
  if (namedMatch) {
    for (const part of namedMatch[1].split(",")) {
      const cleaned = part.trim();
      if (!cleaned) {
        continue;
      }

      const [importedName, localName] = cleaned.split(/\s+as\s+/i).map((entry) => entry.trim());
      bindings.push({
        importedName,
        localName: localName ?? importedName,
        kind: "named"
      });
    }
  }

  const namespaceMatch = remaining.match(/\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
  if (namespaceMatch) {
    bindings.push({
      importedName: "*",
      localName: namespaceMatch[1],
      kind: "namespace"
    });
  }

  const withoutNamed = remaining.replace(/\{[^}]+\}/g, "").split(",").map((part) => part.trim()).filter(Boolean);
  for (const part of withoutNamed) {
    if (part.startsWith("* as ")) {
      continue;
    }
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(part)) {
      bindings.push({
        importedName: "default",
        localName: part,
        kind: "default"
      });
    }
  }

  return dedupeBindings(bindings);
}

function resolveInternalLinks(fileReports, projectContext) {
  const reportByPath = new Map(fileReports.map((report) => [report.path, report]));

  return fileReports.map((report) => {
    const resolvedImports = report.imports.map((edge) => resolveImportEdge(edge, report.path, reportByPath, projectContext));
    const bindingMap = buildBindingResolutionMap(resolvedImports, reportByPath);

    return {
      ...report,
      imports: resolvedImports,
      calls: report.calls.map((edge) => resolveSymbolEdge(edge, edge.callee, bindingMap)),
      componentUses: report.componentUses.map((edge) => resolveSymbolEdge(edge, edge.componentName, bindingMap))
    };
  });
}

function resolveImportEdge(edge, fromFilePath, reportByPath, projectContext) {
  const resolvedPath = resolveImportSpecifier(fromFilePath, edge.specifier, projectContext);
  if (!resolvedPath) {
    return edge;
  }

  return {
    ...edge,
    to: `file:${resolvedPath}`,
    resolvedPath,
    resolvedBindings: edge.bindings.map((binding) => ({
      ...binding,
      targetSymbolId: resolveImportedBinding(binding, reportByPath.get(resolvedPath))
    }))
  };
}

function resolveImportedBinding(binding, targetReport) {
  if (!targetReport?.symbols?.length) {
    return null;
  }

  if (binding.importedName === "*") {
    return null;
  }

  const exactMatch = targetReport.symbols.find((symbol) => symbol.exportName === binding.importedName);
  if (exactMatch) {
    return exactMatch.id;
  }

  if (binding.importedName === "default") {
    return targetReport.symbols[0]?.id ?? null;
  }

  return null;
}

function buildBindingResolutionMap(imports, reportByPath) {
  const bindingMap = new Map();

  for (const edge of imports) {
    for (const binding of edge.resolvedBindings ?? []) {
      if (binding.targetSymbolId) {
        bindingMap.set(binding.localName, binding.targetSymbolId);
        continue;
      }

      if (edge.resolvedPath) {
        const targetReport = reportByPath.get(edge.resolvedPath);
        if (binding.importedName === "default" && targetReport?.symbols?.length === 1) {
          bindingMap.set(binding.localName, targetReport.symbols[0].id);
        }
      }
    }
  }

  return bindingMap;
}

function resolveSymbolEdge(edge, localName, bindingMap) {
  if (!edge.to.startsWith("symbol:external:")) {
    return edge;
  }

  const resolvedTarget = bindingMap.get(localName);
  if (!resolvedTarget) {
    return edge;
  }

  return {
    ...edge,
    to: resolvedTarget
  };
}

function dedupeBindings(bindings) {
  const seen = new Set();
  return bindings.filter((binding) => {
    const key = `${binding.kind}:${binding.importedName}:${binding.localName}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function inferDefaultSymbolName(relativePath) {
  const base = path.posix.basename(relativePath).replace(/\.[^.]+$/, "");
  if (base === "index") {
    return path.posix.basename(path.posix.dirname(relativePath)) || "default";
  }
  return base || "default";
}

function inferDefaultSymbolKind(relativePath) {
  return relativePath.endsWith(".vue") ? "component" : "value";
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
