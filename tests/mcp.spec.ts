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
    it('should expose all 37 crewmate MCP tools', () => {
      expect(MCP_TOOLS.length).toBe(37);

      const toolNames = MCP_TOOLS.map((t) => t.name);
      expect(toolNames).toContain('crewmate_create_brief');
      expect(toolNames).toContain('crewmate_update_field');
      expect(toolNames).toContain('crewmate_get_field');
      expect(toolNames).toContain('crewmate_show_brief');
      expect(toolNames).toContain('crewmate_check_status');
      expect(toolNames).toContain('crewmate_finish_brief');
      expect(toolNames).toContain('crewmate_reopen_brief');
      expect(toolNames).toContain('crewmate_delete_brief');
      expect(toolNames).toContain('crewmate_unset_field');
      expect(toolNames).toContain('crewmate_add_task');
      expect(toolNames).toContain('crewmate_list_tasks');
      expect(toolNames).toContain('crewmate_update_task');
      expect(toolNames).toContain('crewmate_remove_task');
      expect(toolNames).toContain('crewmate_acquire_lock');
      expect(toolNames).toContain('crewmate_release_lock');
      expect(toolNames).toContain('crewmate_list_locks');
      expect(toolNames).toContain('crewmate_clear_locks');
      expect(toolNames).toContain('crewmate_add_artifact');
      expect(toolNames).toContain('crewmate_list_artifacts');
      expect(toolNames).toContain('crewmate_log_issue');
      expect(toolNames).toContain('crewmate_record_attempt');
      expect(toolNames).toContain('crewmate_record_fix');
      expect(toolNames).toContain('crewmate_search_artifacts');
      expect(toolNames).toContain('crewmate_precheck_file');
      expect(toolNames).toContain('crewmate_get_briefing');
      expect(toolNames).toContain('crewmate_get_context');
      expect(toolNames).toContain('crewmate_supersede_artifact');
      expect(toolNames).toContain('crewmate_workflow_start');
      expect(toolNames).toContain('crewmate_workflow_status');
      expect(toolNames).toContain('crewmate_workflow_advance');
      expect(toolNames).toContain('crewmate_workflow_advance_node');
      expect(toolNames).toContain('crewmate_workflow_skip');
      expect(toolNames).toContain('crewmate_workflow_cancel');
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

    it('should support brief maintenance tools: reopen, unset, and delete', async () => {
      const createRes = await executeTool('crewmate_create_brief', {}, db);
      const briefId = createRes.id as string;

      await executeTool(
        'crewmate_update_field',
        { id: briefId, field: 'goal', value: 'Maintain brief' },
        db
      );
      const unsetRes = await executeTool(
        'crewmate_unset_field',
        { id: briefId, field: 'goal' },
        db
      );
      expect(unsetRes.ok).toBe(true);

      const getRes = await executeTool('crewmate_get_field', { id: briefId, field: 'goal' }, db);
      expect(getRes.value).toBeNull();

      // Complete and reopen
      await executeTool(
        'crewmate_update_field',
        { id: briefId, field: 'workType', value: 'software' },
        db
      );
      await executeTool(
        'crewmate_update_field',
        { id: briefId, field: 'goal', value: 'Complete me' },
        db
      );
      await executeTool(
        'crewmate_update_field',
        { id: briefId, field: 'scope', value: JSON.stringify({ included: ['x'], excluded: [] }) },
        db
      );
      await executeTool(
        'crewmate_update_field',
        { id: briefId, field: 'functionalRequirements', value: JSON.stringify(['r1']) },
        db
      );
      await executeTool(
        'crewmate_update_field',
        { id: briefId, field: 'acceptanceCriteria', value: JSON.stringify(['c1']) },
        db
      );

      await executeTool('crewmate_finish_brief', { id: briefId }, db);
      const reopenRes = await executeTool('crewmate_reopen_brief', { id: briefId }, db);
      expect(reopenRes.ok).toBe(true);
      expect(reopenRes.status).toBe('draft');

      const deleteRes = await executeTool('crewmate_delete_brief', { id: briefId }, db);
      expect(deleteRes.ok).toBe(true);
      expect(deleteRes.deletedId).toBe(briefId);
    });

    it('should support lock clearing via crewmate_clear_locks', async () => {
      const createRes = await executeTool('crewmate_create_brief', {}, db);
      const briefId = createRes.id as string;
      const taskRes = await executeTool(
        'crewmate_add_task',
        { briefId, description: 'Task for locking' },
        db
      );
      const taskId = taskRes.id as string;

      await executeTool(
        'crewmate_acquire_lock',
        { taskId, files: ['src/app.ts', 'src/util.ts'] },
        db
      );
      const clearRes = await executeTool('crewmate_clear_locks', { taskId }, db);
      expect(clearRes.ok).toBe(true);
      expect(clearRes.released).toBe(2);

      const listLocksRes = await executeTool('crewmate_list_locks', { taskId }, db);
      expect((listLocksRes.locks as unknown[]).length).toBe(0);
    });

    it('should support artifact memory tools: log_issue, record_attempt, record_fix, search, precheck, briefing, context, and supersede', async () => {
      const createRes = await executeTool('crewmate_create_brief', {}, db);
      const briefId = createRes.id as string;
      const task1Res = await executeTool(
        'crewmate_add_task',
        { briefId, description: 'Task 1' },
        db
      );
      const task1Id = task1Res.id as string;
      const task2Res = await executeTool(
        'crewmate_add_task',
        { briefId, description: 'Task 2', dependencies: [task1Id] },
        db
      );
      const task2Id = task2Res.id as string;

      // 1. Brief-level and task-level artifacts with DAG filtering
      const addArt1 = await executeTool(
        'crewmate_add_artifact',
        {
          briefId,
          type: 'constraint',
          content: 'No external DBs',
        },
        db
      );
      expect(addArt1.ok).toBe(true);

      const addArt2 = await executeTool(
        'crewmate_add_artifact',
        {
          taskId: task1Id,
          type: 'decision',
          content: 'Use SQLite',
        },
        db
      );
      expect(addArt2.ok).toBe(true);

      const listDag = await executeTool('crewmate_list_artifacts', { forTask: task2Id }, db);
      expect(listDag.ok).toBe(true);
      expect((listDag.artifacts as unknown[]).length).toBeGreaterThanOrEqual(2);

      // 2. Issue logging, attempts, and fixes
      const logIssueRes = await executeTool(
        'crewmate_log_issue',
        {
          briefId,
          taskId: task2Id,
          summary: 'Database connection timeout',
          location: 'src/db.ts',
        },
        db
      );
      expect(logIssueRes.ok).toBe(true);
      const issueArtifact = logIssueRes.artifact as { id: string };

      const attemptRes = await executeTool(
        'crewmate_record_attempt',
        {
          briefId,
          taskId: task2Id,
          issueId: issueArtifact.id,
          summary: 'Increase pool size',
          outcome: 'failed',
        },
        db
      );
      expect(attemptRes.ok).toBe(true);

      const fixRes = await executeTool(
        'crewmate_record_fix',
        {
          briefId,
          taskId: task2Id,
          issueId: issueArtifact.id,
          summary: 'Use persistent connection',
        },
        db
      );
      expect(fixRes.ok).toBe(true);

      // 3. Search artifacts
      const searchRes = await executeTool(
        'crewmate_search_artifacts',
        {
          briefId,
          query: 'connection',
        },
        db
      );
      expect(searchRes.ok).toBe(true);
      expect((searchRes.artifacts as unknown[]).length).toBeGreaterThanOrEqual(1);

      // 4. Precheck file
      const precheckRes = await executeTool(
        'crewmate_precheck_file',
        {
          briefId,
          filePath: 'src/db.ts',
        },
        db
      );
      expect(precheckRes.ok).toBe(true);
      expect(Array.isArray(precheckRes.warnings)).toBe(true);

      // 5. Briefing & Context
      const briefingRes = await executeTool('crewmate_get_briefing', { briefId }, db);
      expect(briefingRes.ok).toBe(true);
      expect(briefingRes.briefing).toBeDefined();

      const contextRes = await executeTool('crewmate_get_context', { briefId, tokens: 1000 }, db);
      expect(contextRes.ok).toBe(true);
      expect(contextRes.context).toBeDefined();

      // 6. Supersede
      const addArt3 = await executeTool(
        'crewmate_add_artifact',
        {
          briefId,
          type: 'decision',
          content: 'Use PostgreSQL instead',
        },
        db
      );
      const supersedeRes = await executeTool(
        'crewmate_supersede_artifact',
        {
          oldId: addArt2.id,
          newId: addArt3.id,
        },
        db
      );
      expect(supersedeRes.ok).toBe(true);
      expect(supersedeRes.supersededId).toBe(addArt2.id);
    });

    it('should support workflow engine tools: start, status, advance_node, advance, skip, and cancel', async () => {
      const createRes = await executeTool('crewmate_create_brief', {}, db);
      const briefId = createRes.id as string;

      // Start workflow
      const startRes = await executeTool('crewmate_workflow_start', { briefId }, db);
      expect(startRes.ok).toBe(true);
      const summary = startRes.data as {
        id: string;
        currentStage: string;
        currentNode?: { id: string };
      };
      expect(summary.id).toBeDefined();
      expect(summary.currentStage).toBe('discussion');
      expect(summary.currentNode?.id).toBe('frontman-interview');

      // Status
      const statusRes = await executeTool('crewmate_workflow_status', { runId: summary.id }, db);
      expect(statusRes.ok).toBe(true);
      expect((statusRes.data as { currentStage: string }).currentStage).toBe('discussion');

      // Advance node
      const advanceNodeRes = await executeTool(
        'crewmate_workflow_advance_node',
        {
          runId: summary.id,
        },
        db
      );
      expect(advanceNodeRes.ok).toBe(true);

      // Skip stage
      const skipRes = await executeTool(
        'crewmate_workflow_skip',
        {
          runId: summary.id,
          stageId: 'research',
        },
        db
      );
      expect(skipRes.ok).toBe(true);

      // Cancel workflow
      const cancelRes = await executeTool(
        'crewmate_workflow_cancel',
        {
          runId: summary.id,
        },
        db
      );
      expect(cancelRes.ok).toBe(true);
      expect((cancelRes.data as { status: string }).status).toBe('cancelled');
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

    it('all 37 tool schemas should accept optional projectPath parameter', () => {
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
