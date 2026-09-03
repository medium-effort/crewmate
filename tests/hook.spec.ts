import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/db/migrations.js';
import { createBrief } from '../src/db/brief-repo.js';
import { registerHookCommand, setStdinReaderForTest } from '../src/commands/hook.js';
import { getLatestSession, recordHeartbeat } from '../src/db/session-repo.js';
import { listEvents } from '../src/db/event-repo.js';
import * as connectionModule from '../src/db/connection.js';

describe('Hook CLI Commands', () => {
  let db: Database.Database;
  let briefId: string;
  let stdoutOutput = '';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    const brief = createBrief(db);
    briefId = brief.id;
    vi.spyOn(connectionModule, 'getDb').mockReturnValue(db);

    stdoutOutput = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((str) => {
      stdoutOutput += str;
      return true;
    });
    setStdinReaderForTest(null);
  });

  afterEach(() => {
    setStdinReaderForTest(null);
    vi.restoreAllMocks();
  });

  describe('heartbeat hook (PreInvocation)', () => {
    it('handles heartbeat hook and outputs empty JSON object', async () => {
      const program = new Command();
      registerHookCommand(program);
      await program.parseAsync(['node', 'test', 'hook', 'heartbeat']);

      expect(stdoutOutput).toBe('{}\n');
      const session = getLatestSession(db, briefId);
      expect(session).toBeDefined();
      expect(session?.harness).toBe('antigravity');
      expect(session?.status).toBe('active');
      expect(session?.pid).toBeNull();
    });

    it('preserves existing daemon PID when heartbeat hook runs', async () => {
      // Simulate existing persistent daemon PID (e.g. MCP server)
      recordHeartbeat(db, briefId, 'antigravity', 999999, 'active');

      const program = new Command();
      registerHookCommand(program);
      await program.parseAsync(['node', 'test', 'hook', 'heartbeat']);

      const session = getLatestSession(db, briefId);
      expect(session?.status).toBe('active');
      expect(session?.pid).toBe(999999);
    });

    it('handles heartbeat hook gracefully when no brief exists', async () => {
      const emptyDb = new Database(':memory:');
      runMigrations(emptyDb);
      vi.spyOn(connectionModule, 'getDb').mockReturnValue(emptyDb);

      const program = new Command();
      registerHookCommand(program);
      await program.parseAsync(['node', 'test', 'hook', 'heartbeat']);

      expect(stdoutOutput).toBe('{}\n');
    });
  });

  describe('stop hook (Stop)', () => {
    it('handles stop hook and outputs empty JSON object', async () => {
      recordHeartbeat(db, briefId, 'antigravity', process.pid, 'active');
      const program = new Command();
      registerHookCommand(program);
      await program.parseAsync(['node', 'test', 'hook', 'stop']);

      expect(stdoutOutput).toBe('{}\n');
      const session = getLatestSession(db, briefId);
      expect(session).toBeDefined();
      expect(session?.status).toBe('stopped');
    });

    it('handles stop hook gracefully when no brief exists', async () => {
      const emptyDb = new Database(':memory:');
      runMigrations(emptyDb);
      vi.spyOn(connectionModule, 'getDb').mockReturnValue(emptyDb);

      const program = new Command();
      registerHookCommand(program);
      await program.parseAsync(['node', 'test', 'hook', 'stop']);

      expect(stdoutOutput).toBe('{}\n');
    });
  });

  describe('post-tool hook (PostToolUse)', () => {
    it('records error event when command failed with error from Antigravity', async () => {
      const antigravityPayload = {
        stepIdx: 5,
        error: 'exit status 1',
        toolCall: {
          name: 'run_command',
          args: {
            CommandLine: 'npm test',
          },
        },
        conversationId: 'test-convo-id',
      };
      setStdinReaderForTest(async () => JSON.stringify(antigravityPayload));

      const program = new Command();
      registerHookCommand(program);
      await program.parseAsync(['node', 'test', 'hook', 'post-tool']);

      expect(stdoutOutput).toBe('{}\n');
      const events = listEvents(db, { briefId });
      expect(events.length).toBe(1);
      expect(events[0].actor).toBe('executor');
      expect(events[0].type).toBe('error');
      expect(events[0].message).toContain('Command failed: npm test');
    });

    it('records error event when command has non-zero exitCode', async () => {
      const antigravityPayload = {
        stepIdx: 6,
        exitCode: 1,
        toolCall: {
          name: 'run_command',
          args: {
            CommandLine: 'node broken.js',
          },
        },
      };
      setStdinReaderForTest(async () => JSON.stringify(antigravityPayload));

      const program = new Command();
      registerHookCommand(program);
      await program.parseAsync(['node', 'test', 'hook', 'post-tool']);

      expect(stdoutOutput).toBe('{}\n');
      const events = listEvents(db, { briefId });
      expect(events.length).toBe(1);
      expect(events[0].actor).toBe('executor');
      expect(events[0].type).toBe('error');
      expect(events[0].message).toContain('Command failed: node broken.js');
    });

    it('does not record event when command succeeded with no error', async () => {
      const antigravityPayload = {
        stepIdx: 4,
        toolCall: {
          name: 'run_command',
          args: {
            CommandLine: 'npm test',
          },
        },
      };
      setStdinReaderForTest(async () => JSON.stringify(antigravityPayload));

      const program = new Command();
      registerHookCommand(program);
      await program.parseAsync(['node', 'test', 'hook', 'post-tool']);

      expect(stdoutOutput).toBe('{}\n');
      const events = listEvents(db, { briefId });
      expect(events.length).toBe(0);
    });

    it('handles post-tool hook gracefully on malformed JSON payload', async () => {
      setStdinReaderForTest(async () => 'not-valid-json{{{');

      const program = new Command();
      registerHookCommand(program);
      await program.parseAsync(['node', 'test', 'hook', 'post-tool']);

      expect(stdoutOutput).toBe('{}\n');
    });

    it('handles post-tool hook gracefully when stdin is empty', async () => {
      setStdinReaderForTest(async () => '');

      const program = new Command();
      registerHookCommand(program);
      await program.parseAsync(['node', 'test', 'hook', 'post-tool']);

      expect(stdoutOutput).toBe('{}\n');
    });
  });
});
