import readline from 'node:readline';
import type { Command } from 'commander';
import type Database from 'better-sqlite3';
import { CREWMATE_VERSION } from '../harness/manifest.js';
import { getDb, findProjectRoot, getCachedProjectRoots } from '../db/connection.js';
import {
  createBrief,
  resolveBrief,
  setField,
  getField,
  markComplete,
  getLatestBrief,
  getBriefById,
} from '../db/brief-repo.js';
import {
  createTask,
  getTaskById,
  listTasksByBrief,
  updateTaskStatus,
  removeTask,
  validateDependencies,
} from '../db/task-repo.js';
import { acquireLocks, releaseLocks, listLocks, normalizeFilePath } from '../db/lock-repo.js';
import { createArtifact, listArtifacts } from '../db/artifact-repo.js';
import { createEvent, listEvents } from '../db/event-repo.js';
import { setActivity, getCurrentActivity } from '../db/activity-repo.js';
import { recordHeartbeat, markSessionStopped } from '../db/session-repo.js';
import {
  isValidField,
  parseFieldValue,
  getRequiredFieldStatuses,
  getMissingRequiredFields,
  isBriefComplete,
} from '../utils/validation.js';
import { BRIEF_FIELDS, type BriefField } from '../models/brief.js';
import { TASK_STATUSES, type TaskStatus } from '../models/task.js';
import { ARTIFACT_TYPES, type ArtifactType } from '../models/artifact.js';
import { EVENT_ACTORS, EVENT_TYPES, type EventActor, type EventType } from '../models/event.js';
import { FRONTMAN_ACTIVITIES, type FrontmanActivityType } from '../models/activity.js';

