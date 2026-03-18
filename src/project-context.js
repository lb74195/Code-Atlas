import fs from "node:fs";
import path from "node:path";

const PACKAGE_JSON = "package.json";
const WORKSPACE_FILE = "pnpm-workspace.yaml";
const SOURCE_FILE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue"];
const RESOURCE_FILE_EXTENSIONS = [".css", ".scss", ".sass", ".less", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".json"];

export function buildProjectContext(rootDir, files, config) {
  const fileSet = new Set(files.map((filePath) => toPosix(path.relative(rootDir, filePath))));
  const resourceSet = discoverResourceFiles(rootDir, config);
  const workspacePackages = discoverWorkspacePackages(rootDir, config.exclude ?? []);
  const pathAliasConfigs = discoverPathAliasConfigs(rootDir, config.exclude ?? []);

  return {
    fileSet,
    resourceSet,
    workspacePackages,
    pathAliasConfigs
  };
}

export function discoverSearchRoots(rootDir, config) {
  const include = Array.isArray(config?.include) ? config.include : ["src", "app", "pages", "components"];
  const hasCustomInclude = Boolean(config?.hasCustomInclude);
  const includeRoots = include
    .map((entry) => path.join(rootDir, entry))
    .filter((entry) => fs.existsSync(entry));

  const roots = new Set(includeRoots);

  if (!hasCustomInclude) {
    for (const workspaceRoot of discoverWorkspaceRoots(rootDir)) {
      if (fs.existsSync(workspaceRoot)) {
        roots.add(workspaceRoot);
      }
    }
  }

  return roots.size > 0 ? [...roots] : [rootDir];
}

export function resolveImportSpecifier(fromFilePath, specifier, context) {
  if (!specifier) {
    return null;
  }

  if (specifier.startsWith(".")) {
    return resolveFileCandidate(path.posix.join(path.posix.dirname(fromFilePath), specifier), context.fileSet, context.resourceSet);
  }

  const aliasResolved = resolveAliasSpecifier(fromFilePath, specifier, context);
  if (aliasResolved) {
    return aliasResolved;
  }

  const workspaceHit = resolveWorkspacePackageSpecifier(specifier, context.workspacePackages);
  if (!workspaceHit) {
    return null;
  }

  return resolveWorkspaceFile(workspaceHit.packageInfo, workspaceHit.subpath, context.fileSet, context.resourceSet);
}

function discoverWorkspaceRoots(rootDir) {
  const workspaceFilePath = path.join(rootDir, WORKSPACE_FILE);
  if (!fs.existsSync(workspaceFilePath)) {
    return [];
  }

  const raw = fs.readFileSync(workspaceFilePath, "utf8");
  const roots = new Set();

  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/-\s+['"]?([^'"]+)['"]?/);
    if (!match) {
      continue;
    }

    const rootSegment = match[1].replace(/\/\*\*?$/, "").split("/")[0];
    if (rootSegment && rootSegment !== ".") {
      roots.add(path.join(rootDir, rootSegment));
    }
  }

  return [...roots];
}

function discoverWorkspacePackages(rootDir, exclude) {
  const packages = new Map();
  const roots = discoverWorkspaceRoots(rootDir);

  if (roots.length === 0) {
    return packages;
  }

  for (const workspaceRoot of roots) {
    scanForPackages(workspaceRoot, rootDir, exclude, packages);
  }

  return packages;
}

function discoverResourceFiles(rootDir, config) {
  const resourceSet = new Set();
  const searchRoots = discoverSearchRoots(rootDir, config);
  const exclude = Array.isArray(config?.exclude) ? config.exclude : ["node_modules", "dist", "build", ".next", "coverage"];

  for (const searchRoot of searchRoots) {
    walkForResources(searchRoot, rootDir, exclude, resourceSet);
  }

  return resourceSet;
}

function discoverPathAliasConfigs(rootDir, exclude) {
  const configs = [];
  const roots = new Set([rootDir, ...discoverWorkspaceRoots(rootDir)]);

  for (const workspaceRoot of roots) {
    scanForTsconfig(workspaceRoot, rootDir, exclude, configs);
  }

  return configs.sort((a, b) => b.dirPath.length - a.dirPath.length);
}

function scanForPackages(currentDir, rootDir, exclude, packages) {
  const relativeDir = path.relative(rootDir, currentDir);
  if (shouldExclude(relativeDir, exclude)) {
    return;
  }

  const packageJsonPath = path.join(currentDir, PACKAGE_JSON);
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    if (typeof packageJson.name === "string" && packageJson.name.length > 0) {
      packages.set(packageJson.name, {
        dirPath: toPosix(path.relative(rootDir, currentDir)),
        main: packageJson.main ?? null,
        module: packageJson.module ?? null,
        types: packageJson.types ?? null
      });
    }
  }

  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    scanForPackages(path.join(currentDir, entry.name), rootDir, exclude, packages);
  }
}

function scanForTsconfig(currentDir, rootDir, exclude, configs) {
  const relativeDir = path.relative(rootDir, currentDir);
  if (shouldExclude(relativeDir, exclude)) {
    return;
  }

  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      scanForTsconfig(absolutePath, rootDir, exclude, configs);
      continue;
    }

    if (!/^(tsconfig(\..+)?|jsconfig)\.json$/.test(entry.name)) {
      continue;
    }

    const raw = fs.readFileSync(absolutePath, "utf8");
    const parsed = parseJsonWithComments(raw);
    const paths = parsed.compilerOptions?.paths;
    if (!paths || typeof paths !== "object") {
      continue;
    }

    configs.push({
      dirPath: toPosix(path.relative(rootDir, currentDir)),
      baseUrl: parsed.compilerOptions?.baseUrl ?? ".",
      paths
    });
  }
}

