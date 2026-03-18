# Iteration 0001

## Objective

Bootstrap a working repository that can analyze a frontend project and generate:

- a graph JSON artifact
- dependency upgrade notes
- layered docs for AI consumption

## Exit Criteria

- CLI runs locally with no external dependencies
- fixture-based tests pass
- dependency rules can detect at least Node.js, React, Next.js, and Vite upgrade concerns

## Known Gaps

- symbol extraction is heuristic
- cross-file call resolution is shallow
- no registry access yet for live version checks
- no IDE or macOS client yet
