# Implementation: llms-upgrade-playbooks

## Changes

- Added a repo-local multi-agent harness skill under `skills/agent-team-harness/`.
- Added deterministic task scaffolding with `scripts/init-task.js` and `npm run new-task`.
- Generated `ai/llms.txt` as the top-level AI entry document.
- Generated package-specific upgrade playbooks under `ai/playbooks/upgrades/`.
- Extended tests to verify the new generated artifacts and source-hit references.

## Commands

- `npm run new-task -- llms-upgrade-playbooks`
- `npm test`
- `npm run smoke`

## Outcomes

- Internal development workflow now has explicit roles, handoffs, and task packets.
- Generated docs now support both top-down navigation and package-specific upgrade review.
- Fixture output confirms source matches land in the relevant upgrade playbook.
