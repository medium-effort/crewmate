import { Command } from 'commander';
import { getAdapter, listAdapterNames } from '../harness/registry.js';

// Output result types
interface SuccessOutput {
  ok: true;
  harness: string;
  filesWritten: string[];
}

interface ErrorOutput {
  ok: false;
  error: string;
  available?: string[];
}

/**
 * Output format returned by the init command.
 */
export type InitCommandOutput = SuccessOutput | ErrorOutput;
export type { SuccessOutput, ErrorOutput };

function out(data: InitCommandOutput, jsonOnly: boolean = false): void {
  if (!jsonOnly) {
    process.stdout.write(formatOutput(data) + '\n');
  } else {
    process.stdout.write(JSON.stringify(data) + '\n');
  }
}

/**
 * Format the init command output for terminal display.
 *
 * @param data Init command output payload.
 * @returns Human-readable output string.
 */
export function formatOutput(data: InitCommandOutput): string {
  if (data.ok === false && data.error) {
    const lines = [`Error: ${data.error}`];

    if ('available' in data && Array.isArray(data.available)) {
      lines.push('');
      lines.push(`Available harnesses: ${data.available.join(', ')}`);
    }

    lines.push('');
    lines.push(JSON.stringify(data));

    return lines.join('\n');
  }

  // Type guard for SuccessOutput
  if ('harness' in data) {
    const successData = data as Extract<InitCommandOutput, { ok: true }>;
    const lines = [
      `Initialized crewmate integration for ${successData.harness}`,
      '',
      `Created files:`,
    ];

    if ('filesWritten' in successData && Array.isArray(successData.filesWritten)) {
      for (const file of successData.filesWritten) {
        lines.push(`  - ${file}`);
      }
    }

    if (successData.harness === 'antigravity-ide' || successData.harness === 'antigravity') {
      lines.push('');
      lines.push(
        'Note: If this workspace is already open in Antigravity IDE, reload the window to apply changes:'
      );
      lines.push(
        '  Press Ctrl+Shift+P (or Cmd+Shift+P on macOS) -> type "Developer: Reload Window" -> press Enter.'
      );
    }

    lines.push('');
    lines.push(JSON.stringify(data));

    return lines.join('\n');
  }

  return JSON.stringify(data);
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
 * Registers the init command with the Commander program
 *
 * @param program The Commander program instance to register commands on
 */
export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Install crewmate integration files for an AI harness')
    .option('-H, --harness <name>', `Target harness (${listAdapterNames().join(', ')})`, 'opencode')
    .option('-d, --dir <path>', 'Target directory (defaults to current directory)')
    .option('--json', 'Output raw JSON only (no human-readable messages)', false)
    .action(async (opts) => {
      const adapter = getAdapter(opts.harness);
      if (!adapter) {
        fail(
          `Unknown harness "${opts.harness}"`,
          {
            available: listAdapterNames(),
          },
          opts.json
        );
      }

      const targetDir = opts.dir ?? process.cwd();

      try {
        const result = await adapter.install(targetDir);
        out(
          {
            ok: true,
            harness: result.harness,
            filesWritten: result.filesWritten,
          },
          opts.json
        );
      } catch (e) {
        fail((e as Error).message, undefined, opts.json);
      }
    });
}
