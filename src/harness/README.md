# Harness

The harness system lets Crewmate integrate with different AI coding assistants. Each assistant (OpenCode today; Cursor, Claude Code, etc. in the future) has its own adapter that knows how to scaffold the right plugin files, slash commands, agent prompts, and dependencies into a target project.

## Architecture

```text
harness/
  types.ts                        Interface definitions (HarnessAdapter, InstallResult, UpdateResult)
  registry.ts                     Adapter lookup and registration
  manifest.ts                     Checksum manifest and backup management
  adapters/
    opencode/                     See adapters/opencode/README.md for details
      adapter.ts                  OpenCode adapter implementation
      templates/                  OpenCode plugin, commands, and agent templates
    antigravity/                  Antigravity plugin harness adapter
      adapter.ts                  Antigravity adapter implementation
      templates/                  Antigravity plugin manifest, MCP server, hooks, rules, skills
```

### `HarnessAdapter` interface

Every adapter implements two properties and one method:

```typescript
interface HarnessAdapter {
  name: string;
  description: string;
  install(targetDir: string): Promise<InstallResult>;
}
```

`install()` receives a target project directory and writes whatever files that AI assistant needs to interact with Crewmate. It returns an `InstallResult`:

```typescript
interface InstallResult {
  harness: string;       // adapter name (e.g. "opencode")
  filesWritten: string[]; // relative paths of every file created
}
```

### Registry

The registry (`registry.ts`) maps adapter names to instances. It exposes four functions:

| Function | Returns | Purpose |
| --- | --- | --- |
| `getAdapter(name)` | `HarnessAdapter \| undefined` | Look up a single adapter |
| `listAdapters()` | `HarnessAdapter[]` | All registered adapter instances |
| `listAdapterNames()` | `string[]` | Just the names (used by `crewmate init` help text) |
| `hasAdapter(name)` | `boolean` | Check whether a name is registered |

### How adapters connect to agents

An adapter's job is purely scaffolding. It writes files into the target project that make the AI assistant aware of Crewmate's tools. The assistant's own extension system then loads those files at runtime.

For OpenCode this means:

1. A **plugin** (`crewmate-plugin.ts`) that wraps every `crewmate` CLI command as an OpenCode tool, so agents can call them without knowing the CLI exists.
2. **Slash commands** (`brief.md`, `execute.md`) that give users `/brief` and `/execute` entry points.
3. **Agent prompts** (`Frontman.md`, `Scout.md`, `Planner.md`, `Executor.md`) that tell each agent its role, constraints, and available tools.

The plugin calls `crewmate <subcommand>` under the hood, parses JSON output, and returns structured results to the agent. Agents never shell out to `crewmate` directly.

## Adding a new adapter

1. Create a directory at `adapters/<name>/`
2. Add `adapter.ts` implementing `HarnessAdapter`
3. Add a `templates/` subdirectory with any files your adapter needs to scaffold
4. Import and register the adapter in `registry.ts`:

```typescript
import { YourAdapter } from './adapters/<name>/adapter.js';

const adapters: Record<string, HarnessAdapter> = {
  opencode: new OpenCodeAdapter(),
  '<name>': new YourAdapter(),
};
```

### What your adapter needs to provide

At minimum, an adapter should scaffold:

| Concern | What to provide | OpenCode example |
| --- | --- | --- |
| Tool bridge | A plugin or extension that wraps `crewmate` CLI calls | `crewmate-plugin.ts` |
| User entry points | Slash commands or UI hooks for `/brief` and `/execute` | `brief.md`, `execute.md` |
| Agent prompts | Role-specific instructions for Frontman, Scout, Planner, Executor | `agents/*.md` |
| Dependencies | Any packages the plugin needs | `package.json` with `@opencode-ai/plugin` |

### Adapter templates

Templates live directly alongside each adapter implementation. The adapter's `install()` method imports or reads these templates and writes them into the target project directory.

For example, the OpenCode adapter writes into `.opencode/`:

- `.opencode/plugins/crewmate.ts` — hooks Crewmate's tools into OpenCode
- `.opencode/commands/brief.md` — the `/brief` command that starts the planning conversation
- `.opencode/commands/execute.md` — the `/execute` command that runs the implementation plan
- `.opencode/agents/frontman.md` — supervisor agent that orchestrates brief creation and task dispatch
- `.opencode/agents/scout.md` — read-only codebase explorer subagent
- `.opencode/agents/planner.md` — task decomposition subagent
- `.opencode/agents/executor.md` — parallel implementation subagent
- `.opencode/package.json` — adds `@opencode-ai/plugin` as a dependency

See [adapters/opencode/README.md](adapters/opencode/README.md) for OpenCode-specific details.

Similarly, the Antigravity adapter encapsulates its integration into `.agents/plugins/crewmate/`:

- `.agents/plugins/crewmate/plugin.json` — Antigravity plugin manifest
- `.agents/plugins/crewmate/mcp_config.json` — auto-launches the Crewmate MCP server via `crewmate mcp`
- `.agents/plugins/crewmate/hooks.json` — lifecycle hooks for event logging and continuous execution
- `.agents/plugins/crewmate/rules/crewmate.md` — Frontman orchestrator guidelines and dashboard tracking
- `.agents/plugins/crewmate/skills/crewmate-brief/SKILL.md` — `/brief` workflow runbook
- `.agents/plugins/crewmate/skills/crewmate-execute/SKILL.md` — `/execute` continuous execution loop
- `.agents/plugins/crewmate/skills/crewmate-scout/SKILL.md` — Scout codebase discovery persona
- `.agents/plugins/crewmate/skills/crewmate-planner/SKILL.md` — Planner task decomposition persona
- `.agents/plugins/crewmate/skills/crewmate-executor/SKILL.md` — Executor task implementation & locking persona

