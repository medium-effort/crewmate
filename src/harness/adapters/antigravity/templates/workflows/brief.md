---
description: Initiate or refine a Crewmate project brief, gather requirements interactively, verify completeness, and break down tasks.
---

# /brief Workflow

This workflow guides the user through structured, conversational requirement gathering, codebase discovery, and task decomposition.

> [!IMPORTANT]
> **Pacing & Turn Invariant**: Never combine multiple phases into a single turn! The agent must stop, render chat output, and yield to the user at each phase gate. Do not greedily execute ahead.

---

## Workflow Phases

### Phase 1: Core Goal & Scope Formulation
1. **Initialize**: Call `crewmate_create_brief(projectPath: "<active_workspace_path>")` (or retrieve active brief via `crewmate_show_brief`).
2. **Set Initial Activity**: `crewmate_set_activity(activityType: "questioning", message: "Formulating project goal & scope")`.
3. **Extract & Persist Basics**:
   - Determine `workType` (`software` | `infrastructure` | `data` | `documentation` | `audit`).
   - Determine `goal` (clear 1-2 sentence statement).
   - Persist both via `crewmate_update_field`.
4. **Print Proposed Scope to Chat & Yield with Question**:
   - **MANDATORY VISIBLE CHAT TEXT**: You MUST print the complete proposed scope into the conversation response (do NOT leave it in your thinking block!):
     ```markdown
     ### 🎯 Proposed Project Scope

     **Included:**
     - [Deliverable / feature 1]
     - [Deliverable / feature 2]

     **Excluded:**
     - [Out-of-scope item 1]
     - [Out-of-scope item 2]
     ```
   - In the exact same response turn, invoke `ask_question` with a compact question:
     - Question: `"Do you accept this proposed scope for the project?"`
     - Options:
       - `(Recommended) Accept scope as proposed`
       - `I want to adjust the scope (specify in write-in)`
   - > [!WARNING]
   - > Never call `ask_question` without first printing the `### 🎯 Proposed Project Scope` markdown block to chat. The user cannot see the contents of your private thinking block.
5. **STOP AND YIELD TO USER**: Wait for the user's response before continuing.

---

### Phase 2: Functional Requirements & Acceptance Criteria
1. **Persist Scope**: Call `crewmate_update_field(field: "scope", value: "...")` with the agreed JSON object.
2. **Print Requirements & Criteria to Chat & Yield with Question**:
   - **MANDATORY VISIBLE CHAT TEXT**: Print the proposed numbered list of `functionalRequirements` and `acceptanceCriteria` in your chat message response.
   - In the exact same turn, call `ask_question` with a compact question:
     - Question: `"Do you accept these functional requirements and acceptance criteria?"`
     - Options:
       - `(Recommended) Accept requirements and criteria as listed`
       - `I want to modify the requirements or criteria`
3. **STOP AND YIELD TO USER**: Wait for the user's response before continuing.

---

### Phase 3: Status Check & Discovery Offer
1. **Persist Requirements & Criteria**:
   - Persist `functionalRequirements` (JSON array of strings) via `crewmate_update_field`.
   - Persist `acceptanceCriteria` (JSON array of strings) via `crewmate_update_field`.
2. **Check Completeness**: Call `crewmate_check_status`.
3. **Print Status Summary Table to Chat & Offer Discovery**:
   - **MANDATORY VISIBLE CHAT TEXT**: Print the full-width status table in your chat message response:
     ```markdown
     | Required Field | Status | Summary |
     |---|---|---|
     | workType | ✓ set | [value] |
     | goal | ✓ set | [value] |
     | scope | ✓ set | [count] included, [count] excluded |
     | functionalRequirements | ✓ set | [count] requirements |
     | acceptanceCriteria | ✓ set | [count] criteria |
     ```
   - In the exact same turn, prompt the user via `ask_question` with a compact question:
     - Question: `"How would you like to proceed with optional brief fields?"`
     - Options:
       - `(Recommended) Dispatch Scout for workspace discovery`
       - `Finalize brief now with required fields only`
       - `Provide optional fields manually`
4. **STOP AND YIELD TO USER**: Wait for the user's response before continuing.

---

### Phase 4: Codebase Discovery & Optional Fields (If Scout Selected)
1. **Set Activity**: `crewmate_set_activity(activityType: "analyzing", message: "Scout workspace discovery")`.
2. **Execute Discovery**: Follow the `crewmate-scout` skill protocol. Inspect manifests, directory structure, tooling, and configs.
3. **Print Report**: Render the dedicated findings card in chat (`### 🔍 Scout Codebase Findings`).
4. **Print Proposed Optional Fields & Yield with Question**:
   - Present proposed values for `technicalStack`, `constraints`, `deliverables`, `qualityStandards`, etc. in chat message text (`content`).
   - Group complex fields using clear categories matching their schema (or simple lists, which Crewmate automatically normalizes):
     - `technicalStack`: Sub-categories like `frontend`, `backend`, `database`, `tools` (or custom stack keys).
     - `constraints`: Sub-categories for `requirements` and `exclusions`.
     - `deliverables`: Items specifying `type` (`code` | `doc` | `report`) and `format` description.
     - `qualityStandards`: Sub-categories for `testing`, `performance`, `security` (or general standards).
   - In the exact same turn, call `ask_question` with a compact question:
     - Question: `"Do you want to persist these optional fields to the brief?"`
     - Options:
       - `(Recommended) Persist optional fields as proposed`
       - `Adjust optional fields (specify in write-in)`
       - `Skip optional fields and proceed to finalize`
5. **STOP AND YIELD TO USER**: Wait for the user's response before continuing.

---

### Phase 5: Finalize Brief & Propose Task Decomposition
1. **Persist Optional Fields**: Persist agreed optional fields via `crewmate_update_field`.
2. **Finalize**: Call `crewmate_check_status`, then `crewmate_finish_brief`.
3. **Set Activity**: `crewmate_set_activity(activityType: "planning", message: "Decomposing brief into tasks")`.
4. **Decompose Tasks**: Follow the `crewmate-planner` skill protocol to break the brief into discrete, dependency-ordered tasks.
5. **Print Task Breakdown Table to Chat & Yield with Question**:
   - **MANDATORY VISIBLE CHAT TEXT**: Print the complete task breakdown table in your chat message response:
     ```markdown
     ### 📋 Proposed Task Breakdown

     | # | Task Title | Description | Dependencies | Addresses Field |
     |---|---|---|---|---|
     | 1 | [Title] | [Brief work description] | None | [field] |
     | 2 | [Title] | [Brief work description] | Task 1 | [field] |
     ```
   - In the exact same turn, call `ask_question` with a compact question referencing the table above:
     - Question: `"Do you approve the implementation task breakdown above?"`
     - Options:
       - `(Recommended) Approve task breakdown and register tasks`
       - `Adjust task breakdown (specify in write-in)`
6. **STOP AND YIELD TO USER**: Wait for the user's response before continuing.

---

### Phase 6: Task Registration & Next Steps
1. **Register Tasks**: On user approval, sequentially call `crewmate_add_task` for each task (passing `title`, `description`, `dependencies` with returned task IDs; `briefId` defaults automatically to the active brief).
2. **Display Final Registry**: Call `crewmate_list_tasks` and render the registered task table in your chat response.
3. **Set Activity**: `crewmate_set_activity(activityType: "idle", message: "Briefing complete")`.
4. **Next Step**: Inform the user that the brief and tasks are ready, and they can run `/execute` whenever ready.
