---
name: workflow
description: >-
  Execute and coordinate graph-based Crewmate workflows, dynamic node execution, stage transitions, and agent handoffs.
  Use when the user wants to start a project, brief requirements, plan tasks, or run workflow steps.
---

# /workflow

This skill executes the active Crewmate graph workflow dynamically according to stage and node definitions.

---

## Dynamic Graph Execution Loop

1. **Check or Initialize Workflow Run**:
   - Call `crewmate_workflow_status`.
   - If no active workflow run exists, create a brief session record (`crewmate_create_brief`) and start a new workflow run (`crewmate_workflow_start`).
   - If an active run exists, inspect `currentStage` and `currentNode` to resume execution immediately.

2. **Execute Active Node Dynamically**:
   Inspect `currentNode` returned by `crewmate_workflow_status`:
   - **Node Prompt**: Read and follow the instructions dynamically provided in `currentNode.prompt`.
   - **Tool Permissions**: Respect `currentNode.allowedTools` and `currentNode.deniedTools` during this step.
   - **Progressive Skills**: When the node involves specialized roles, consult the corresponding skill:
     - Research & Discovery -> Consult `crewmate-scout` skill protocol.
     - Planning & Decomposition -> Consult `crewmate-planner` skill protocol.
     - Implementation & Task Execution -> Consult `crewmate-executor` skill protocol (precheck files with `crewmate_precheck_file`, inspect upstream DAG context via `crewmate_list_artifacts(forTask: ...)`, acquire locks, and record artifacts).
   - **Live Activity**: Keep `crewmate_set_activity` updated to reflect the active operational phase (`questioning`, `analyzing`, `planning`, `orchestrating`, `reviewing`, `idle`).

3. **Advance Graph State**:
   - When node objectives are satisfied, call `crewmate_workflow_advance_node` (passing any output parameters like `outputs: "{\"approved\": true}"` if required by conditions).
   - When all nodes in the current stage are completed, call `crewmate_workflow_advance` to transition to the next stage.

---

## Antigravity UI & Modal Guardrails

- **Visible Chat Proposals Before Modals**:
  - Always render proposals (scope cards, multi-column status tables from `crewmate_check_status`, task breakdown tables, scout findings) into the **visible chat message text (`content`)** *before* or alongside calling `ask_question`.
  - **Never** formulate proposals solely inside internal `<thought>` scratchpads or cram entire markdown tables inside the modal dialog box.
- **Compact Modal Questions**:
  - Keep the `question` field in `ask_question` strictly concise (1–2 sentences).
  - Format selectable options as direct first-person user responses, placing your recommended choice first prefixed with `(Recommended)`.
- **Turn-Yielding Checkpoints**:
  - At human input or approval nodes (e.g. scoping decisions, plan approval, stage transitions), ask your question via `ask_question` and **STOP calling tools immediately** to yield the turn to the user. Do not greedily execute ahead without user input.
