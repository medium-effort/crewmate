import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { getAdapter, listAdapterNames } from '../harness/registry.js';
import { readManifest } from '../harness/manifest.js';
import type { UpdateResult } from '../harness/types.js';

interface ErrorOutput {
  ok: false;
  error: string;
  available?: string[];
}

export interface MultiUpdateResult extends UpdateResult {
  harnesses?: string[];
}

export type UpdateCommandOutput = ({ ok: true } & MultiUpdateResult) | ErrorOutput;

function out(data: UpdateCommandOutput, jsonOnly: boolean = false): void {
  if (!jsonOnly) {
    process.stdout.write(formatOutput(data) + '\n');
  } else {
    process.stdout.write(JSON.stringify(data) + '\n');
  }
}

export function formatOutput(data: UpdateCommandOutput): string {
  if (data.ok === false) {
    const lines = [`Error: ${data.error}`];
    if (data.available && Array.isArray(data.available)) {
      lines.push('');
      lines.push(`Available harnesses: ${data.available.join(', ')}`);
    }
    lines.push('');
    lines.push(JSON.stringify(data));
    return lines.join('\n');
  }

  const successData = data as Extract<UpdateCommandOutput, { ok: true }>;
  const targetDesc =
    successData.harnesses && successData.harnesses.length > 1
      ? successData.harnesses.join(', ')
      : successData.harness;

  const lines = [
    `Updated crewmate integration for ${targetDesc} (v${successData.version})${successData.dryRun ? ' [DRY RUN]' : ''}`,
    '',
    'Files:',
  ];

  for (const file of successData.files) {
    let actionLabel = `[${file.action.toUpperCase()}]`;
    if (file.action === 'backed_up_and_updated') {
      actionLabel = '[BACKUP & UPDATE]';
    } else if (file.action === 'backed_up_and_removed') {
      actionLabel = '[BACKUP & REMOVE]';
    }
    lines.push(`  ${actionLabel.padEnd(19)} ${file.path}`);
  }

  if (successData.backedUpFiles && successData.backedUpFiles.length > 0) {
    lines.push('');
    lines.push('Backups created:');
    for (const backup of successData.backedUpFiles) {
      lines.push(`  - ${backup}`);
    }
  }

  lines.push('');
  let summaryText = `Summary: ${successData.summary.updated} updated, ${successData.summary.created} created, ${successData.summary.unchanged} unchanged, ${successData.summary.backedUp} backed up`;
  if (successData.summary.removed && successData.summary.removed > 0) {
    summaryText += `, ${successData.summary.removed} removed`;
  }
  lines.push(summaryText);
  lines.push('');
  lines.push(JSON.stringify(data));

  return lines.join('\n');
}

function fail(
  error: string,
  extra?: Omit<ErrorOutput, 'ok' | 'error'>,
  jsonOnly: boolean = false
): never {
  out({ ok: false, error, ...extra }, jsonOnly);
  process.exit(1);
}

/**
 * Registers the update command with the Commander program
 *
 * @param program The Commander program instance to register commands on
 */
export function registerUpdateCommand(program: Command): void {
  program
    .command('update')
    .description('Update crewmate integration files, prompts, plugins, and dependencies')
    .option(
      '-H, --harness <name>',
      `Target harness (${listAdapterNames().join(', ')}, comma-separated list, or 'all')`
    )
    .option('-d, --dir <path>', 'Target directory (defaults to current directory)')
    .option('--dry-run', 'Display planned updates without writing changes', false)
    .option('--no-backup', 'Do not create backup files before updating modified templates')
    .option('--json', 'Output raw JSON only (no human-readable messages)', false)
    .action(async (opts) => {
      const targetDir = opts.dir ?? process.cwd();

      const opencodeDir = join(targetDir, '.opencode');
      const agentsDir = join(targetDir, '.agents', 'plugins', 'crewmate');
      const crewmateDir = join(targetDir, '.crewmate');
      if (!existsSync(opencodeDir) && !existsSync(agentsDir) && !existsSync(crewmateDir)) {
        fail(
          `Project is not initialized with crewmate. Run 'crewmate init' first.`,
          undefined,
          opts.json
        );
      }

      let targetHarnesses: string[] = [];

      if (opts.harness) {
        const rawHarness = String(opts.harness).trim();
        if (rawHarness.toLowerCase() === 'all') {
          targetHarnesses = ['opencode', 'antigravity-ide'];
        } else {
          targetHarnesses = rawHarness
            .split(',')
            .map((h) => h.trim())
            .filter(Boolean);
        }
      } else {
        // Auto-detect installed harnesses from manifest or filesystem
        const manifest = readManifest(targetDir);
        if (manifest?.harnesses && manifest.harnesses.length > 0) {
          targetHarnesses = [...manifest.harnesses];
        } else if (manifest?.harness) {
          targetHarnesses = [manifest.harness];
        } else {
          const detected: string[] = [];
          if (existsSync(opencodeDir)) {
            detected.push('opencode');
          }
          if (existsSync(agentsDir)) {
            detected.push('antigravity-ide');
          }
          targetHarnesses = detected.length > 0 ? detected : ['opencode'];
        }
      }

      for (const harnessName of targetHarnesses) {
        const adapter = getAdapter(harnessName);
        if (!adapter) {
          fail(
            `Unknown harness "${harnessName}"`,
            {
              available: listAdapterNames(),
            },
            opts.json
          );
        }
      }

      try {
        const allFileStatuses: { path: string; action: any; backupPath?: string }[] = [];
        const seenPaths = new Set<string>();
        const allBackedUpFiles: string[] = [];
        const executedHarnesses: string[] = [];
        let version = '';

        for (const harnessName of targetHarnesses) {
          const adapter = getAdapter(harnessName)!;
          const result = await adapter.update(targetDir, {
            dryRun: opts.dryRun,
            backup: opts.backup,
          });

          executedHarnesses.push(result.harness);
          version = result.version;

          for (const file of result.files) {
            if (!seenPaths.has(file.path)) {
              seenPaths.add(file.path);
              allFileStatuses.push(file);
            }
          }

          for (const backup of result.backedUpFiles) {
            if (!allBackedUpFiles.includes(backup)) {
              allBackedUpFiles.push(backup);
            }
          }
        }

        const summary = {
          total: allFileStatuses.length,
          created: allFileStatuses.filter((f) => f.action === 'created').length,
          updated: allFileStatuses.filter(
            (f) => f.action === 'updated' || f.action === 'backed_up_and_updated'
          ).length,
          unchanged: allFileStatuses.filter((f) => f.action === 'unchanged').length,
          backedUp: allBackedUpFiles.length,
          removed: allFileStatuses.filter(
            (f) => f.action === 'backed_up_and_removed' || f.action === 'removed'
          ).length,
        };

        out(
          {
            ok: true,
            harness: executedHarnesses.join(', '),
            harnesses: executedHarnesses,
            version,
            files: allFileStatuses,
            backedUpFiles: allBackedUpFiles,
            summary,
            ...(opts.dryRun && { dryRun: true }),
          },
          opts.json
        );
      } catch (e) {
        fail((e as Error).message, undefined, opts.json);
      }
    });
}
