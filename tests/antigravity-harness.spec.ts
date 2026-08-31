import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAdapter, listAdapters, listAdapterNames } from '../src/harness/registry.js';
import { AntigravityAdapter } from '../src/harness/adapters/antigravity/adapter.js';
import { PLUGIN_JSON } from '../src/harness/adapters/antigravity/templates/plugin-json.js';
import { MCP_CONFIG_JSON } from '../src/harness/adapters/antigravity/templates/mcp-config-json.js';
import { HOOKS_JSON } from '../src/harness/adapters/antigravity/templates/hooks-json.js';
import CREWMATE_RULE_MD from '../src/harness/adapters/antigravity/templates/rules/crewmate.md';
import BRIEF_SKILL_MD from '../src/harness/adapters/antigravity/templates/skills/brief.md';
import EXECUTE_SKILL_MD from '../src/harness/adapters/antigravity/templates/skills/execute.md';
import SCOUT_SKILL_MD from '../src/harness/adapters/antigravity/templates/skills/scout.md';
import PLANNER_SKILL_MD from '../src/harness/adapters/antigravity/templates/skills/planner.md';
import EXECUTOR_SKILL_MD from '../src/harness/adapters/antigravity/templates/skills/executor.md';
import BRIEF_WORKFLOW_MD from '../src/harness/adapters/antigravity/templates/workflows/brief.md';
import EXECUTE_WORKFLOW_MD from '../src/harness/adapters/antigravity/templates/workflows/execute.md';
import { readManifest } from '../src/harness/manifest.js';

