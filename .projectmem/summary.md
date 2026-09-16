# projectmem - crewmate

_Last updated: 2026-09-16_

## Project purpose
AI agent workflow CLI tool

## Recent issues
- [DONE] #legacy_eb98 Legacy issue: fix(editor): preserve horizontal layout with orphaned nodes and prevent edge label collision -> fix(editor): preserve horizontal layout with orphaned nodes and prevent edge label collision (fixed)
- [DONE] #legacy_9cdd Legacy issue: Merge pull request #26 from errevion/fix/deploy-docs-master -> Merge pull request #26 from errevion/fix/deploy-docs-master (fixed)
- [DONE] #legacy_488a Legacy issue: fix(lock): prevent executor lock release tampering and enforce authorization -> fix(lock): prevent executor lock release tampering and enforce authorization (fixed)

## Decisions
- No decisions logged yet.

## Notes
- feat(editor): add interactive terminal TUI workflow editor
- feat(editor): restrict node and stage creation to discovered files and remove rename hotkey
- feat(workflow): add node-level tracking and advance-node orchestration for Frontman
- feat(artifact): redesign artifact system with memory and judgment capabilities
- Merge pull request #27 from errevion/feat/tui-workflow-editor
- chore: bump version to 0.4.5
- Merge pull request #28 from errevion/feat/tui-workflow-editor
- feat(workflow): add interview depth, scout approval, and task approval gates
- feat(artifact): decouple artifacts from briefs and add secret redaction, staleness detection, and distilled summary
- Merge pull request #29 from errevion/feat/default-workflow-approval-gates

## Key files
- `.eslintrc.cjs`
- `README.md`
- `package.json`
- `src/commands/artifact.ts`
- `src/commands/brief.ts`
- `src/commands/event.ts`
- `src/commands/lock.ts`
- `src/commands/task.ts`
- `src/commands/watch.ts`
- `src/commands/workflow.ts`
- `src/db/brief-repo.ts`
- `src/db/lock-repo.ts`
- `src/db/migrations.ts`
- `src/db/session-repo.ts`
- `src/db/task-repo.ts`
- `src/db/workflow-repo.ts`
- `src/graph/default-workflow.ts`
- `src/graph/engine.ts`
- `src/graph/modular-templates.ts`
- `src/graph/resolver.ts`

## Open questions
- None logged yet.
