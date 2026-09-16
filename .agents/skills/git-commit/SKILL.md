---
name: git-commit
description: >-
  Generate Conventional Commits (v1.0.0) compliant git commit messages with
  categorized sections (Features, Fixes, Refactoring) from uncommitted project changes.
  Ensures plain text formatting without markdown links, URLs, or absolute paths.
  Use whenever asked to create, format, or suggest a git commit message or summary.
---

# Git Commit Skill

This skill provides procedures and style standards for analyzing uncommitted project changes and generating structured, categorized git commit messages adhering to the [Conventional Commits (v1.0.0)](https://www.conventionalcommits.org/en/v1.0.0) specification.

## Procedure

### 1. Inspect Workspace Changes
1. Check changed files using `git status -s`.
2. Inspect exact modifications using `git diff` (or `git diff --cached` for staged changes).
3. If untracked files are present and relevant, inspect their contents.

### 2. Commit Message Structure & Standards
Always format git commit messages following the Conventional Commits specification (v1.0.0) with clearly grouped sections:

1. **Header Line**: A short summary of the changes, prefixed with a type (e.g. `feat`, `fix`, `refactor`, `docs`, `chore`) and an optional scope (e.g., `feat(cli): add export option`).
2. **Body Sections**: Group bullet points under clear headers representing categories of changes:
   - **Features**: New functionality or visual additions.
   - **Fixes**: Bug fixes, input blocking corrections, draw order fixes, or leak cleanups.
   - **Refactoring**: Code cleanups, architectural shifts (like migrating inline code to scenes), and UID preloading refactors.
   - Additional categories (e.g., **Documentation**, **Chores**) can be added if applicable.
3. **No Agent-Style Formatting**:
   - Commit messages must be written in plain text inside a ````commit` code block.
   - Do NOT use markdown link syntax (e.g., `[filename](file:///...)`), absolute or relative paths, or URLs in the commit header, body, or description.
   - Simply mention the plain filename (e.g., `process_session.py`, `trimmer.py`) instead of the full path.
4. **File Output**:
   - If the commit message needs to be written to a text file (e.g., to pass to `git commit -F`), write it to your brain's scratch directory (`<appDataDir>/brain/<conversation-id>/scratch/`), never directly in the project root.

## Example Format

```commit
feat(ui): implement reusable modal blocker scene and synchronize fade-out

Features:
- Create a reusable 'ModalBlocker.tscn' scene and 'ModalBlocker.gd' script to encapsulate background dimming, click blocking, and fade transitions.
- Disable click blocking instantly ('mouse_filter = MOUSE_FILTER_IGNORE') during the blocker's fade-out so players experience no click delay.

Fixes:
- Fix background interaction by blocking clicks when any popup window is open, ensuring underlying HQ components are non-clickable.
- Fix draw order issue by rearranging 'ChibiSecretary' to draw behind popup panels in 'HuntersHQ.tscn'.

Refactoring:
- Refactor 'WorkerPortrait.gd' and 'HuntersHQ.gd' to instantiate the new blocker scene via UID preloading ('uid://c5blblocker12').
```

## Executing the Commit (If Requested)
When the user explicitly asks to commit:
1. Stage the relevant files.
2. If running via Windows PowerShell, do NOT use `&&` or `||` to chain commands. Use a semicolon `;` as a statement separator instead (e.g., `git add -u; git commit -m "..."`).
3. If using a commit message file, use `git commit -F "<path-to-scratch-file>"`.
