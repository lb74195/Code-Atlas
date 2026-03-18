import fs from "node:fs";
import path from "node:path";

const CODE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);

export function listSourceFiles(rootDir, config) {
  const includeRoots = config.include
    .map((entry) => path.join(rootDir, entry))
    .filter((entry) => fs.existsSync(entry));

  const searchRoots = includeRoots.length > 0 ? includeRoots : [rootDir];
  const files = [];

  for (const searchRoot of searchRoots) {
    walk(searchRoot, rootDir, config.exclude, files);
  }

  return files.sort();
}

function walk(currentDir, rootDir, exclude, files) {
  const relativeDir = path.relative(rootDir, currentDir);
  if (shouldExclude(relativeDir, exclude)) {
    return;
  }

  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootDir, absolutePath);

    if (shouldExclude(relativePath, exclude)) {
      continue;
    }

    if (entry.isDirectory()) {
      walk(absolutePath, rootDir, exclude, files);
      continue;
    }

    if (CODE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(absolutePath);
    }
  }
}

function shouldExclude(relativePath, exclude) {
  if (!relativePath) {
    return false;
  }

  return exclude.some((segment) => {
    return relativePath === segment || relativePath.startsWith(`${segment}${path.sep}`);
  });
}