describe('Antigravity Harness Adapter', () => {
  const testDir = join(process.cwd(), '.tmp-test-antigravity');

  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('Registry Integration', () => {
    it("should return Antigravity adapter for 'antigravity'", () => {
      const adapter = getAdapter('antigravity');
      expect(adapter).toBeDefined();
      expect(adapter?.name).toBe('antigravity');
      expect(adapter?.description).toBe('Antigravity AI coding assistant and agent environment');
    });

    it('should include antigravity in listAdapterNames', () => {
      const names = listAdapterNames();
      expect(names).toContain('antigravity');
      expect(names).toContain('opencode');
    });

    it('should list all adapters with valid interface', () => {
      const adapters = listAdapters();
      const antigravity = adapters.find((a) => a.name === 'antigravity');
      expect(antigravity).toBeDefined();
      expect(antigravity?.install).toBeInstanceOf(Function);
      expect(antigravity?.update).toBeInstanceOf(Function);
    });
  });

  describe('Templates & Schema Validity', () => {
    it('should have valid plugin.json JSON schema', () => {
      const parsed = JSON.parse(PLUGIN_JSON);
      expect(parsed.name).toBe('crewmate');
      expect(parsed.description).toBeDefined();
    });

    it('should have valid mcp_config.json JSON schema pointing to crewmate mcp', () => {
      const parsed = JSON.parse(MCP_CONFIG_JSON);
      expect(parsed.mcpServers).toBeDefined();
      expect(parsed.mcpServers.crewmate).toBeDefined();
      expect(parsed.mcpServers.crewmate.command).toBe('crewmate');
      expect(parsed.mcpServers.crewmate.args).toEqual(['mcp']);
    });

    it('should have valid hooks.json JSON schema with event hooks', () => {
      const parsed = JSON.parse(HOOKS_JSON);
      expect(parsed['crewmate-events']).toBeDefined();
      expect(parsed['crewmate-events'].enabled).toBe(true);
      expect(parsed['crewmate-events'].PostToolUse).toBeInstanceOf(Array);
      expect(parsed['crewmate-events'].PostToolUse[0].matcher).toContain('run_command');
    });

    it('should have valid rules and skill markdown templates with YAML frontmatter', () => {
      expect(CREWMATE_RULE_MD).toContain('# Crewmate Orchestration Rules');
      expect(CREWMATE_RULE_MD).toContain('crewmate-scout');
      expect(CREWMATE_RULE_MD).toContain('crewmate-planner');
      expect(CREWMATE_RULE_MD).toContain('crewmate-executor');
      expect(CREWMATE_RULE_MD).toContain('ask_question');

      expect(BRIEF_SKILL_MD).toMatch(/^---\r?\nname: crewmate-brief/);
      expect(EXECUTE_SKILL_MD).toMatch(/^---\r?\nname: crewmate-execute/);
      expect(SCOUT_SKILL_MD).toMatch(/^---\r?\nname: crewmate-scout/);
      expect(PLANNER_SKILL_MD).toMatch(/^---\r?\nname: crewmate-planner/);
      expect(EXECUTOR_SKILL_MD).toMatch(/^---\r?\nname: crewmate-executor/);

      expect(BRIEF_WORKFLOW_MD).toMatch(/^---\r?\ndescription: /);
      expect(BRIEF_WORKFLOW_MD).toContain('# /brief Workflow');
      expect(EXECUTE_WORKFLOW_MD).toMatch(/^---\r?\ndescription: /);
      expect(EXECUTE_WORKFLOW_MD).toContain('# /execute Workflow');
    });
  });

  describe('Installation Flow', () => {
    it('should install all plugin and workflow files and write manifest', async () => {
      const adapter = new AntigravityAdapter();
      const result = await adapter.install(testDir);

      expect(result.harness).toBe('antigravity');
      expect(result.filesWritten.length).toBe(12);

      const expectedFiles = [
        '.agents/mcp_config.json',
        '.agents/workflows/brief.md',
        '.agents/workflows/execute.md',
        '.agents/plugins/crewmate/plugin.json',
        '.agents/plugins/crewmate/mcp_config.json',
        '.agents/plugins/crewmate/hooks.json',
        '.agents/plugins/crewmate/rules/crewmate.md',
        '.agents/plugins/crewmate/skills/crewmate-brief/SKILL.md',
        '.agents/plugins/crewmate/skills/crewmate-execute/SKILL.md',
        '.agents/plugins/crewmate/skills/crewmate-scout/SKILL.md',
        '.agents/plugins/crewmate/skills/crewmate-planner/SKILL.md',
        '.agents/plugins/crewmate/skills/crewmate-executor/SKILL.md',
      ];

      for (const relPath of expectedFiles) {
        expect(result.filesWritten).toContain(relPath);
        expect(existsSync(join(testDir, relPath))).toBe(true);
      }

      const manifest = readManifest(testDir);
      expect(manifest).toBeDefined();
      expect(manifest?.harness).toBe('antigravity');
      expect(Object.keys(manifest?.files ?? {}).length).toBe(12);
    });

    it('should preserve existing custom MCP servers in .agents/mcp_config.json on install', async () => {
      const adapter = new AntigravityAdapter();
      // Pre-create .agents/mcp_config.json with existing servers
      const mcpConfigDir = join(testDir, '.agents');
      mkdirSync(mcpConfigDir, { recursive: true });
      const customConfig = {
        mcpServers: {
          'godot-ai': {
            command: 'node',
            args: ['godot.js'],
          },
          'custom-tool': {
            command: 'custom',
          },
        },
      };
      writeFileSync(
        join(mcpConfigDir, 'mcp_config.json'),
        JSON.stringify(customConfig, null, 2) + '\n',
        'utf-8'
      );

      const result = await adapter.install(testDir);
      expect(result.filesWritten).toContain('.agents/mcp_config.json');

      const mergedConfig = JSON.parse(readFileSync(join(mcpConfigDir, 'mcp_config.json'), 'utf-8'));
      expect(mergedConfig.mcpServers['godot-ai']).toEqual({
        command: 'node',
        args: ['godot.js'],
      });
      expect(mergedConfig.mcpServers['custom-tool']).toEqual({
        command: 'custom',
      });
      expect(mergedConfig.mcpServers.crewmate).toEqual({
        command: 'crewmate',
        args: ['mcp'],
      });
    });
  });

  describe('Update Flow', () => {
    it('should report unchanged files when nothing changed', async () => {
      const adapter = new AntigravityAdapter();
      await adapter.install(testDir);

      const updateResult = await adapter.update(testDir);
      expect(updateResult.summary.total).toBe(12);
      expect(updateResult.summary.unchanged).toBe(12);
      expect(updateResult.summary.updated).toBe(0);
      expect(updateResult.summary.created).toBe(0);
      expect(updateResult.summary.backedUp).toBe(0);
    });

    it('should preserve custom MCP servers in .agents/mcp_config.json on update', async () => {
      const adapter = new AntigravityAdapter();
      await adapter.install(testDir);

      // Add a custom MCP server to .agents/mcp_config.json and set outdated crewmate config
      const configPath = join(testDir, '.agents', 'mcp_config.json');
      const customConfig = {
        mcpServers: {
          crewmate: {
            command: 'crewmate',
            args: ['old-mcp-arg'],
          },
          'my-custom-mcp': {
            command: 'my-mcp',
            args: ['start'],
          },
        },
      };
      writeFileSync(configPath, JSON.stringify(customConfig, null, 2) + '\n', 'utf-8');

      const updateResult = await adapter.update(testDir);
      expect(updateResult.summary.updated).toBe(1);

      const updatedConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(updatedConfig.mcpServers['my-custom-mcp']).toEqual({
        command: 'my-mcp',
        args: ['start'],
      });
      expect(updatedConfig.mcpServers.crewmate).toEqual({
        command: 'crewmate',
        args: ['mcp'],
      });
    });

    it('should backup user-modified files and update them', async () => {
      const adapter = new AntigravityAdapter();
      await adapter.install(testDir);

      // User modifies rule file
      const rulePath = join(testDir, '.agents/plugins/crewmate/rules/crewmate.md');
      writeFileSync(rulePath, '# Modified rule by user', 'utf-8');

      const updateResult = await adapter.update(testDir);
      expect(updateResult.summary.backedUp).toBe(1);
      expect(updateResult.summary.updated).toBe(1);
      expect(updateResult.backedUpFiles.length).toBe(1);

      // Verify rule was updated to latest template
      const updatedRuleContent = readFileSync(rulePath, 'utf-8');
      expect(updatedRuleContent).toBe(CREWMATE_RULE_MD);

      // Verify backup file exists
      const backupPath = join(testDir, updateResult.backedUpFiles[0]);
      expect(existsSync(backupPath)).toBe(true);
      expect(readFileSync(backupPath, 'utf-8')).toBe('# Modified rule by user');
    });

    it('should support dryRun without writing modifications or backups', async () => {
      const adapter = new AntigravityAdapter();
      await adapter.install(testDir);

      const rulePath = join(testDir, '.agents/plugins/crewmate/rules/crewmate.md');
      writeFileSync(rulePath, '# Modified rule', 'utf-8');

      const updateResult = await adapter.update(testDir, { dryRun: true });
      expect(updateResult.dryRun).toBe(true);
      expect(updateResult.summary.backedUp).toBe(1);

      // File should remain as modified by user since dryRun was true
      expect(readFileSync(rulePath, 'utf-8')).toBe('# Modified rule');
    });
  });
});