export const MCP_TOOLS = [
  {
    name: 'crewmate_create_brief',
    description:
      'Create a new crewmate brief. Call this before updating any fields. Returns the brief ID.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description:
            'Optional path to the project root directory (defaults to active project context)',
        },
      },
    },
  },
  {
    name: 'crewmate_update_field',
    description:
      'Update a field on the current crewmate brief. Simple: workType, goal. Complex (JSON string): scope, technicalStack, constraints, deliverables, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        field: {
          type: 'string',
          enum: [...BRIEF_FIELDS],
          description: 'Field name to update',
        },
        value: {
          type: 'string',
          description: 'Field value (plain string or JSON string)',
        },
        id: {
          type: 'string',
          description: 'Brief ID (defaults to latest)',
        },
        projectPath: {
          type: 'string',
          description:
            'Optional path to the project root directory (defaults to active project context)',
        },
      },
      required: ['field', 'value'],
    },
  },
  {
    name: 'crewmate_get_field',
    description: 'Get a field value from the current crewmate brief.',
    inputSchema: {
      type: 'object',
      properties: {
        field: {
          type: 'string',
          enum: [...BRIEF_FIELDS],
          description: 'Field name to retrieve',
        },
        id: {
          type: 'string',
          description: 'Brief ID (defaults to latest)',
        },
        projectPath: {
          type: 'string',
          description:
            'Optional path to the project root directory (defaults to active project context)',
        },
      },
      required: ['field'],
    },
  },
  {
    name: 'crewmate_show_brief',
    description:
      'Show the full crewmate brief as JSON, including all fields and their current values.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Brief ID (defaults to latest)',
        },
        projectPath: {
          type: 'string',
          description:
            'Optional path to the project root directory (defaults to active project context)',
        },
      },
    },
  },
  {
    name: 'crewmate_check_status',
    description:
      'Check the completeness status of the current crewmate brief. Shows which required fields are set vs missing.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Brief ID (defaults to latest)',
        },
        projectPath: {
          type: 'string',
          description:
            'Optional path to the project root directory (defaults to active project context)',
        },
      },
    },
  },
  {
    name: 'crewmate_finish_brief',
    description: 'Mark the crewmate brief as complete. Fails if required fields are missing.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Brief ID (defaults to latest)',
        },
        projectPath: {
          type: 'string',
          description:
            'Optional path to the project root directory (defaults to active project context)',
        },
      },
    },
  },
  {
    name: 'crewmate_add_task',
    description:
      'Add a new task to a brief. REQUIRED: description. Optional: briefId (defaults to active brief), title, dependencies, field.',
    inputSchema: {
      type: 'object',
      properties: {
        briefId: {
          type: 'string',
          description: 'The brief ID to link this task to (defaults to active brief)',
        },
        description: { type: 'string', description: 'Task description' },
        title: {
          type: 'string',
          description: 'Task title (derived from description if omitted)',
        },
        dependencies: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of task IDs this task depends on',
        },
        field: { type: 'string', description: 'Brief field this task addresses' },
        projectPath: {
          type: 'string',
          description:
            'Optional path to the project root directory (defaults to active project context)',
        },
      },
      required: ['description'],
    },
  },
  {
    name: 'crewmate_list_tasks',
    description: 'List all tasks for a brief. Optional: briefId (defaults to active brief).',
    inputSchema: {
      type: 'object',
      properties: {
        briefId: {
          type: 'string',
          description: 'The brief ID to list tasks for (defaults to active brief)',
        },
        projectPath: {
          type: 'string',
          description:
            'Optional path to the project root directory (defaults to active project context)',
        },
      },
      required: ['briefId'],
    },
  },
  {
    name: 'crewmate_update_task',
    description:
      'Update a task status. REQUIRED: taskId, status (pending | in_progress | completed).',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task ID to update' },
        status: {
          type: 'string',
          enum: ['pending', 'in_progress', 'completed'],
          description: 'New status',
        },
        projectPath: {
          type: 'string',
          description:
            'Optional path to the project root directory (defaults to active project context)',
        },
      },
      required: ['taskId', 'status'],
    },
  },
  {
    name: 'crewmate_remove_task',
    description: 'Remove a task from a brief. REQUIRED: taskId.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task ID to remove' },
        projectPath: {
          type: 'string',
          description:
            'Optional path to the project root directory (defaults to active project context)',
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'crewmate_acquire_lock',
    description:
      'Acquire write locks on files for a task to prevent collisions. REQUIRED: taskId, files.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task ID acquiring locks' },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of relative file paths to lock',
        },
        projectPath: {
          type: 'string',
          description:
            'Optional path to the project root directory (defaults to active project context)',
        },
      },
      required: ['taskId', 'files'],
    },
  },
  {
    name: 'crewmate_release_lock',
    description:
      'Release file locks held by a task after execution. REQUIRED: taskId. Optional: files.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task ID releasing locks' },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific file paths to release',
        },
        projectPath: {
          type: 'string',
          description:
            'Optional path to the project root directory (defaults to active project context)',
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'crewmate_list_locks',
    description: 'List currently held file locks. Optional: taskId.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Filter locks by task ID' },
        projectPath: {
          type: 'string',
          description:
            'Optional path to the project root directory (defaults to active project context)',
        },
      },
    },
  },
  {
    name: 'crewmate_add_artifact',
    description:
      'Add an execution artifact / incremental knowledge fact for a task. REQUIRED: taskId, type, content.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task ID creating this artifact' },
        type: {
          type: 'string',
          enum: [...ARTIFACT_TYPES],
          description: 'Artifact category',
        },
        content: {
          type: 'string',
          description: 'Artifact text, contract, decision, or note',
        },
        briefId: { type: 'string', description: 'Brief ID' },
        projectPath: {
          type: 'string',
          description:
            'Optional path to the project root directory (defaults to active project context)',
        },
      },
      required: ['taskId', 'type', 'content'],
    },
  },
  {
    name: 'crewmate_list_artifacts',
    description: 'List incremental knowledge artifacts. Optional: briefId, taskId, type.',
    inputSchema: {
      type: 'object',
      properties: {
        briefId: { type: 'string', description: 'Brief ID filter' },
        taskId: { type: 'string', description: 'Task ID filter' },
        type: {
          type: 'string',
          enum: [...ARTIFACT_TYPES],
          description: 'Artifact category filter',
        },
        projectPath: {
          type: 'string',
          description:
            'Optional path to the project root directory (defaults to active project context)',
        },
      },
    },
  },
  {
    name: 'crewmate_add_event',
    description:
      'Record a workflow lifecycle event for the live watch dashboard. REQUIRED: actor, type, message.',
    inputSchema: {
      type: 'object',
      properties: {
        actor: {
          type: 'string',
          enum: [...EVENT_ACTORS],
          description: 'Agent that emitted the event',
        },
        type: {
          type: 'string',
          enum: [...EVENT_TYPES],
          description: 'Event type',
        },
        message: { type: 'string', description: 'Human-readable event description' },
        taskId: { type: 'string', description: 'Task this event relates to' },
        briefId: { type: 'string', description: 'Brief ID' },
        projectPath: {
          type: 'string',
          description:
            'Optional path to the project root directory (defaults to active project context)',
        },
      },
      required: ['actor', 'type', 'message'],
    },
  },
  {
    name: 'crewmate_list_events',
    description: 'List workflow lifecycle events. Optional: briefId, taskId, actor, type, limit.',
    inputSchema: {
      type: 'object',
      properties: {
        briefId: { type: 'string', description: 'Brief ID filter' },
        taskId: { type: 'string', description: 'Task ID filter' },
        actor: {
          type: 'string',
          enum: [...EVENT_ACTORS],
          description: 'Actor filter',
        },
        type: {
          type: 'string',
          enum: [...EVENT_TYPES],
          description: 'Event type filter',
        },
        limit: { type: 'string', description: 'Max number of events to return' },
        projectPath: {
          type: 'string',
          description:
            'Optional path to the project root directory (defaults to active project context)',
        },
      },
    },
  },
  {
    name: 'crewmate_set_activity',
    description:
      "Set Frontman's active state for the live watch dashboard. REQUIRED: activityType.",
    inputSchema: {
      type: 'object',
      properties: {
        activityType: {
          type: 'string',
          enum: [...FRONTMAN_ACTIVITIES],
          description: 'Frontman activity type',
        },
        message: { type: 'string', description: 'Context or description of activity' },
        briefId: { type: 'string', description: 'Brief ID' },
        projectPath: {
          type: 'string',
          description:
            'Optional path to the project root directory (defaults to active project context)',
        },
      },
      required: ['activityType'],
    },
  },
  {
    name: 'crewmate_get_activity',
    description: "Get Frontman's current active state. Optional: briefId.",
    inputSchema: {
      type: 'object',
      properties: {
        briefId: { type: 'string', description: 'Brief ID filter' },
        projectPath: {
          type: 'string',
          description:
            'Optional path to the project root directory (defaults to active project context)',
        },
      },
    },
  },
];

