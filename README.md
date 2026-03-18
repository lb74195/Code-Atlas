# Frontend Context Graph

`frontend-context-graph` is a frontend-first POC for turning a JavaScript or TypeScript repository into:

- a code knowledge graph
- a dependency upgrade risk report
- progressive disclosure documents for AI agents and human maintainers

## Why

Modern coding agents lose accuracy when they receive either too little repository structure or too much undifferentiated context. This project compiles a frontend repository into layered artifacts that are easier to navigate:

- overview -> domain/module -> file/symbol -> refactor playbook
- package/runtime dependencies -> version targets -> breaking-change advisories

The long-term goal is an open core:

- open source: local graph extraction, dependency modeling, basic docs generation
- paid or self-hosted service: higher-quality semantic grouping, richer upgrade reasoning, team memory, and IDE or desktop workflows

## Current POC

The first version focuses on React and Next.js shaped repositories without external parsers:

- scans frontend source files
- extracts files, symbols, imports, calls, JSX component usage, and route hints
- maps package and runtime dependencies
- evaluates upgrade advisories against configured target versions
- highlights files that appear to use affected APIs or patterns during upgrades
- writes progressive disclosure docs into `ai/`

## Usage

```bash
node ./src/cli.js analyze /path/to/repo
```

Options:

```bash
node ./src/cli.js analyze /path/to/repo --output ai
node ./src/cli.js analyze /path/to/repo --config context-graph.config.json
node ./src/cli.js validate-config
```

## Output

- `ai/llms.txt`
- `ai/graph.json`
- `ai/overview.md`
- `ai/dependencies.md`
- `ai/modules/*.md`
- `ai/playbooks/refactor.md`
- `ai/playbooks/upgrades/*.md`
