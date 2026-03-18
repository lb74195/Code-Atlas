# Plan: llms-upgrade-playbooks

## Steps

1. Add `llms.txt` generation that points to the main generated docs in a progressive order.
2. Add per-package upgrade playbook generation for packages with triggered advisories.
3. Extend tests to assert the new artifacts exist and contain expected package-specific guidance.

## Verification

- `npm test`
- `npm run smoke`
- Inspect generated fixture docs for `llms.txt` and `playbooks/upgrades/*.md`

## Non-Goals

- live registry version comparison
- parser-backed semantic extraction
- cloud-side semantic summarization