let activeProjectRoot: string | null = null;
const briefProjectMap = new Map<string, string>();
const taskProjectMap = new Map<string, string>();

/**
 * Resets the in-memory MCP project routing state (useful for test isolation)
 */
export function resetMcpRoutingState(): void {
  activeProjectRoot = null;
  briefProjectMap.clear();
  taskProjectMap.clear();
}

/**
 * Resolves the appropriate SQLite database connection for an MCP tool call based on
 * explicit projectPath, briefId/id mapping, taskId mapping, or cached active project root.
 */
export function resolveDbForTool(
  args: Record<string, unknown> = {},
  fallbackDb?: Database.Database
): { db: Database.Database; projectRoot: string } {
  if (fallbackDb) {
    const root = findProjectRoot(process.cwd());
    return { db: fallbackDb, projectRoot: root };
  }

  const explicitPath = args.projectPath ? String(args.projectPath) : undefined;
  if (explicitPath) {
    const root = findProjectRoot(explicitPath, false);
    activeProjectRoot = root;
    return { db: getDb(root), projectRoot: root };
  }

  const briefId = args.briefId ? String(args.briefId) : args.id ? String(args.id) : undefined;
  if (briefId && briefProjectMap.has(briefId)) {
    const root = briefProjectMap.get(briefId)!;
    return { db: getDb(root), projectRoot: root };
  }

  const taskId = args.taskId ? String(args.taskId) : undefined;
  if (taskId && taskProjectMap.has(taskId)) {
    const root = taskProjectMap.get(taskId)!;
    return { db: getDb(root), projectRoot: root };
  }

  const root = activeProjectRoot ?? findProjectRoot(process.cwd());
  return { db: getDb(root), projectRoot: root };
}

