# Agent OODA

This document governs how the agent operates on the repository. It is not a feature of the product being built.

## Observe

- start from a failing test, missing capability, or a concrete product hypothesis
- inspect generated `ai/` artifacts before changing extraction logic
- capture drift or confusion in versioned docs instead of private notes

## Orient

- read `AGENTS.md`, `docs/architecture.md`, and the relevant generated module docs
- check `dependencies.md` for upgrade risks before framework or runtime changes
- prefer rules and data files over scattered conditional logic

## Decide

- keep the schema stable unless a clear downstream gain exists
- bias toward deterministic generation over cleverness
- when certainty is low, preserve confidence labels and heuristic wording

## Act

- implement the smallest end-to-end increment
- add or update a fixture that exercises the new behavior
- regenerate artifacts and verify them

## Reflect

- record what failed and why in the current iteration doc
- convert recurring cleanup into repository rules, tests, or generators
- keep `AGENTS.md` small and push durable guidance into versioned docs