function resolveWorkspacePackageSpecifier(specifier, workspacePackages) {
  const candidates = [...workspacePackages.keys()]
    .filter((packageName) => specifier === packageName || specifier.startsWith(`${packageName}/`))
    .sort((a, b) => b.length - a.length);

  if (candidates.length === 0) {
    return null;
  }

  const packageName = candidates[0];
  return {
    packageInfo: workspacePackages.get(packageName),
    subpath: specifier === packageName ? "" : specifier.slice(packageName.length + 1)
  };
}

function resolveWorkspaceFile(packageInfo, subpath, fileSet, resourceSet) {
  if (!packageInfo) {
    return null;
  }

  if (subpath) {
    return resolveFileCandidate(path.posix.join(packageInfo.dirPath, subpath), fileSet, resourceSet);
  }

  const entryCandidates = [packageInfo.module, packageInfo.main, packageInfo.types, "index", "src/index"].filter(Boolean);
  for (const candidate of entryCandidates) {
    const resolved = resolveFileCandidate(path.posix.join(packageInfo.dirPath, toPosix(candidate)), fileSet, resourceSet);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function resolveAliasSpecifier(fromFilePath, specifier, context) {
  const applicableConfigs = context.pathAliasConfigs.filter((config) => {
    return config.dirPath === "" || fromFilePath === config.dirPath || fromFilePath.startsWith(`${config.dirPath}/`);
  });

  for (const config of applicableConfigs) {
    const resolved = resolveAliasWithConfig(specifier, config, context.fileSet, context.resourceSet);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function resolveAliasWithConfig(specifier, config, fileSet, resourceSet) {
  const mappings = Object.entries(config.paths)
    .map(([pattern, targets]) => ({
      pattern,
      targets: Array.isArray(targets) ? targets : [],
      specificity: pattern.replace(/\*/g, "").length
    }))
    .sort((a, b) => b.specificity - a.specificity);

  for (const mapping of mappings) {
    const wildcardValue = matchAliasPattern(specifier, mapping.pattern);
    if (wildcardValue == null) {
      continue;
    }

    for (const target of mapping.targets) {
      const substituted = substituteWildcard(target, wildcardValue);
      const basePath = path.posix.join(config.dirPath || "", normalizePath(config.baseUrl), substituted);
      const resolved = resolveFileCandidate(basePath, fileSet, resourceSet);
      if (resolved) {
        return resolved;
      }
    }
  }

  return null;
}

function resolveFileCandidate(basePath, fileSet, resourceSet = fileSet) {
  const normalizedBase = normalizePath(basePath);
  const candidates = [normalizedBase];

  const extension = path.posix.extname(normalizedBase);
  const candidateExtensions = [...SOURCE_FILE_EXTENSIONS, ...RESOURCE_FILE_EXTENSIONS];
  const shouldTrySourceExtensions = !extension || !candidateExtensions.includes(extension);

  if (shouldTrySourceExtensions) {
    for (const extension of candidateExtensions) {
      candidates.push(`${normalizedBase}${extension}`);
      candidates.push(path.posix.join(normalizedBase, `index${extension}`));
    }
  }

  for (const candidate of candidates) {
    if (fileSet.has(candidate)) {
      return candidate;
    }
    if (resourceSet.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

function walkForResources(currentDir, rootDir, exclude, resourceSet) {
  const relativeDir = path.relative(rootDir, currentDir);
  if (shouldExclude(relativeDir, exclude)) {
    return;
  }

  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = toPosix(path.relative(rootDir, absolutePath));

    if (shouldExclude(relativePath, exclude)) {
      continue;
    }

    if (entry.isDirectory()) {
      walkForResources(absolutePath, rootDir, exclude, resourceSet);
      continue;
    }

    if (RESOURCE_FILE_EXTENSIONS.includes(path.extname(entry.name))) {
      resourceSet.add(relativePath);
    }
  }
}

function matchAliasPattern(specifier, pattern) {
  if (!pattern.includes("*")) {
    return specifier === pattern ? "" : null;
  }

  const [prefix, suffix] = pattern.split("*");
  if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) {
    return null;
  }

  return specifier.slice(prefix.length, specifier.length - suffix.length);
}

function substituteWildcard(target, wildcardValue) {
  return wildcardValue === "" ? target.replace("/*", "").replace("*", "") : target.replace("*", wildcardValue);
}

function normalizePath(input) {
  const normalized = path.posix.normalize(input);
  return normalized.startsWith("./") ? normalized.slice(2) : normalized;
}

function parseJsonWithComments(raw) {
  const stripped = stripJsonComments(raw).replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(stripped);
}

function stripJsonComments(raw) {
  let result = "";
  let index = 0;
  let inString = false;
  let escaped = false;

  while (index < raw.length) {
    const char = raw[index];
    const next = raw[index + 1];

    if (inString) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      index += 1;
      continue;
    }

    if (char === "\"") {
      inString = true;
      result += char;
      index += 1;
      continue;
    }

    if (char === "/" && next === "/") {
      index += 2;
      while (index < raw.length && raw[index] !== "\n") {
        index += 1;
      }
      continue;
    }

    if (char === "/" && next === "*") {
      index += 2;
      while (index < raw.length && !(raw[index] === "*" && raw[index + 1] === "/")) {
        index += 1;
      }
      index += 2;
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}

function shouldExclude(relativePath, exclude) {
  if (!relativePath) {
    return false;
  }

  return exclude.some((segment) => {
    return relativePath === segment || relativePath.startsWith(`${segment}${path.sep}`) || relativePath.startsWith(`${segment}/`);
  });
}

function toPosix(input) {
  return input.split(path.sep).join("/");
}
