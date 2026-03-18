---
name: agent-team-harness
description: Use this skill when developing this repository with multiple agents or role-separated passes. It defines the internal team workflow, handoff artifacts, review expectations, and deterministic task scaffolding for Scout, Planner, Builder, Reviewer, and Reflector roles.
---

# Agent Team Harness

Use this skill for repository development. It governs how the agent team works; it is not product functionality.

## When to use

- Any non-trivial repository change
- Any task that benefits from role separation or explicit review
- Any iteration that should leave durable task artifacts behind

## Roles

Read [references/roles.md](references/roles.md) when assigning or simulating roles.

- `Scout`: gather repository facts and current signals
- `Planner`: define the smallest useful increment
- `Builder`: implement and verify
- `Reviewer`: find regressions, risks, and missing tests
- `Reflector`: convert lessons into rules or backlog items

## Workflow

Read [references/workflow.md](references/workflow.md) before starting substantial work.

1. Create a task packet with `node ./scripts/init-task.js "<slug>"`.
2. Record facts and assumptions in the task packet, not only in chat.
3. Keep one active increment small enough to verify locally.
4. Run the reviewer pass before declaring completion.
5. Write reflection notes and convert recurring issues into rules, fixtures, or backlog items.

## Required artifacts

Read [references/artifacts.md](references/artifacts.md) when a task spans more than one edit or verification step.

- task brief
- task plan
- implementation log
- review findings
- reflection

## Guardrails

- Share one repository truth source; do not let roles invent separate assumptions.
- Prefer deterministic scripts and fixtures over free-form repeated reasoning.
- If confidence is low, preserve uncertainty in the artifact and narrow scope.
- If a role finds ambiguity that blocks safe execution, stop and resolve it explicitly.
