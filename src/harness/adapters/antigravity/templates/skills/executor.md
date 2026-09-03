---
name: crewmate-executor
description: >-
  Executes an assigned Crewmate task cleanly using file locks (crewmate_acquire_lock), running verification, and recording knowledge artifacts.
---

# Executor Task Implementation Protocol

Frontman executes this protocol during the Task Execution phase (e.g., when `/execute` is run) for each ready task in dependency order. Its purpose is to safely implement code changes, prevent file conflicts with locks, verify functionality, and record incremental knowledge artifacts.

## Execution Invariants
- **Lock Before Touch**: Never create or edit a file without first successfully acquiring a write lock via `crewmate_acquire_lock`.
- **Lock Conflict Handling**: If `crewmate_acquire_lock` fails due to an active lock on a target file, **abort the task immediately**. Do not edit conflicting files. Emit a `crewmate_add_event` (actor `executor`, type `error`, message `"Lock conflict on <file>"`) and report the conflict.
- **Mandatory Verification**: Every code modification must be verified by executing tests, linters, or build commands before marking the task completed.
- **Clean Lock Release**: Always release file locks using `crewmate_release_lock` upon task completion or failure. Never leave dangling locks.

---

## Step-by-Step Task Execution Loop

For each ready task:

### 1. Task Intake & Context Gathering
- Inspect task details (ID, title, description, target field).
- Review established patterns, contracts, and constraints by inspecting prior artifacts with `crewmate_list_artifacts`.

### 2. Lock Acquisition
- Identify all target files to be created or modified.
- Acquire write locks: `crewmate_acquire_lock(taskId: "<taskId>", files: ["path/to/file1", ...])`.
- On lock acquisition failure, halt and report.

### 3. Mark In Progress & Set Activity
- Mark task in progress: `crewmate_update_task(taskId: "<taskId>", status: "in_progress")`.
- Update live dashboard: `crewmate_set_activity(activityType: "orchestrating", message: "Executing: <task title>")`.

### 4. Implementation & Verification
- Perform the necessary file additions, edits, or deletions.
- Follow existing workspace conventions.
- Execute automated tests, type checks, or linters via terminal commands to confirm correctness.

### 5. Record Knowledge Artifacts
Record architectural decisions, API contracts, or constraints using `crewmate_add_artifact`:
- `fact`: Concrete facts about system configuration or state.
- `decision`: Key design or architectural choices made.
- `api_contract`: Route, interface, or schema signatures exposed for subsequent tasks.
- `constraint`: Important rules, gotchas, or bounds subsequent tasks must observe.

### 6. Completion & Lock Release
- Mark task completed: `crewmate_update_task(taskId: "<taskId>", status: "completed")`.
- Release write locks: `crewmate_release_lock(taskId: "<taskId>")`.
- Summarize files modified and verification results in the execution log.
