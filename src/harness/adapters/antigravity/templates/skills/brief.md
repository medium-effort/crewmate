---
name: crewmate-brief
description: >-
  Initiates or continues a Crewmate project brief (/brief), gathers requirements interactively, verifies brief completeness, and decomposes tasks.
---

# Crewmate Briefing Workflow

Use this workflow to guide the user through creating or refining a project brief and breaking it down into actionable tasks.

## Workflow Steps

### Step 1: Initialize Brief
1. Call `crewmate_create_brief(projectPath: "<active_workspace_path>")` to create a new brief (or retrieve the latest with `crewmate_show_brief(projectPath: "<active_workspace_path>")`). The server binds this workspace path for all subsequent tool calls in the session.
2. Set activity: `crewmate_set_activity(activityType: "analyzing", message: "Inspecting repository context")`.

### Step 2: Codebase Discovery
1. Follow the `crewmate-scout` skill to inspect existing project manifests, dependencies, architecture, and conventions.
2. Report objective facts to the user without prescribing architectural decisions.

### Step 3: Interactive Requirement Gathering
1. Set activity: `crewmate_set_activity(activityType: "questioning", message: "Gathering brief requirements")`.
2. Use `ask_question` to ask the user for required fields:
   - `workType`: `software` | `infrastructure` | `data` | `documentation` | `audit`
   - `goal`: Clear summary of the objective
   - `scope`: `{"included": [...], "excluded": [...]}`
   - `functionalRequirements`: Array of requirements
   - `acceptanceCriteria`: Array of acceptance criteria
3. Persist each agreed field with `crewmate_update_field`.
4. Discuss and set optional fields: `technicalStack`, `constraints`, `qualityStandards`, `dependencies`, `risks`, `deliverables`.

### Step 4: Verify Completeness & Complete Brief
1. Call `crewmate_check_status` to verify that all required fields are set.
2. If incomplete, prompt the user for remaining fields.
3. Once complete, call `crewmate_finish_brief`.

### Step 5: Task Decomposition
1. Set activity: `crewmate_set_activity(activityType: "planning", message: "Decomposing brief into tasks")`.
2. Follow the `crewmate-planner` skill to break the brief into dependency-ordered implementation tasks.
3. Ask for user confirmation via `ask_question`:
   - Format the proposed tasks inside the `question` field as a clean, vertical numbered list (Task #, Title, 1-line description, Dependencies). Do NOT use markdown tables inside `ask_question` because the modal dialog is too narrow.
   - Provide standard approval options (`(Recommended) Approve and register tasks`, `Adjust the task breakdown`).
4. On approval, persist each task using `crewmate_add_task`.
5. Display the final registered task list table using `crewmate_list_tasks` in your final chat response.
6. Set activity: `crewmate_set_activity(activityType: "idle", message: "Briefing complete")`.
