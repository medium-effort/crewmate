import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAdapter } from '../src/harness/registry.js';
import { readManifest, writeManifest, CREWMATE_VERSION } from '../src/harness/manifest.js';

const TEST_PREFIX = 'crewmate-multi-harness-';

describe('Multi-Harness Coexistence and Manifest Support', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), TEST_PREFIX));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should support sequential install of opencode then antigravity-ide', async () => {
    const opencodeAdapter = getAdapter('opencode')!;
    const antigravityAdapter = getAdapter('antigravity-ide')!;

    // 1. Install OpenCode
    const opencodeResult = await opencodeAdapter.install(tmpDir);
    expect(opencodeResult.harness).toBe('opencode');
    expect(opencodeResult.filesWritten.length).toBeGreaterThan(0);

    let manifest = readManifest(tmpDir);
    expect(manifest).not.toBeNull();
    expect(manifest?.harnesses).toEqual(['opencode']);
    expect(manifest?.files['.opencode/package.json']).toBeDefined();
    expect(manifest?.files['.crewmate/workflows/default.json']).toBeDefined();

    // 2. Install Antigravity IDE
    const antigravityResult = await antigravityAdapter.install(tmpDir);
    expect(antigravityResult.harness).toBe('antigravity-ide');
    expect(antigravityResult.filesWritten.length).toBeGreaterThan(0);

    // 3. Verify manifest contains both harnesses and both sets of files
    manifest = readManifest(tmpDir);
    expect(manifest).not.toBeNull();
    expect(manifest?.harnesses).toContain('opencode');
    expect(manifest?.harnesses).toContain('antigravity-ide');
    expect(manifest?.version).toBe(CREWMATE_VERSION);

    // OpenCode files preserved
    expect(manifest?.files['.opencode/package.json']).toBeDefined();
    expect(manifest?.files['.opencode/plugins/crewmate.ts']).toBeDefined();
    expect(manifest?.files['.opencode/agents/frontman.md']).toBeDefined();

    // Antigravity files present
    expect(manifest?.files['.agents/mcp_config.json']).toBeDefined();
    expect(manifest?.files['.agents/plugins/crewmate/skills/workflow/SKILL.md']).toBeDefined();
    expect(manifest?.files['.agents/plugins/crewmate/plugin.json']).toBeDefined();

    // Shared workflow files present
    expect(manifest?.files['.crewmate/workflows/default.json']).toBeDefined();
  });

  it('should support sequential update across both installed harnesses without losing entries', async () => {
    const opencodeAdapter = getAdapter('opencode')!;
    const antigravityAdapter = getAdapter('antigravity-ide')!;

    await opencodeAdapter.install(tmpDir);
    await antigravityAdapter.install(tmpDir);

    // Update OpenCode
    const opencodeUpdate = await opencodeAdapter.update(tmpDir);
    expect(opencodeUpdate.harness).toBe('opencode');

    let manifest = readManifest(tmpDir);
    expect(manifest?.harnesses).toContain('opencode');
    expect(manifest?.harnesses).toContain('antigravity-ide');
    expect(manifest?.files['.agents/plugins/crewmate/plugin.json']).toBeDefined();
    expect(manifest?.files['.opencode/package.json']).toBeDefined();

    // Update Antigravity
    const antigravityUpdate = await antigravityAdapter.update(tmpDir);
    expect(antigravityUpdate.harness).toBe('antigravity-ide');

    manifest = readManifest(tmpDir);
    expect(manifest?.harnesses).toContain('opencode');
    expect(manifest?.harnesses).toContain('antigravity-ide');
    expect(manifest?.files['.agents/plugins/crewmate/plugin.json']).toBeDefined();
    expect(manifest?.files['.opencode/package.json']).toBeDefined();
  });

  it('should normalize legacy single-harness manifest on read', () => {
    const manifestDir = join(tmpDir, '.crewmate');
    mkdirSync(manifestDir, { recursive: true });

    // Write legacy manifest format (only "harness": "opencode", no "harnesses")
    const legacyManifest = {
      version: '0.4.5',
      harness: 'opencode',
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      files: {
        '.opencode/package.json': { hash: 'abc', updatedAt: '2026-01-01T00:00:00.000Z' },
      },
    };

    writeFileSync(
      join(manifestDir, 'manifest.json'),
      JSON.stringify(legacyManifest, null, 2),
      'utf-8'
    );

    const loaded = readManifest(tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded?.harness).toBe('opencode');
    expect(loaded?.harnesses).toEqual(['opencode']);
  });

  it('should preserve custom user changes and create backups when updating in multi-harness setup', async () => {
    const opencodeAdapter = getAdapter('opencode')!;
    const antigravityAdapter = getAdapter('antigravity-ide')!;

    await opencodeAdapter.install(tmpDir);
    await antigravityAdapter.install(tmpDir);

    // Modify files from both harnesses
    const opencodeAgent = join(tmpDir, '.opencode', 'agents', 'scout.md');
    const antigravityRule = join(tmpDir, '.agents', 'plugins', 'crewmate', 'rules', 'crewmate.md');

    await writeFile(opencodeAgent, '# Modified Scout\n', 'utf-8');
    await writeFile(antigravityRule, '# Modified Antigravity Rule\n', 'utf-8');

    // Update both
    const opencodeRes = await opencodeAdapter.update(tmpDir);
    const antigravityRes = await antigravityAdapter.update(tmpDir);

    expect(opencodeRes.summary.backedUp).toBe(1);
    expect(antigravityRes.summary.backedUp).toBe(1);

    // Verify backups on disk
    expect(existsSync(join(tmpDir, opencodeRes.backedUpFiles[0]))).toBe(true);
    expect(existsSync(join(tmpDir, antigravityRes.backedUpFiles[0]))).toBe(true);
  });

  it('should format multi-harness init and update outputs correctly', async () => {
    const { formatOutput: formatInitOutput } = await import('../src/commands/init.js');
    const { formatOutput: formatUpdateOutput } = await import('../src/commands/update.js');

    const initOutput = formatInitOutput({
      ok: true,
      harness: 'opencode, antigravity-ide',
      harnesses: ['opencode', 'antigravity-ide'],
      filesWritten: ['.opencode/package.json', '.agents/mcp_config.json'],
    });
    expect(initOutput).toContain('Initialized crewmate integration for opencode, antigravity-ide');
    expect(initOutput).toContain('Developer: Reload Window');

    const updateOutput = formatUpdateOutput({
      ok: true,
      harness: 'opencode, antigravity-ide',
      harnesses: ['opencode', 'antigravity-ide'],
      version: '0.4.6-antigravity',
      files: [
        { path: '.opencode/package.json', action: 'unchanged' },
        { path: '.agents/mcp_config.json', action: 'updated' },
      ],
      backedUpFiles: [],
      summary: {
        total: 2,
        created: 0,
        updated: 1,
        unchanged: 1,
        backedUp: 0,
      },
    });
    expect(updateOutput).toContain('Updated crewmate integration for opencode, antigravity-ide');
    expect(updateOutput).toContain('Summary: 1 updated, 0 created, 1 unchanged, 0 backed up');
  });
});