/**
 * Executes a tool call directly in-process against the Crewmate database
 *
 * @param name The tool name
 * @param args Tool arguments
 * @param dbInstance Optional explicit database instance (e.g. in unit tests)
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown> = {},
  dbInstance?: Database.Database
): Promise<{ ok: boolean; [key: string]: unknown }> {
  const { db, projectRoot } = resolveDbForTool(args, dbInstance);

  switch (name) {
    case 'crewmate_create_brief': {
      const b = createBrief(db);
      briefProjectMap.set(b.id, projectRoot);
      return { ok: true, id: b.id };
    }

    case 'crewmate_update_field': {
      const field = String(args.field || '');
      const value = String(args.value || '');
      const id = args.id ? String(args.id) : undefined;

      if (!isValidField(field)) {
        throw new Error(`Unknown field "${field}"`);
      }
      const b = resolveBrief(id, db);
      if (!b) {
        throw new Error(id ? `Brief not found: ${id}` : 'No brief found');
      }
      if (b.status === 'complete') {
        throw new Error(
          'Cannot modify a completed brief. Create a new brief or revert status first.'
        );
      }

      const parsed = parseFieldValue(field as BriefField, value);
      setField(b.id, field as BriefField, parsed, db);
      briefProjectMap.set(b.id, projectRoot);
      return { ok: true, field, value: parsed };
    }

    case 'crewmate_get_field': {
      const field = String(args.field || '');
      const id = args.id ? String(args.id) : undefined;

      if (!isValidField(field)) {
        throw new Error(`Unknown field "${field}"`);
      }
      const b = resolveBrief(id, db);
      if (!b) {
        throw new Error(id ? `Brief not found: ${id}` : 'No brief found');
      }
      const value = getField(b.id, field as BriefField, db);
      return { ok: true, field, value: value ?? null };
    }

    case 'crewmate_show_brief': {
      const id = args.id ? String(args.id) : undefined;
      const b = resolveBrief(id, db);
      if (!b) {
        throw new Error(id ? `Brief not found: ${id}` : 'No brief found');
      }
      briefProjectMap.set(b.id, projectRoot);
      return { ok: true, brief: b };
    }

    case 'crewmate_check_status': {
      const id = args.id ? String(args.id) : undefined;
      const b = resolveBrief(id, db);
      if (!b) {
        throw new Error(id ? `Brief not found: ${id}` : 'No brief found');
      }
      const required = getRequiredFieldStatuses(b);
      const complete = isBriefComplete(b);
      return { ok: true, status: b.status, required, complete };
    }

    case 'crewmate_finish_brief': {
      const id = args.id ? String(args.id) : undefined;
      const b = resolveBrief(id, db);
      if (!b) {
        throw new Error(id ? `Brief not found: ${id}` : 'No brief found');
      }
      const missing = getMissingRequiredFields(b);
      if (missing.length > 0) {
        throw new Error(`Missing required fields: ${missing.join(', ')}`);
      }
      markComplete(b.id, db);
      return { ok: true, id: b.id, status: 'complete' };
    }

    case 'crewmate_add_task': {
      const id = args.briefId ? String(args.briefId) : undefined;
      const description = String(args.description || '');
      const title = args.title ? String(args.title).trim() : '';
      const dependencies = Array.isArray(args.dependencies) ? (args.dependencies as string[]) : [];
      const field = args.field ? String(args.field) : null;

      if (!description.trim()) {
        throw new Error('description is required');
      }
      const brief = resolveBrief(id, db);
      if (!brief) {
        throw new Error(id ? `Brief not found: ${id}` : 'No brief found');
      }
      const briefId = brief.id;

      if (dependencies.length > 0) {
        const depCheck = validateDependencies(db, briefId, dependencies);
        if (!depCheck.valid) {
          throw new Error(depCheck.error || 'Invalid dependencies');
        }
      }

      if (field && !isValidField(field)) {
        throw new Error(`Invalid field "${field}". Must be one of: ${BRIEF_FIELDS.join(', ')}`);
      }

      const taskTitle = title || description.trim().split(/\r?\n/)[0].slice(0, 80);
      const task = createTask(db, briefId, taskTitle, description.trim(), {
        dependencies,
        field,
      });
      taskProjectMap.set(task.id, projectRoot);
      briefProjectMap.set(briefId, projectRoot);

      return { ok: true, id: task.id, title: task.title };
    }

    case 'crewmate_list_tasks': {
      const id = args.briefId ? String(args.briefId) : undefined;
      const brief = resolveBrief(id, db);
      if (!brief) {
        throw new Error(id ? `Brief not found: ${id}` : 'No brief found');
      }
      const briefId = brief.id;
      const tasks = listTasksByBrief(db, briefId);
      return {
        ok: true,
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          dependencies: t.dependencies,
          status: t.status,
          field: t.field,
        })),
      };
    }

    case 'crewmate_update_task': {
      const taskId = String(args.taskId || '');
      const status = String(args.status || '') as TaskStatus;

      if (!TASK_STATUSES.includes(status)) {
        throw new Error(`Invalid status: ${status}. Must be one of: ${TASK_STATUSES.join(', ')}`);
      }
      const task = getTaskById(db, taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const VALID_TRANSITIONS: Record<string, string[]> = {
        pending: ['in_progress'],
        in_progress: ['completed', 'pending'],
        completed: [],
      };
      const allowed = VALID_TRANSITIONS[task.status] ?? [];
      if (status !== task.status && !allowed.includes(status)) {
        throw new Error(
          `Invalid status transition: ${task.status} -> ${status}. Allowed: ${allowed.join(', ') || 'none'}`
        );
      }

      updateTaskStatus(db, taskId, status);
      if (status === 'in_progress') {
        createEvent(db, task.briefId, 'executor', 'started', `Started task: ${task.title}`, {
          taskId: task.id,
        });
      } else if (status === 'completed') {
        createEvent(db, task.briefId, 'executor', 'completed', `Completed task: ${task.title}`, {
          taskId: task.id,
        });
      }
      return { ok: true, id: task.id, status, title: task.title };
    }

    case 'crewmate_remove_task': {
      const taskId = String(args.taskId || '');
      const task = getTaskById(db, taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }
      removeTask(db, taskId);
      return { ok: true, id: task.id };
    }

    case 'crewmate_acquire_lock': {
      const taskId = String(args.taskId || '');
      const task = getTaskById(db, taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }
      const files = Array.isArray(args.files)
        ? (args.files as string[]).map(normalizeFilePath).filter(Boolean)
        : [];
      if (files.length === 0) {
        throw new Error('files is required and must contain at least one file path');
      }

      const result = acquireLocks(db, taskId, files);
      if (!result.ok) {
        throw new Error(`File already locked by task ${result.lockedBy}: ${result.conflict}`);
      }
      createEvent(
        db,
        task.briefId,
        'executor',
        'locked',
        `Locked ${result.locked.length} file(s) for task: ${task.title}`,
        { taskId: task.id }
      );
      return { ok: true, taskId, files: result.locked };
    }

    case 'crewmate_release_lock': {
      const taskId = String(args.taskId || '');
      const task = getTaskById(db, taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }
      const files =
        Array.isArray(args.files) && args.files.length > 0 ? (args.files as string[]) : undefined;
      const result = releaseLocks(db, taskId, files);
      return { ok: true, taskId, released: result.released };
    }

    case 'crewmate_list_locks': {
      const taskId = args.taskId ? String(args.taskId) : undefined;
      const locks = listLocks(db, taskId);
      return {
        ok: true,
        locks: locks.map((l) => ({
          id: l.id,
          taskId: l.taskId,
          filePath: l.filePath,
          createdAt: l.createdAt,
        })),
      };
    }

    case 'crewmate_add_artifact': {
      const taskId = String(args.taskId || '');
      const type = String(args.type || '') as ArtifactType;
      const content = String(args.content || '').trim();
      const explicitBriefId = args.briefId ? String(args.briefId) : undefined;

      if (!ARTIFACT_TYPES.includes(type)) {
        throw new Error(
          `Invalid artifact type: ${type}. Must be one of: ${ARTIFACT_TYPES.join(', ')}`
        );
      }
      if (!content) {
        throw new Error('content is required');
      }
      const task = getTaskById(db, taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const briefId = explicitBriefId || task.briefId;
      if (explicitBriefId && explicitBriefId !== task.briefId) {
        throw new Error(`Task ${taskId} belongs to brief ${task.briefId}, not ${explicitBriefId}`);
      }
      const brief = getBriefById(briefId, db);
      if (!brief) {
        throw new Error(`Brief not found: ${briefId}`);
      }

      const artifact = createArtifact(db, taskId, briefId, type, content);
      createEvent(
        db,
        briefId,
        'executor',
        'artifact',
        `Added ${type} artifact for task: ${task.title}`,
        { taskId: task.id }
      );
      return {
        ok: true,
        id: artifact.id,
        taskId: artifact.taskId,
        briefId: artifact.briefId,
        type: artifact.type,
        content: artifact.content,
      };
    }

    case 'crewmate_list_artifacts': {
      const explicitBriefId = args.briefId ? String(args.briefId) : undefined;
      const taskId = args.taskId ? String(args.taskId) : undefined;
      const type = args.type ? (String(args.type) as ArtifactType) : undefined;

      let targetBriefId = explicitBriefId;
      if (!targetBriefId && !taskId) {
        const latest = getLatestBrief(db);
        if (latest) {
          targetBriefId = latest.id;
        }
      }

      if (type && !ARTIFACT_TYPES.includes(type)) {
        throw new Error(
          `Invalid artifact type: ${type}. Must be one of: ${ARTIFACT_TYPES.join(', ')}`
        );
      }

      const artifacts = listArtifacts(db, {
        briefId: targetBriefId,
        taskId,
        type,
      });

      return {
        ok: true,
        artifacts: artifacts.map((a) => ({
          id: a.id,
          taskId: a.taskId,
          briefId: a.briefId,
          type: a.type,
          content: a.content,
          createdAt: a.createdAt,
        })),
      };
    }

    case 'crewmate_add_event': {
      const actor = String(args.actor || '') as EventActor;
      const type = String(args.type || '') as EventType;
      const message = String(args.message || '').trim();
      const taskId = args.taskId ? String(args.taskId) : undefined;
      const explicitBriefId = args.briefId ? String(args.briefId) : undefined;

      if (!EVENT_ACTORS.includes(actor)) {
        throw new Error(`Invalid actor: ${actor}. Must be one of: ${EVENT_ACTORS.join(', ')}`);
      }
      if (!EVENT_TYPES.includes(type)) {
        throw new Error(`Invalid event type: ${type}. Must be one of: ${EVENT_TYPES.join(', ')}`);
      }
      if (!message) {
        throw new Error('message is required');
      }

      let targetBriefId = explicitBriefId;
      if (!targetBriefId && taskId) {
        const task = getTaskById(db, taskId);
        if (task) {
          targetBriefId = task.briefId;
        }
      }
      if (!targetBriefId) {
        const latest = getLatestBrief(db);
        if (latest) {
          targetBriefId = latest.id;
        }
      }
      if (!targetBriefId) {
        throw new Error('No brief found');
      }

      const recentEvents = listEvents(db, {
        briefId: targetBriefId,
        taskId,
        actor,
        type,
        limit: 3,
      });

      const now = Date.now();
      const duplicate = recentEvents.find((e) => {
        const createdAtUtc = e.createdAt.endsWith('Z') ? e.createdAt : e.createdAt + 'Z';
        const age = now - new Date(createdAtUtc).getTime();
        return age <= 4000 && e.message === message;
      });

      if (duplicate) {
        return {
          ok: true,
          id: duplicate.id,
          briefId: duplicate.briefId,
          taskId: duplicate.taskId,
          actor: duplicate.actor,
          type: duplicate.type,
          message: duplicate.message,
          createdAt: duplicate.createdAt,
        };
      }

      const event = createEvent(db, targetBriefId, actor, type, message, {
        taskId: taskId ?? null,
      });

      return {
        ok: true,
        id: event.id,
        briefId: event.briefId,
        taskId: event.taskId,
        actor: event.actor,
        type: event.type,
        message: event.message,
        createdAt: event.createdAt,
      };
    }

    case 'crewmate_list_events': {
      const explicitBriefId = args.briefId ? String(args.briefId) : undefined;
      const taskId = args.taskId ? String(args.taskId) : undefined;
      const actor = args.actor ? (String(args.actor) as EventActor) : undefined;
      const type = args.type ? (String(args.type) as EventType) : undefined;
      const limit = args.limit ? parseInt(String(args.limit), 10) : undefined;

      let targetBriefId = explicitBriefId;
      if (!targetBriefId && !taskId) {
        const latest = getLatestBrief(db);
        if (latest) {
          targetBriefId = latest.id;
        }
      }

      if (actor && !EVENT_ACTORS.includes(actor)) {
        throw new Error(`Invalid actor: ${actor}. Must be one of: ${EVENT_ACTORS.join(', ')}`);
      }
      if (type && !EVENT_TYPES.includes(type)) {
        throw new Error(`Invalid event type: ${type}. Must be one of: ${EVENT_TYPES.join(', ')}`);
      }

      const events = listEvents(db, {
        briefId: targetBriefId,
        taskId,
        actor,
        type,
        limit,
      });

      return {
        ok: true,
        events: events.map((e) => ({
          id: e.id,
          briefId: e.briefId,
          taskId: e.taskId,
          actor: e.actor,
          type: e.type,
          message: e.message,
          createdAt: e.createdAt,
        })),
      };
    }

    case 'crewmate_set_activity': {
      const activityType = String(args.activityType || '') as FrontmanActivityType;
      const message = args.message ? String(args.message).trim() : null;
      const explicitBriefId = args.briefId ? String(args.briefId) : undefined;

      if (!FRONTMAN_ACTIVITIES.includes(activityType)) {
        throw new Error(
          `Invalid activity type: ${activityType}. Must be one of: ${FRONTMAN_ACTIVITIES.join(', ')}`
        );
      }

      let targetBriefId = explicitBriefId;
      if (!targetBriefId) {
        const latest = getLatestBrief(db);
        if (latest) {
          targetBriefId = latest.id;
        }
      }
      if (!targetBriefId) {
        throw new Error('No brief found');
      }

      const activity = setActivity(db, targetBriefId, activityType, {
        message,
        metadata: (args.metadata as Record<string, unknown>) ?? null,
      });

      if (['analyzing', 'planning', 'orchestrating'].includes(activityType)) {
        const actor = activityType === 'orchestrating' ? 'executor' : 'frontman';
        const msg = message || `Activity changed to ${activityType}`;
        createEvent(db, targetBriefId, actor, 'started', msg);
      }

      return { ok: true, activity };
    }

    case 'crewmate_get_activity': {
      const explicitBriefId = args.briefId ? String(args.briefId) : undefined;
      let targetBriefId = explicitBriefId;
      if (!targetBriefId) {
        const latest = getLatestBrief(db);
        if (latest) {
          targetBriefId = latest.id;
        }
      }

      if (!targetBriefId) {
        return { ok: true, activity: null };
      }

      const activity = getCurrentActivity(db, targetBriefId);
      return { ok: true, activity };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Starts the stdio JSON-RPC 2.0 MCP server
 */
