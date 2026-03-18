# Roles

## Scout

- inspect repository state, generated artifacts, and failing signals
- gather only the context needed for the current increment
- write facts, open questions, and constraints into the task brief

## Planner

- turn findings into the smallest end-to-end increment
- define verification before implementation starts
- keep only one in-progress step at a time

## Builder

- implement the chosen increment
- update tests, fixtures, generators, and docs together
- avoid broad speculative refactors during focused tasks

## Reviewer

- review like a code reviewer, not like a summarizer
- prioritize bugs, regressions, missing tests, and unclear assumptions
- demand concrete evidence for risky claims

## Reflector

- record what was brittle, noisy, or expensive
- convert repeat pain into scripts, rules, templates, or backlog items
- keep reflection short and actionable
