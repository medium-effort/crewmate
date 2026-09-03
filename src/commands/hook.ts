import type { Command } from 'commander';
import { getDb } from '../db/connection.js';
import { getLatestBrief } from '../db/brief-repo.js';
import { recordHeartbeat, markSessionStopped } from '../db/session-repo.js';
import { createEvent } from '../db/event-repo.js';

type StdinReader = (timeoutMs?: number) => Promise<string>;

const defaultStdinReader: StdinReader = (timeoutMs = 500): Promise<string> => {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    let data = '';
    const timer = setTimeout(() => {
      cleanup();
      resolve(data);
    }, timeoutMs);

    process.stdin.setEncoding('utf-8');
    const onData = (chunk: string) => {
      data += chunk;
    };
    const onEnd = () => {
      clearTimeout(timer);
      cleanup();
      resolve(data);
    };
    const onError = () => {
      clearTimeout(timer);
      cleanup();
      resolve('');
    };
    const cleanup = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.removeListener('end', onEnd);
      process.stdin.removeListener('error', onError);
    };

    process.stdin.on('data', onData);
    process.stdin.on('end', onEnd);
    process.stdin.on('error', onError);
  });
};

let currentStdinReader: StdinReader = defaultStdinReader;

/**
 * Override standard input reader for testing purposes.
 *
 * @param reader Custom stdin reader or null to reset.
 */
export function setStdinReaderForTest(reader: StdinReader | null): void {
  currentStdinReader = reader ?? defaultStdinReader;
}

/**
 * Register lifecycle hook commands for IDE harnesses.
 *
 * @param program Commander program instance.
 */
export function registerHookCommand(program: Command): void {
  const hookGroup = program
    .command('hook')
    .description('Lifecycle hook handlers for IDE harnesses (e.g. Antigravity)');

  hookGroup
    .command('heartbeat')
    .description('Handle PreInvocation hook: record session heartbeat')
    .action(async () => {
      try {
        const brief = getLatestBrief();
        if (brief) {
          // Pass null for PID so the ephemeral one-shot hook process does not overwrite
          // a long-lived daemon PID (or trigger false dead-process offline states).
          recordHeartbeat(getDb(), brief.id, 'antigravity', null, 'active');
        }
      } catch {
        // Hooks must never crash or throw unhandled exceptions
      }
      process.stdout.write('{}\n');
    });

  hookGroup
    .command('stop')
    .description('Handle Stop hook: mark session stopped')
    .action(async () => {
      try {
        const brief = getLatestBrief();
        if (brief) {
          markSessionStopped(getDb(), brief.id, 'antigravity');
        }
      } catch {
        // Silently ignore
      }
      process.stdout.write('{}\n');
    });

  hookGroup
    .command('post-tool')
    .description('Handle PostToolUse hook: record command errors')
    .action(async () => {
      try {
        const input = await currentStdinReader();
        if (input) {
          const data = JSON.parse(input);
          const hasError =
            Boolean(data?.error) ||
            (typeof data?.exitCode === 'number' && data.exitCode !== 0) ||
            (typeof data?.exit_code === 'number' && data.exit_code !== 0);

          if (data && hasError) {
            const brief = getLatestBrief();
            if (brief) {
              const cmd = data.toolCall?.args?.CommandLine || data.error || 'unknown command';
              const msg = `Command failed: ${cmd}`.slice(0, 100);
              createEvent(getDb(), brief.id, 'executor', 'error', msg);
            }
          }
        }
      } catch {
        // Silently ignore
      }
      process.stdout.write('{}\n');
    });
}