export function startMcpServer(options: { projectDir?: string } = {}): void {
  if (options.projectDir) {
    activeProjectRoot = findProjectRoot(options.projectDir, false);
  }

  const pid = process.pid;

  const getActiveRoots = (): Set<string> => {
    const roots = new Set<string>();
    if (activeProjectRoot) {
      roots.add(activeProjectRoot);
    }
    for (const root of briefProjectMap.values()) {
      roots.add(root);
    }
    for (const root of getCachedProjectRoots()) {
      roots.add(root);
    }
    if (roots.size === 0) {
      roots.add(findProjectRoot(process.cwd()));
    }
    return roots;
  };

  const sendHeartbeat = () => {
    try {
      for (const root of getActiveRoots()) {
        const db = getDb(root);
        const latest = getLatestBrief(db);
        if (latest) {
          recordHeartbeat(db, latest.id, 'antigravity', pid, 'active');
        }
      }
    } catch {
      // Ignore DB errors during heartbeat
    }
  };

  sendHeartbeat();
  const heartbeatInterval = setInterval(sendHeartbeat, 4000);

  const cleanupAndExit = () => {
    clearInterval(heartbeatInterval);
    try {
      for (const root of getActiveRoots()) {
        const db = getDb(root);
        const latest = getLatestBrief(db);
        if (latest) {
          markSessionStopped(db, latest.id, 'antigravity');
        }
      }
    } catch {
      // Ignore DB errors during cleanup
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', cleanupAndExit);
  process.on('SIGTERM', cleanupAndExit);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  function sendResponse(id: unknown, result: unknown, error?: { code: number; message: string }) {
    const payload: {
      jsonrpc: string;
      id: unknown;
      result?: unknown;
      error?: { code: number; message: string };
    } = { jsonrpc: '2.0', id };

    if (error) {
      payload.error = error;
    } else {
      payload.result = result;
    }

    process.stdout.write(JSON.stringify(payload) + '\n');
  }

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let msg: { id?: unknown; method?: string; params?: Record<string, unknown> };
    try {
      msg = JSON.parse(trimmed);
    } catch {
      sendResponse(null, null, { code: -32700, message: 'Parse error' });
      return;
    }

    const { id, method, params } = msg;

    if (method === 'initialize') {
      if (params && typeof params === 'object') {
        const rootUri = typeof params.rootUri === 'string' ? params.rootUri : undefined;
        const rootPath = typeof params.rootPath === 'string' ? params.rootPath : undefined;
        const workspaceFolders = Array.isArray(params.workspaceFolders)
          ? (params.workspaceFolders as Array<{ uri?: string; name?: string }>)
          : undefined;

        let targetPath: string | undefined;
        if (rootUri) {
          try {
            targetPath = rootUri.startsWith('file://') ? new URL(rootUri).pathname : rootUri;
            if (
              process.platform === 'win32' &&
              targetPath.startsWith('/') &&
              targetPath[2] === ':'
            ) {
              targetPath = targetPath.slice(1);
            }
          } catch {
            targetPath = rootUri;
          }
        } else if (rootPath) {
          targetPath = rootPath;
        } else if (workspaceFolders && workspaceFolders.length > 0 && workspaceFolders[0]?.uri) {
          try {
            const uri = String(workspaceFolders[0].uri);
            targetPath = uri.startsWith('file://') ? new URL(uri).pathname : uri;
            if (
              process.platform === 'win32' &&
              targetPath.startsWith('/') &&
              targetPath[2] === ':'
            ) {
              targetPath = targetPath.slice(1);
            }
          } catch {
            targetPath = String(workspaceFolders[0]?.uri);
          }
        }

        if (targetPath) {
          activeProjectRoot = findProjectRoot(targetPath, false);
          sendHeartbeat();
        }
      }

      sendResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'crewmate',
          version: CREWMATE_VERSION,
        },
      });
      return;
    }

    if (method === 'notifications/initialized') {
      return;
    }

    if (method === 'ping') {
      sendResponse(id, {});
      return;
    }

    if (method === 'tools/list') {
      sendResponse(id, { tools: MCP_TOOLS });
      return;
    }

    if (method === 'tools/call') {
      const { name, arguments: toolArgs } = (params || {}) as {
        name?: string;
        arguments?: Record<string, unknown>;
      };

      if (!name) {
        sendResponse(id, {
          content: [{ type: 'text', text: 'Error: Tool name is required' }],
          isError: true,
        });
        return;
      }

      try {
        const res = await executeTool(name, toolArgs || {});
        sendResponse(id, {
          content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
        });
      } catch (err) {
        sendResponse(id, {
          content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
          isError: true,
        });
      }
      return;
    }

    if (id !== undefined && id !== null) {
      sendResponse(id, null, { code: -32601, message: `Method not found: ${method}` });
    }
  });

  rl.on('close', cleanupAndExit);
}

/**
 * Registers the mcp command group with Commander
 *
 * @param program The Commander program instance
 */
export function registerMcpCommand(program: Command): void {
  program
    .command('mcp')
    .description('Start the Crewmate MCP JSON-RPC 2.0 stdio server')
    .option('-p, --project-dir <path>', 'Explicit project directory to bind the MCP server to')
    .action((opts: { projectDir?: string }) => {
      startMcpServer(opts);
    });
}
