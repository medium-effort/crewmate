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

type UpdateCommandOutput = ({ ok: true } & UpdateResult) | ErrorOutput;

function out(data: UpdateCommandOutput, jsonOnly: boolean = false): void {
  if (!jsonOnly) {
    process.stdout.write(formatOutput(data) + '\n');
  } else {
    process.stdout.write(JSON.stringify(data) + '\n');
  }
}

function formatOutput(data: UpdateCommandOutput): string {
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
  const lines = [
    `Updated crewmate integration for ${successData.harness} (v${successData.version})${successData.dryRun ? ' [DRY RUN]' : ''}`,
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
    .option('-H, --harness <name>', `Target harness (${listAdapterNames().join(', ')})`)
    .option('-d, --dir <path>', 'Target directory (defaults to current directory)')
    .option('--dry-run', 'Display planned updates without writing changes', false)
    .option('--no-backup', 'Do not create backup files before updating modified templates')
    .option('--json', 'Output raw JSON only (no human-readable messages)', false)
    .action(async (opts) => {
      const targetDir = opts.dir ?? process.cwd();

      // Auto-detect installed harness from manifest if not explicitly provided
      let harnessName = opts.harness;
      if (!harnessName) {
        const manifest = readManifest(targetDir);
        if (manifest?.harness) {
          harnessName = manifest.harness;
        } else if (existsSync(join(targetDir, '.agents', 'plugins', 'crewmate'))) {
          harnessName = 'antigravity-ide';
        } else if (existsSync(join(targetDir, '.opencode'))) {
          harnessName = 'opencode';
        } else {
          harnessName = 'opencode';
        }
      }

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

      try {
        const result = await adapter.update(targetDir, {
          dryRun: opts.dryRun,
          backup: opts.backup,
        });

        out(
          {
            ok: true,
            ...result,
          },
          opts.json
        );
      } catch (e) {
        fail((e as Error).message, undefined, opts.json);
      }
    });
}
