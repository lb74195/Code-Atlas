# Architecture

## Scope

This repository is the bootstrap POC for a larger product direction:

- frontend-first code graph extraction
- dependency upgrade intelligence
- AI-facing progressive disclosure docs

## Primary Pipeline

1. Read project configuration and package metadata.
2. Scan relevant frontend source files.
3. Discover workspace packages and path alias rules when present.
4. Extract graph primitives with low-cost heuristics.
5. Attach dependency and upgrade advisory nodes.
6. Emit JSON graph plus layered Markdown documents.

## Graph Model

Core node kinds:

- `project`
- `runtime`
- `dependency`
- `directory`
- `file`
- `route`
- `symbol`
- `advisory`

Core edge kinds:

- `CONTAINS`
- `DECLARES`
- `IMPORTS`
- `CALLS`
- `USES_COMPONENT`
- `IMPLEMENTS_ROUTE`
- `DEPENDS_ON`
- `TARGETS_VERSION`
- `TRIGGERS_ADVISORY`
- `AFFECTS_FILE`
- `AFFECTS_SYMBOL`

## Constraints

- Keep extraction dependency-free for the first iteration.
- Prefer explicit heuristics and confidence labels over overstated precision.
- Put package upgrade knowledge in data files so paid reasoning can build on top.
