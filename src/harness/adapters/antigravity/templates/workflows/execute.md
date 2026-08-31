---
description: Execute pending tasks for the active Crewmate brief in dependency order with file locks and verification.
---

# /execute Workflow

Step-by-step instructions for running the Crewmate continuous execution loop to resolve dependencies, acquire locks, implement tasks, run tests, and mark tasks completed.

## Workflow Steps

### 1. Inspect Tasks & Locks
1. Call `crewmate_list_tasks` to inspect all tasks and statuses (`pending`, `in_progress`, `completed`).
2. Call `crewmate_list_locks` to inspect any active write locks.

### 2. Continuous Execution Loop
Execute tasks continuously until all tasks reach `completed` status:

1. **Identify Ready Tasks**:
   - Find `pending` tasks whose dependencies are all `completed` (or have no dependencies).
   - If no tasks are ready and pending tasks remain, check for circular dependencies or errors.

2. **Execute Ready Task (Follow `crewmate-executor` skill)**:
   - Identify target files to modify or create.
   - **Acquire Locks**: Call `crewmate_acquire_lock(taskId: "...", files: [...])`.
     - If lock fails, abort task, record `crewmate_add_event(type: "error", ...)`, and notify user.
   - **Mark In Progress**: Call `crewmate_update_task(taskId: "...", status: "in_progress")`.
   - **Update Activity**: `crewmate_set_activity(activityType: "orchestrating", message: "Executing task <title>")`.
   - **Implement Changes**: Perform the code edits cleanly.
   - **Verify**: Run tests and linting to confirm functionality.
   - **Record Artifacts**: Call `crewmate_add_artifact` for new facts, decisions, contracts, or constraints.
   - **Mark Completed**: Call `crewmate_update_task(taskId: "...", status: "completed")`.
   - **Release Locks**: Call `crewmate_release_lock(taskId: "...")`.

3. **Repeat**:
   - Return to Step 1 and pick the next batch of ready tasks until all tasks in the brief reach `completed`.

### 3. Summary & Review
1. Update activity: `crewmate_set_activity(activityType: "idle", message: "All tasks completed")`.
2. Present a final summary of completed tasks, test results, and newly established contracts.
