# Refactor Playbook

1. Read `overview.md` and the relevant module file to identify local boundaries.
2. Read `dependencies.md` if the change touches runtime, framework, or package upgrades.
3. Search for files that import the target symbol before moving or renaming it.
4. If an upgrade advisory is present, search for affected patterns before editing code.
5. Regenerate the graph after the change and review module drift.
