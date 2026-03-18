# Repository Guide

Keep this file short. Durable context belongs in versioned docs under `docs/` and generated artifacts under `ai/`.

## Mission

Build a frontend-first code graph compiler that:
- maps symbols, modules, routes, and dependencies into a graph
- detects upgrade and refactor risk for Node.js and frontend packages
- generates AI-facing progressive disclosure docs inside the repository

## Working Rules

- Prefer mechanical constraints over prose-heavy instructions.
- Store plans, architectural rules, and iteration logs in `docs/`.
- Generated artifacts go in `ai/` and should be reproducible from the CLI.
- Use the repo-local harness skill in `skills/agent-team-harness/` for agent role, handoff, and review workflow.
- Avoid hidden context. If an agent needs it again, version it in the repo.

## Golden Principles

- Keep schemas boring and explicit.
- Upgrade advice must point to concrete packages, versions, and affected APIs.
- If analysis is uncertain, label it as heuristic instead of pretending precision.
- Add one reliable feedback loop per iteration: test, fixture, or lint rule.
