#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const slug = process.argv[2];

if (!slug) {
  console.error('Usage: node ./scripts/init-task.js "<task-slug>"');
  process.exit(1);
}

const safeSlug = slug
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

if (!safeSlug) {
  console.error("Task slug must contain letters or numbers.");
  process.exit(1);
}

const taskDir = path.resolve("work", safeSlug);
fs.mkdirSync(taskDir, { recursive: true });

writeIfMissing(
  path.join(taskDir, "brief.md"),
  `# Brief: ${safeSlug}

## Objective

-

## Facts

-

## Constraints

-

## Open Questions

-
`
);

writeIfMissing(
  path.join(taskDir, "plan.md"),
  `# Plan: ${safeSlug}

## Steps

1.

## Verification

- 

## Non-Goals

- 
`
);

writeIfMissing(
  path.join(taskDir, "implementation.md"),
  `# Implementation: ${safeSlug}

## Changes

-

## Commands

- 

## Outcomes

- 
`
);

writeIfMissing(
  path.join(taskDir, "review.md"),
  `# Review: ${safeSlug}

## Findings

- 

## Open Questions

- 

## Residual Risks

- 
`
);

writeIfMissing(
  path.join(taskDir, "reflection.md"),
  `# Reflection: ${safeSlug}

## What Worked

- 

## What Broke

- 

## Next Tightening Move

- 
`
);

console.log(taskDir);

function writeIfMissing(filePath, contents) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, contents);
  }
}
