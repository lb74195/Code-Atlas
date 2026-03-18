# Brief: llms-upgrade-playbooks

## Objective

- Add an AI-facing top-level entry document and package-specific upgrade playbooks to the generated output.

## Facts

- The repository already generates `overview.md`, `dependencies.md`, module docs, and a refactor playbook.
- Dependency advisories already include affected patterns and matched source occurrences.
- The current output lacks a single AI entry file and lacks dedicated upgrade docs per package.

## Constraints

- Keep the implementation dependency-free.
- Reuse current analysis outputs instead of introducing new parsing layers.
- Treat generated docs as deterministic artifacts under `ai/`.

## Open Questions

- How much detail should `llms.txt` include versus linking to deeper docs?
- Should packages without triggered advisories get individual playbooks in this iteration?
