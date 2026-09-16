import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  readdirSync,
  rmdirSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  FileUpdateStatus,
  HarnessAdapter,
  InstallResult,
  ManifestFileEntry,
  UpdateOptions,
  UpdateResult,
} from '../../types.js';
import {
  computeHash,
  createBackup,
  CREWMATE_VERSION,
  readManifest,
  writeManifest,
} from '../../manifest.js';
import { PLUGIN_JSON } from './templates/plugin-json.js';
import { MCP_CONFIG_JSON } from './templates/mcp-config-json.js';
import { HOOKS_JSON } from './templates/hooks-json.js';
import { getModularWorkflowFiles } from '../../../graph/modular-templates.js';
import CREWMATE_RULE_MD from './templates/rules/crewmate.md';
import SCOUT_SKILL_MD from './templates/skills/scout.md';
import PLANNER_SKILL_MD from './templates/skills/planner.md';
import EXECUTOR_SKILL_MD from './templates/skills/executor.md';
import WORKFLOW_SKILL_MD from './templates/skills/workflow.md';

/**
 * Adapter for Antigravity AI coding assistant and agent harness.
 *
 * Installs and updates crewmate integration files encapsulated as an Antigravity plugin and workflows,
 * including slash command workflows, plugin manifest, embedded MCP server, lifecycle hooks, rules, and progressive skills.
 */
export class AntigravityAdapter implements HarnessAdapter {
  name = 'antigravity-ide';
  description = 'Antigravity AI coding assistant and agent environment';

  /**
   * Files installed by previous versions of the Antigravity integration that are now deprecated.
   */
  readonly deprecatedFiles: string[] = [
    '.agents/plugins/crewmate/skills/crewmate-brief/SKILL.md',
    '.agents/plugins/crewmate/skills/crewmate-execute/SKILL.md',
    '.agents/workflows/brief.md',
    '.agents/workflows/execute.md',
    '.agents/workflows/workflow.md',
  ];

  /**
   * Cleans up empty parent directories up to (but not including) .agents/
   */
  private cleanEmptyParentDirs(targetDir: string, relFilePath: string): void {
    let currentDir = dirname(join(targetDir, relFilePath));
    const stopDir = join(targetDir, '.agents');

    while (currentDir.startsWith(stopDir) && currentDir !== stopDir) {
      try {
        if (existsSync(currentDir) && readdirSync(currentDir).length === 0) {
          rmdirSync(currentDir);
          currentDir = dirname(currentDir);
        } else {
          break;
        }
      } catch {
        break;
      }
    }
  }

