export function buildGraph(rootDir, config, dependencyReport, sourceReport) {
  const nodes = [];
  const edges = [];

  const projectId = `project:${config.projectName}`;
  nodes.push({
    id: projectId,
    kind: "project",
    label: config.projectName,
    path: rootDir
  });

  if (dependencyReport.runtime?.requested) {
    nodes.push({
      id: "runtime:node",
      kind: "runtime",
      label: `node ${dependencyReport.runtime.requested}`
    });
    edges.push({
      from: projectId,
      to: "runtime:node",
      kind: "DEPENDS_ON"
    });
  }

  for (const dependency of dependencyReport.dependencies) {
    const nodeId = `dependency:${dependency.name}`;
    nodes.push({
      id: nodeId,
      kind: "dependency",
      label: `${dependency.name}@${dependency.version}`,
      packageName: dependency.name,
      version: dependency.version
    });
    edges.push({
      from: projectId,
      to: nodeId,
      kind: "DEPENDS_ON"
    });

    if (dependency.targetMajor != null) {
      edges.push({
        from: nodeId,
        to: `target:${dependency.name}:${dependency.targetMajor}`,
        kind: "TARGETS_VERSION"
      });
      nodes.push({
        id: `target:${dependency.name}:${dependency.targetMajor}`,
        kind: "target",
        label: `${dependency.name} -> ${dependency.targetMajor}`
      });
    }
  }

  for (const advisory of dependencyReport.advisories) {
    const advisoryId = `advisory:${advisory.packageName}:${slugify(advisory.title)}`;
    nodes.push({
      id: advisoryId,
      kind: "advisory",
      label: advisory.title,
      severity: advisory.severity,
      packageName: advisory.packageName
    });
    edges.push({
      from: advisory.packageName === "node" ? "runtime:node" : `dependency:${advisory.packageName}`,
      to: advisoryId,
      kind: "TRIGGERS_ADVISORY"
    });

    for (const occurrence of advisory.occurrences ?? []) {
      edges.push({
        from: advisoryId,
        to: `file:${occurrence.filePath}`,
        kind: "AFFECTS_FILE",
        pattern: occurrence.pattern,
        line: occurrence.line
      });

      if (occurrence.symbolId) {
        edges.push({
          from: advisoryId,
          to: occurrence.symbolId,
          kind: "AFFECTS_SYMBOL",
          pattern: occurrence.pattern,
          line: occurrence.line
        });
      }
    }
  }

  for (const directory of sourceReport.directories) {
    nodes.push(directory);
    edges.push({
      from: projectId,
      to: directory.id,
      kind: "CONTAINS"
    });
  }

  for (const file of sourceReport.files) {
    nodes.push({
      id: file.id,
      kind: "file",
      label: file.path,
      path: file.path
    });

    const parentDirectory = file.path.includes("/")
      ? `directory:${file.path.split("/").slice(0, -1).join("/")}`
      : projectId;

    edges.push({
      from: parentDirectory,
      to: file.id,
      kind: "CONTAINS"
    });

    for (const symbol of file.symbols) {
      nodes.push({
        id: symbol.id,
        kind: "symbol",
        label: symbol.name,
        symbolKind: symbol.kind,
        path: symbol.path,
        confidence: symbol.confidence,
        lineStart: symbol.lineStart,
        lineEnd: symbol.lineEnd
      });
      edges.push({
        from: file.id,
        to: symbol.id,
        kind: "DECLARES"
      });
    }
  }

  for (const route of sourceReport.routes) {
    nodes.push(route);
    edges.push({
      from: `file:${route.path}`,
      to: route.id,
      kind: "IMPLEMENTS_ROUTE"
    });
  }

  edges.push(...sourceReport.importEdges, ...sourceReport.callEdges, ...sourceReport.componentEdges);

  return {
    nodes: dedupe(nodes),
    edges: dedupe(edges)
  };
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
