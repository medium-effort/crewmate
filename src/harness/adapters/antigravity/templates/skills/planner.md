---
name: crewmate-planner
description: >-
  Decomposes a completed Crewmate brief into concrete, dependency-ordered implementation tasks with conflict prevention.
---

# Planner Task Decomposition Protocol

Frontman executes this protocol during the Task Decomposition phase of a project brief once the brief is finalized. Its purpose is to analyze the completed brief, inspect the codebase architecture, and decompose the project into concrete, dependency-ordered implementation tasks.

## Planning Invariants & Conflict Prevention
- **Focused Granularity**: Each task should represent a discrete, demonstrable increment of work (e.g. 1 module, 1 set of endpoints, 1 UI view). Avoid micro-tasks (trivial single-line edits) and monolithic mega-tasks.
- **File Collision Prevention**: If two tasks are expected to create or modify the same target files, establish an explicit dependency between them. This prevents file locking collisions during execution.
- **Pre-Flight Proposal Visibility**: Frontman must display the full proposed task list in the chat message or clearly within the `ask_question` prompt. Never ask the user to approve a task breakdown without showing them what they are approving!
- **Approval Gate**: Tasks must be reviewed and approved by the user before registering them in the database with `crewmate_add_task`.

---

## Task Structure

Every proposed task must define:
1. **Title**: Concise name (5–10 words) describing the task objective.
2. **Description**: Clear description of work to be performed, target files, and verification criteria.
3. **Dependencies**: IDs or titles of preceding tasks that must be completed first.
4. **Brief Field**: Traceability reference to the specific brief field addressed (e.g., `technicalStack`, `functionalRequirements`, `acceptanceCriteria`).

---

## Presentation & Approval Format

When preparing the task proposal for user approval:

1. **In Chat Output (`content`)**:
   Render the complete task breakdown as a readable markdown table at full chat width:
   ```markdown
   ### 📋 Proposed Task Breakdown

   | # | Task Title | Description | Dependencies | Addresses Field |
   |---|---|---|---|---|
   | 1 | [Task Title] | [Detailed work description] | None | [field] |
   | 2 | [Task Title] | [Detailed work description] | Task 1 | [field] |
   ```

2. **In `ask_question` Modal**:
   Keep the question prompt **strictly compact** and reference the proposal table in chat:
   ```json
   {
     "question": "Do you approve the implementation task breakdown above?",
     "options": [
       "(Recommended) Approve task breakdown and register tasks",
       "Adjust task breakdown (specify in write-in)"
     ]
   }
   ```
   > [!IMPORTANT]
   - You MUST write the complete `### 📋 Proposed Task Breakdown` markdown table into the visible chat message response. Do NOT keep it inside your private thinking block!
   - Never place task details, descriptions, or tables inside the `ask_question` prompt. The full breakdown renders cleanly in the chat stream above the question dialog.

---

## Post-Approval Registration Protocol

Once the user approves:
1. Register each task sequentially using `crewmate_add_task`:
   - Pass `title`, `description`, and `dependencies` (array of preceding task IDs).
   - `briefId` defaults automatically to the active brief (or can be passed explicitly).
   - Note each returned task ID for subsequent tasks that depend on it.
2. Call `crewmate_list_tasks` to retrieve the registered task registry.
3. Display the final registered task table in your chat response.
4. Advance node: `crewmate_workflow_advance_node`.