  private generateMcpConfigJson(targetDir: string): string {
    const configPath = join(targetDir, '.agents', 'mcp_config.json');
    let config: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      try {
        const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          config = parsed as Record<string, unknown>;
        }
      } catch {
        config = {};
      }
    }
    const templateParsed = JSON.parse(MCP_CONFIG_JSON);
    const mcpServers = (
      config.mcpServers &&
      typeof config.mcpServers === 'object' &&
      !Array.isArray(config.mcpServers)
        ? config.mcpServers
        : {}
    ) as Record<string, unknown>;

    mcpServers.crewmate = templateParsed.mcpServers.crewmate;
    config.mcpServers = mcpServers;

    return JSON.stringify(config, null, 2) + '\n';
  }

  private getTemplateFiles(): Record<string, string> {
    return {
      '.agents/plugins/crewmate/plugin.json': PLUGIN_JSON,
      '.agents/plugins/crewmate/mcp_config.json': MCP_CONFIG_JSON,
      '.agents/plugins/crewmate/hooks.json': HOOKS_JSON,
      '.agents/plugins/crewmate/rules/crewmate.md': CREWMATE_RULE_MD,
      '.agents/plugins/crewmate/skills/workflow/SKILL.md': WORKFLOW_SKILL_MD,
      '.agents/plugins/crewmate/skills/crewmate-scout/SKILL.md': SCOUT_SKILL_MD,
      '.agents/plugins/crewmate/skills/crewmate-planner/SKILL.md': PLANNER_SKILL_MD,
      '.agents/plugins/crewmate/skills/crewmate-executor/SKILL.md': EXECUTOR_SKILL_MD,
      ...getModularWorkflowFiles(),
    };
  }

  /**
   * Installs crewmate Antigravity plugin files into the target directory.
   *
   * @param targetDir - The target directory to install files into
   * @returns Promise resolving to installation result with harness name and written files
   */
  async install(targetDir: string): Promise<InstallResult> {
    const existingManifest = readManifest(targetDir);
    const manifestEntries: Record<string, ManifestFileEntry> = {
      ...(existingManifest?.files ?? {}),
    };
    const filesWritten: string[] = [];
    const now = new Date().toISOString();

    // Clean up any known deprecated files that exist on disk
    for (const relPath of this.deprecatedFiles) {
      const absPath = join(targetDir, relPath);
      if (existsSync(absPath)) {
        createBackup(targetDir, relPath);
        rmSync(absPath, { force: true });
        this.cleanEmptyParentDirs(targetDir, relPath);
      }
    }

    const templateFiles = this.getTemplateFiles();
    for (const [relPath, content] of Object.entries(templateFiles)) {
      const absPath = join(targetDir, relPath);
      mkdirSync(dirname(absPath), { recursive: true });
      writeFileSync(absPath, content, 'utf-8');
      filesWritten.push(relPath);
      manifestEntries[relPath] = {
        hash: computeHash(content),
        updatedAt: now,
      };
    }

    const mcpConfigContent = this.generateMcpConfigJson(targetDir);
    const mcpConfigRelPath = '.agents/mcp_config.json';
    const mcpConfigAbsPath = join(targetDir, mcpConfigRelPath);
    mkdirSync(dirname(mcpConfigAbsPath), { recursive: true });
    writeFileSync(mcpConfigAbsPath, mcpConfigContent, 'utf-8');
    filesWritten.push(mcpConfigRelPath);
    manifestEntries[mcpConfigRelPath] = {
      hash: computeHash(mcpConfigContent),
      updatedAt: now,
    };

    writeManifest(targetDir, this.name, manifestEntries, existingManifest?.installedAt ?? now);

    return { harness: this.name, filesWritten };
  }

  /**
   * Updates crewmate Antigravity plugin files in the target directory.
   *
   * If existing files were modified by the user, creates backups in .crewmate/backups/
   * and updates them to the latest template versions.
   * Deprecated or obsolete files are backed up to .crewmate/backups/ and removed from .agents/.
   *
   * @param targetDir - The target directory to update
   * @param options - Update options (force, dryRun, backup)
   * @returns Promise resolving to UpdateResult
   */
  async update(targetDir: string, options: UpdateOptions = {}): Promise<UpdateResult> {
    const existingManifest = readManifest(targetDir);
    const manifestEntries: Record<string, ManifestFileEntry> = {
      ...(existingManifest?.files ?? {}),
    };
    const now = new Date().toISOString();

    const templateFiles = this.getTemplateFiles();
    templateFiles['.agents/mcp_config.json'] = this.generateMcpConfigJson(targetDir);
    const fileStatuses: FileUpdateStatus[] = [];
    const backedUpFiles: string[] = [];

    // 1. Process active template files (create, update, or unchanged)
    for (const [relPath, newContent] of Object.entries(templateFiles)) {
      const absPath = join(targetDir, relPath);
      const fileExists = existsSync(absPath);
      const newHash = computeHash(newContent);

      if (!fileExists) {
        if (!options.dryRun) {
          mkdirSync(dirname(absPath), { recursive: true });
          writeFileSync(absPath, newContent, 'utf-8');
          manifestEntries[relPath] = { hash: newHash, updatedAt: now };
        }
        fileStatuses.push({ path: relPath, action: 'created' });
        continue;
      }

      const currentContent = readFileSync(absPath, 'utf-8');
      const currentHash = computeHash(currentContent);

      if (currentHash === newHash) {
        fileStatuses.push({ path: relPath, action: 'unchanged' });
        manifestEntries[relPath] = { hash: newHash, updatedAt: now };
        continue;
      }

      const previousRecordedHash = existingManifest?.files?.[relPath]?.hash;
      const isUserModified = previousRecordedHash && previousRecordedHash !== currentHash;

      let backupPath: string | undefined;
      const shouldBackup = options.backup !== false && (isUserModified || !previousRecordedHash);

      if (shouldBackup) {
        if (!options.dryRun) {
          backupPath = createBackup(targetDir, relPath);
          if (backupPath) {
            backedUpFiles.push(backupPath);
          }
        } else {
          backupPath = `.crewmate/backups/<timestamp>/${relPath}`;
          backedUpFiles.push(backupPath);
        }
      }

      if (!options.dryRun) {
        mkdirSync(dirname(absPath), { recursive: true });
        writeFileSync(absPath, newContent, 'utf-8');
        manifestEntries[relPath] = { hash: newHash, updatedAt: now };
      }

      fileStatuses.push({
        path: relPath,
        action: backupPath ? 'backed_up_and_updated' : 'updated',
        ...(backupPath && { backupPath }),
      });
    }

    // 2. Process deprecated/obsolete files (backup and remove from .agents/)
    const obsoleteFiles = new Set<string>(this.deprecatedFiles);
    if (existingManifest?.files) {
      for (const manifestRelPath of Object.keys(existingManifest.files)) {
        if (
          !templateFiles[manifestRelPath] &&
          manifestRelPath !== '.agents/mcp_config.json' &&
          (manifestRelPath.startsWith('.agents/plugins/crewmate/') ||
            manifestRelPath.startsWith('.agents/workflows/'))
        ) {
          obsoleteFiles.add(manifestRelPath);
        }
      }
    }

    let removedCount = 0;
    for (const relPath of obsoleteFiles) {
      const absPath = join(targetDir, relPath);
      const fileExists = existsSync(absPath);

      if (fileExists) {
        let backupPath: string | undefined;
        if (options.backup !== false) {
          if (!options.dryRun) {
            backupPath = createBackup(targetDir, relPath);
            if (backupPath) {
              backedUpFiles.push(backupPath);
            }
          } else {
            backupPath = `.crewmate/backups/<timestamp>/${relPath}`;
            backedUpFiles.push(backupPath);
          }
        }

        if (!options.dryRun) {
          rmSync(absPath, { force: true });
          this.cleanEmptyParentDirs(targetDir, relPath);
        }

        delete manifestEntries[relPath];
        removedCount++;
        fileStatuses.push({
          path: relPath,
          action: 'backed_up_and_removed',
          ...(backupPath && { backupPath }),
        });
      } else if (manifestEntries[relPath]) {
        delete manifestEntries[relPath];
      }
    }

    if (!options.dryRun) {
      writeManifest(targetDir, this.name, manifestEntries, existingManifest?.installedAt ?? now);
    }

    const summary = {
      total: fileStatuses.length,
      created: fileStatuses.filter((f) => f.action === 'created').length,
      updated: fileStatuses.filter(
        (f) => f.action === 'updated' || f.action === 'backed_up_and_updated'
      ).length,
      unchanged: fileStatuses.filter((f) => f.action === 'unchanged').length,
      backedUp: backedUpFiles.length,
      removed: removedCount,
    };

    return {
      harness: this.name,
      version: CREWMATE_VERSION,
      files: fileStatuses,
      backedUpFiles,
      summary,
      ...(options.dryRun && { dryRun: true }),
    };
  }
}
