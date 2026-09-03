import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/db/migrations.js';
import { MCP_TOOLS, executeTool, resetMcpRoutingState } from '../src/commands/mcp.js';
import { getDb, closeDb } from '../src/db/connection.js';
import { getBriefById } from '../src/db/brief-repo.js';
import { listTasksByBrief } from '../src/db/task-repo.js';

describe('Crewmate MCP Server', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  describe('Tools Schema Definition', () => {
    it('should expose all 19 crewmate MCP tools', () => {
      expect(MCP_TOOLS.length).toBe(19);

      const toolNames = MCP_TOOLS.map((t) => t.name);
      expect(toolNames).toContain('crewmate_create_brief');
      expect(toolNames).toContain('crewmate_update_field');
      expect(toolNames).toContain('crewmate_get_field');
      expect(toolNames).toContain('crewmate_show_brief');
      expect(toolNames).toContain('crewmate_check_status');
      expect(toolNames).toContain('crewmate_finish_brief');
      expect(toolNames).toContain('crewmate_add_task');
      expect(toolNames).toContain('crewmate_list_tasks');
      expect(toolNames).toContain('crewmate_update_task');
      expect(toolNames).toContain('crewmate_remove_task');
      expect(toolNames).toContain('crewmate_acquire_lock');
      expect(toolNames).toContain('crewmate_release_lock');
      expect(toolNames).toContain('crewmate_list_locks');
      expect(toolNames).toContain('crewmate_add_artifact');
      expect(toolNames).toContain('crewmate_list_artifacts');
      expect(toolNames).toContain('crewmate_add_event');
      expect(toolNames).toContain('crewmate_list_events');
      expect(toolNames).toContain('crewmate_set_activity');
      expect(toolNames).toContain('crewmate_get_activity');
    });

    it('each tool should have valid inputSchema', () => {
      for (const tool of MCP_TOOLS) {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }
    });
  });

  describe('executeTool - Brief Lifecycle', () => {
    it('should create brief, update fields, check status and complete brief', async () => {
      // 1. Create Brief
      const createRes = await executeTool('crewmate_create_brief', {}, db);
      expect(createRes.ok).toBe(true);
      expect(createRes.id).toBeDefined();
      const briefId = createRes.id as string;

      // 2. Update simple field
      const setGoalRes = await executeTool(
        'crewmate_update_field',
        {
          id: briefId,
          field: 'goal',
          value: 'Build test MCP server',
        },
        db
      );
      expect(setGoalRes.ok).toBe(true);
      expect(setGoalRes.value).toBe('Build test MCP server');

      // 3. Update workType
      await executeTool(
        'crewmate_update_field',
        {
          id: briefId,
          field: 'workType',
          value: 'software',
        },
        db
      );

      // 4. Update JSON fields
      await executeTool(
        'crewmate_update_field',
        {
          id: briefId,
          field: 'scope',
          value: JSON.stringify({ included: ['mcp command'], excluded: [] }),
        },
        db
      );
      await executeTool(
        'crewmate_update_field',
        {
          id: briefId,
          field: 'functionalRequirements',
          value: JSON.stringify(['support stdio jsonrpc']),
        },
        db
      );
      await executeTool(
        'crewmate_update_field',
        {
          id: briefId,
          field: 'acceptanceCriteria',
          value: JSON.stringify(['all tests pass']),
        },
        db
      );

      // 5. Get Field
      const getGoalRes = await executeTool(
        'crewmate_get_field',
        {
          id: briefId,
          field: 'goal',
        },
        db
      );
      expect(getGoalRes.ok).toBe(true);
      expect(getGoalRes.value).toBe('Build test MCP server');

      // 6. Show Brief
      const showRes = await executeTool('crewmate_show_brief', { id: briefId }, db);
      expect(showRes.ok).toBe(true);
      expect(showRes.brief).toBeDefined();

      // 7. Check Status
      const statusRes = await executeTool('crewmate_check_status', { id: briefId }, db);
      expect(statusRes.ok).toBe(true);
      expect(statusRes.complete).toBe(true);

      // 8. Finish Brief
      const finishRes = await executeTool('crewmate_finish_brief', { id: briefId }, db);
      expect(finishRes.ok).toBe(true);
      expect(finishRes.status).toBe('complete');
    });

    it('should reject finish_brief when required fields are missing', async () => {
      const createRes = await executeTool('crewmate_create_brief', {}, db);
      const briefId = createRes.id as string;

      await expect(executeTool('crewmate_finish_brief', { id: briefId }, db)).rejects.toThrow(
        /Missing required fields/
      );
    });
  });

  describe('executeTool - Tasks, Locks, Artifacts, Events, Activity', () => {
    it('should perform task management and file locking', async () => {
      const createRes = await executeTool('crewmate_create_brief', {}, db);
      const briefId = createRes.id as string;

      // Add Task
      const addTaskRes = await executeTool(
        'crewmate_add_task',
        {
          briefId,
          title: 'Task 1',
          description: 'Implement feature 1',
        },
        db
      );
      expect(addTaskRes.ok).toBe(true);
      const taskId = addTaskRes.id as string;

      // List Tasks
      const listTasksRes = await executeTool('crewmate_list_tasks', { briefId }, db);
      expect(listTasksRes.ok).toBe(true);
      expect(Array.isArray(listTasksRes.tasks)).toBe(true);

      // Update Task Status
      const updateTaskRes = await executeTool(
        'crewmate_update_task',
        {
          taskId,
          status: 'in_progress',
        },
        db
      );
      expect(updateTaskRes.ok).toBe(true);
      expect(updateTaskRes.status).toBe('in_progress');

      // Acquire Lock
      const lockRes = await executeTool(
        'crewmate_acquire_lock',
        {
          taskId,
          files: ['src/commands/mcp.ts'],
        },
        db
      );
      expect(lockRes.ok).toBe(true);

      // List Locks
      const listLocksRes = await executeTool('crewmate_list_locks', { taskId }, db);
      expect(listLocksRes.ok).toBe(true);
      expect((listLocksRes.locks as unknown[]).length).toBe(1);

      // Release Lock
      const releaseRes = await executeTool('crewmate_release_lock', { taskId }, db);
      expect(releaseRes.ok).toBe(true);
      expect(releaseRes.released).toBe(1);

      // Add Artifact
      const addArtifactRes = await executeTool(
        'crewmate_add_artifact',
        {
          taskId,
          briefId,
          type: 'decision',
          content: 'Use in-process execution for MCP tool calls',
        },
        db
      );
      expect(addArtifactRes.ok).toBe(true);

      // List Artifacts
      const listArtifactsRes = await executeTool(
        'crewmate_list_artifacts',
        { briefId, taskId },
        db
      );
      expect(listArtifactsRes.ok).toBe(true);
      expect((listArtifactsRes.artifacts as unknown[]).length).toBe(1);

      // Add Event
      const addEventRes = await executeTool(
        'crewmate_add_event',
        {
          briefId,
          taskId,
          actor: 'frontman',
          type: 'started',
          message: 'Started task execution',
        },
        db
      );
      expect(addEventRes.ok).toBe(true);

      // List Events
      const listEventsRes = await executeTool('crewmate_list_events', { briefId }, db);
      expect(listEventsRes.ok).toBe(true);
      const events = listEventsRes.events as Array<{ type: string; message: string }>;
      expect(events.length).toBe(4);
      expect(events.some((e) => e.type === 'locked')).toBe(true);
      expect(events.some((e) => e.type === 'artifact')).toBe(true);
      expect(events.some((e) => e.type === 'started')).toBe(true);

      // Set Activity
      const setActivityRes = await executeTool(
        'crewmate_set_activity',
        {
          briefId,
          activityType: 'orchestrating',
          message: 'Running continuous loop',
        },
        db
      );
      expect(setActivityRes.ok).toBe(true);

      // Get Activity
      const getActivityRes = await executeTool('crewmate_get_activity', { briefId }, db);
      expect(getActivityRes.ok).toBe(true);
      expect((getActivityRes.activity as Record<string, unknown>).activityType).toBe(
        'orchestrating'
      );

      // Remove Task
      const removeTaskRes = await executeTool('crewmate_remove_task', { taskId }, db);
      expect(removeTaskRes.ok).toBe(true);
    });

    it('should allow crewmate_add_task and crewmate_list_tasks without briefId', async () => {
      const createRes = await executeTool('crewmate_create_brief', {}, db);
      expect(createRes.id).toBeDefined();

      const addTaskRes = await executeTool(
        'crewmate_add_task',
        {
          title: 'Auto-resolved Task',
          description: 'Task added without explicit briefId',
        },
        db
      );
      expect(addTaskRes.ok).toBe(true);

      const listRes = await executeTool('crewmate_list_tasks', {}, db);
      expect(listRes.ok).toBe(true);
      expect(
        (listRes.tasks as Array<{ title: string }>).some((t) => t.title === 'Auto-resolved Task')
      ).toBe(true);
    });

    it('should throw on unknown tool', async () => {
      await expect(executeTool('crewmate_nonexistent', {}, db)).rejects.toThrow(/Unknown tool/);
    });
  });

  describe('Sticky Project Context & Multi-Project Isolation', () => {
    const tmpProjectA = join(process.cwd(), '.tmp-test-mcp-project-a');
    const tmpProjectB = join(process.cwd(), '.tmp-test-mcp-project-b');

    beforeEach(() => {
      resetMcpRoutingState();
      rmSync(tmpProjectA, { recursive: true, force: true });
      rmSync(tmpProjectB, { recursive: true, force: true });
      mkdirSync(tmpProjectA, { recursive: true });
      mkdirSync(tmpProjectB, { recursive: true });
    });

    afterEach(() => {
      closeDb();
      resetMcpRoutingState();
      rmSync(tmpProjectA, { recursive: true, force: true });
      rmSync(tmpProjectB, { recursive: true, force: true });
    });

    it('should create brief in projectPath and retain sticky context for subsequent calls', async () => {
      // Step 1: Create brief with explicit projectPath
      const createRes = await executeTool('crewmate_create_brief', {
        projectPath: tmpProjectA,
      });
      expect(createRes.ok).toBe(true);
      const briefId = createRes.id as string;

      // Verify the DB file exists in Project A
      const dbAPath = join(tmpProjectA, '.crewmate', 'crewmate.db');
      expect(existsSync(dbAPath)).toBe(true);

      // Step 2: Update field WITHOUT projectPath — should use sticky context
      const updateRes = await executeTool('crewmate_update_field', {
        id: briefId,
        field: 'goal',
        value: 'Project A goal with sticky context',
      });
      expect(updateRes.ok).toBe(true);

      // Step 3: Add task WITHOUT projectPath — should use sticky context / briefId routing
      const taskRes = await executeTool('crewmate_add_task', {
        briefId,
        title: 'Task in Project A',
        description: 'Implement feature for Project A',
      });
      expect(taskRes.ok).toBe(true);
      const taskId = taskRes.id as string;

      // Verify directly against the SQLite database in Project A
      const dbA = getDb(tmpProjectA);
      const briefA = getBriefById(briefId, dbA);
      expect(briefA).toBeDefined();
      expect(briefA?.fields?.goal).toBe('Project A goal with sticky context');

      const tasksA = listTasksByBrief(dbA, briefId);
      expect(tasksA.length).toBe(1);
      expect(tasksA[0].id).toBe(taskId);
      expect(tasksA[0].title).toBe('Task in Project A');
    });

    it('should isolate multiple projects and route tool calls by briefId / taskId', async () => {
      // Create Brief in Project A
      const createARes = await executeTool('crewmate_create_brief', {
        projectPath: tmpProjectA,
      });
      const briefAId = createARes.id as string;

      // Create Brief in Project B
      const createBRes = await executeTool('crewmate_create_brief', {
        projectPath: tmpProjectB,
      });
      const briefBId = createBRes.id as string;

      // Update fields on both briefs
      await executeTool('crewmate_update_field', {
        id: briefAId,
        field: 'goal',
        value: 'Goal for Project A',
      });
      await executeTool('crewmate_update_field', {
        id: briefBId,
        field: 'goal',
        value: 'Goal for Project B',
      });

      // Add tasks to both projects
      const taskARes = await executeTool('crewmate_add_task', {
        briefId: briefAId,
        title: 'Task A',
        description: 'Desc A',
      });
      const taskBRes = await executeTool('crewmate_add_task', {
        briefId: briefBId,
        title: 'Task B',
        description: 'Desc B',
      });

      // Update task in Project A by taskId
      await executeTool('crewmate_update_task', {
        taskId: taskARes.id as string,
        status: 'in_progress',
      });

      // Verify Project A DB
      const dbA = getDb(tmpProjectA);
      const briefA = getBriefById(briefAId, dbA);
      expect(briefA?.fields?.goal).toBe('Goal for Project A');
      const tasksA = listTasksByBrief(dbA, briefAId);
      expect(tasksA.length).toBe(1);
      expect(tasksA[0].status).toBe('in_progress');

      // Verify Project B DB
      const dbB = getDb(tmpProjectB);
      const briefB = getBriefById(briefBId, dbB);
      expect(briefB?.fields?.goal).toBe('Goal for Project B');
      const tasksB = listTasksByBrief(dbB, briefBId);
      expect(tasksB.length).toBe(1);
      expect(tasksB[0].status).toBe('pending');
    });

    it('all 19 tool schemas should accept optional projectPath parameter', () => {
      for (const tool of MCP_TOOLS) {
        expect(
          tool.inputSchema.properties,
          `Tool ${tool.name} should define inputSchema properties`
        ).toBeDefined();
        expect(
          tool.inputSchema.properties.projectPath,
          `Tool ${tool.name} should include projectPath property`
        ).toBeDefined();
      }
    });

    it('should route tools with explicit projectPath to the designated database', async () => {
      // Create brief in Project A
      const createRes = await executeTool('crewmate_create_brief', {
        projectPath: tmpProjectA,
      });
      const briefId = createRes.id as string;

      // Show brief with explicit projectPath
      const showRes = await executeTool('crewmate_show_brief', {
        id: briefId,
        projectPath: tmpProjectA,
      });
      expect(showRes.ok).toBe(true);

      // Check status with explicit projectPath
      const statusRes = await executeTool('crewmate_check_status', {
        id: briefId,
        projectPath: tmpProjectA,
      });
      expect(statusRes.ok).toBe(true);
      expect(statusRes.complete).toBe(false);

      // Set activity with explicit projectPath
      const actRes = await executeTool('crewmate_set_activity', {
        briefId,
        activityType: 'analyzing',
        message: 'Exploring Project A',
        projectPath: tmpProjectA,
      });
      expect(actRes.ok).toBe(true);

      // Get activity with explicit projectPath
      const getActRes = await executeTool('crewmate_get_activity', {
        briefId,
        projectPath: tmpProjectA,
      });
      expect(getActRes.ok).toBe(true);
      expect(getActRes.activity?.message).toBe('Exploring Project A');
    });
  });
});
