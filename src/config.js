import fs from "node:fs";
import path from "node:path";

const DEFAULT_CONFIG = {
  projectName: "frontend-context-graph",
  targets: {},
  include: ["src", "app", "pages", "components"],
  exclude: ["node_modules", "dist", "build", ".next", "coverage"]
};

export function loadConfig(cwd, configPath) {
  if (!configPath) {
    const candidate = path.join(cwd, "context-graph.config.json");
    if (!fs.existsSync(candidate)) {
      return DEFAULT_CONFIG;
    }
    configPath = candidate;
  }

  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw);
  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    include: parsed.include ?? DEFAULT_CONFIG.include,
    exclude: parsed.exclude ?? DEFAULT_CONFIG.exclude,
    targets: parsed.targets ?? DEFAULT_CONFIG.targets
  };
}

export function validateConfig(config) {
  const errors = [];

  if (!Array.isArray(config.include) || config.include.length === 0) {
    errors.push("config.include must be a non-empty array");
  }

  if (!Array.isArray(config.exclude)) {
    errors.push("config.exclude must be an array");
  }

  if (typeof config.targets !== "object" || config.targets === null || Array.isArray(config.targets)) {
    errors.push("config.targets must be an object");
  }

  return errors;
}
