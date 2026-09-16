import { Command } from 'commander';
import { getAdapter, listAdapterNames } from '../harness/registry.js';

// Output result types
interface SuccessOutput {
  ok: true;
  harness: string;
  harnesses?: string[];
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
    const targetDesc =
      successData.harnesses && successData.harnesses.length > 1
        ? successData.harnesses.join(', ')
        : successData.harness;

    const lines = [`Initialized crewmate integration for ${targetDesc}`, '', `Created files:`];

    if ('filesWritten' in successData && Array.isArray(successData.filesWritten)) {
      for (const file of successData.filesWritten) {
        lines.push(`  - ${file}`);
      }
    }

    const hasAntigravity =
      (successData.harnesses &&
        successData.harnesses.some((h) => h === 'antigravity-ide' || h === 'antigravity')) ||
      successData.harness === 'antigravity-ide' ||
      successData.harness === 'antigravity';

    if (hasAntigravity) {
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
    .description('Install crewmate integration files for one or more AI harnesses')
    .option(
      '-H, --harness <name>',
      `Target harness (${listAdapterNames().join(', ')}, or comma-separated list, or 'all')`,
      'opencode'
    )
    .option('-d, --dir <path>', 'Target directory (defaults to current directory)')
    .option('--json', 'Output raw JSON only (no human-readable messages)', false)
    .action(async (opts) => {
      const rawHarnessInput = String(opts.harness ?? 'opencode').trim();
      let targetHarnesses: string[];

      if (rawHarnessInput.toLowerCase() === 'all') {
        targetHarnesses = ['opencode', 'antigravity-ide'];
      } else {
        targetHarnesses = rawHarnessInput
          .split(',')
          .map((h) => h.trim())
          .filter(Boolean);
      }

      if (targetHarnesses.length === 0) {
        targetHarnesses = ['opencode'];
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

      const targetDir = opts.dir ?? process.cwd();

      try {
        const allFilesWritten: string[] = [];
        const executedHarnesses: string[] = [];

        for (const harnessName of targetHarnesses) {
          const adapter = getAdapter(harnessName)!;
          const result = await adapter.install(targetDir);
          executedHarnesses.push(result.harness);
          for (const file of result.filesWritten) {
            if (!allFilesWritten.includes(file)) {
              allFilesWritten.push(file);
            }
          }
        }

        out(
          {
            ok: true,
            harness: executedHarnesses.join(', '),
            harnesses: executedHarnesses,
            filesWritten: allFilesWritten,
          },
          opts.json
        );
      } catch (e) {
        fail((e as Error).message, undefined, opts.json);
      }
    });
}
