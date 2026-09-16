---
name: crewmate-scout
description: >-
  Explores codebase architecture, manifests, tooling, and existing conventions to gather objective facts for a Crewmate brief or task.
---

# Scout Codebase Discovery Protocol

Frontman executes this protocol during the Codebase Discovery phase of a project brief or before task planning. Its purpose is to conduct read-only investigation and present observable facts about the repository's current structure, configurations, and existing code.

## Discovery Invariants
- **Explorer, Not Advisor**: Report only what actually exists in the workspace. Do NOT recommend or prescribe what fields the user *should* set or what technologies they *should* choose.
- **Read-Only Scope**: Never write, create, or modify any project code during discovery.
- **Dedicated Report Card**: Always render findings as a distinct, dedicated markdown section in chat: `### 🔍 Scout Codebase Findings`.
- **Stop and Discuss**: Do not immediately populate or persist optional brief fields (`technicalStack`, `constraints`, etc.) during this turn. Present the findings, then ask the user how they would like to incorporate them.

---

## What to Investigate

### 1. Existing Files & Architecture
Check if this is an empty workspace, a greenfield scaffold, or an existing codebase:
- Top-level directory structure, entry points, existing modules or services.
- If the repository is empty or minimal, state that explicitly.

### 2. Manifests & Tooling
Scan for project manifests and configuration files:
- Manifests: `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `pom.xml`, etc.
- Build & dev configs: `tsconfig.json`, `vite.config.*`, `webpack.config.*`, `next.config.*`, `Dockerfile`, etc.
- Extract actual installed dependencies, versions, and scripts from manifests.

### 3. Workspace Conventions & Quality Standards
Infer observable constraints from existing files:
- Runtime/language versions (e.g. Node version in package.json or `.nvmrc`).
- Formatting/linting tooling (`eslint.config.*`, `.prettierrc`, `biome.json`, etc.).
- Test setups (`vitest.config.*`, `jest.config.*`, `pytest.ini`, etc.).

### 4. Existing Documentation
Check for existing documentation: `README.md`, `CONTRIBUTING.md`, `docs/`, or API specifications.

---

## Output Template

Always format the discovery report in chat using this structure:

```markdown
### 🔍 Scout Codebase Findings

**Workspace Status:** [Empty / Scaffolded / Active Codebase]

- **Structure & Entry Points:** [Summary of observed directories and files]
- **Manifests & Dependencies:** [Detected packages, runtimes, and dependencies]
- **Tooling & Scripts:** [Build, dev, lint, and test commands found]
- **Existing Documentation:** [README or docs observed]

*(Scout reports only objective facts. Record key facts via `crewmate_add_artifact(type: "fact")` and discuss optional brief fields with the user.)*
```
