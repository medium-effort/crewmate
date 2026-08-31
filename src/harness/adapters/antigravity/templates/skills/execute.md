---
name: crewmate-execute
description: >-
  Runs the Crewmate continuous execution loop (/execute) to resolve dependencies, acquire locks, implement tasks, run tests, and mark tasks completed.
---

# Crewmate Continuous Execution Workflow

Use this workflow to execute all pending tasks for the active project brief in dependency order.

## Workflow Steps

### Step 1: Inspect Tasks and Active Locks
1. Call `crewmate_list_tasks` to inspect all tasks and their current statuses (`pending`, `in_progress`, `completed`).
2. Call `crewmate_list_locks` to inspect any active write locks.

### Step 2: Continuous Execution Loop
Execute tasks continuously until all tasks reach `completed` status:

1. **Find Ready Tasks**:
   - Identify `pending` tasks whose prerequisite tasks (dependencies) are all `completed`.
   - If no tasks are ready and pending tasks remain, check for dependency deadlock or errors and alert the user.

2. **Execute Ready Task (Follow `crewmate-executor` skill)**:
   - Identify files to modify or create.
   - **Acquire Locks**: Call `crewmate_acquire_lock(taskId: "...", files: [...])`.
     - If lock fails, abort task, record `crewmate_add_event(type: "error", ...)`, and notify user.
   - **Mark In Progress**: Call `crewmate_update_task(taskId: "...", status: "in_progress")`.
   - **Set Activity**: `crewmate_set_activity(activityType: "orchestrating", message: "Executing task <title>")`.
   - **Implement Changes**: Perform the necessary code edits cleanly.
   - **Verify**: Run tests and linting commands to confirm functionality.
   - **Record Artifacts**: Call `crewmate_add_artifact` for new facts, decisions, API contracts, or constraints.
   - **Mark Completed**: Call `crewmate_update_task(taskId: "...", status: "completed")`.
   - **Release Locks**: Call `crewmate_release_lock(taskId: "...")`.

3. **Repeat**:
   - Return to Step 1 and pick the next ready batch of tasks until all tasks are `completed`.

### Step 3: Final Review & Summary
1. Set activity: `crewmate_set_activity(activityType: "idle", message: "All tasks completed")`.
2. Present a final summary of completed tasks, test results, and newly established contracts to the user.
