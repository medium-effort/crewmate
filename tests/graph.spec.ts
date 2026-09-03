import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildAgentNode,
  buildRailSegment,
  buildBouncingRailSegment,
  renderGraph,
  renderLegend,
  detectTerminalCapability,
  CHAR_SETS,
  type DispatchEdge,
} from '../src/utils/graph.js';
import { SPINNERS } from '../src/utils/ascii.js';

describe('activity graph rendering', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('buildAgentNode', () => {
    it('should wrap box characters with the appropriate color tag in unicode mode without spinner', () => {
      expect(buildAgentNode('frontman', CHAR_SETS.unicode)).toBe('{yellow-fg}■{/yellow-fg}');
      expect(buildAgentNode('scout', CHAR_SETS.unicode)).toBe('{cyan-fg}■{/cyan-fg}');
      expect(buildAgentNode('planner', CHAR_SETS.unicode)).toBe('{magenta-fg}■{/magenta-fg}');
      expect(buildAgentNode('executor', CHAR_SETS.unicode)).toBe('{green-fg}■{/green-fg}');
    });

    it('should render animated spinner when spinnerFrame is provided in unicode mode', () => {
      expect(buildAgentNode('frontman', CHAR_SETS.unicode, 0)).toBe(
        `{yellow-fg}${SPINNERS[0]}{/yellow-fg}`
      );
      expect(buildAgentNode('executor', CHAR_SETS.unicode, 3)).toBe(
        `{green-fg}${SPINNERS[3]}{/green-fg}`
      );
    });

    it('should wrap ascii characters with the appropriate color tag in ascii mode', () => {
      expect(buildAgentNode('frontman', CHAR_SETS.ascii)).toBe('{yellow-fg}#{/yellow-fg}');
      expect(buildAgentNode('executor', CHAR_SETS.ascii)).toBe('{green-fg}#{/green-fg}');
    });
  });

  describe('buildRailSegment', () => {
    it('should place dot at start when progress is 0 without arrowheads', () => {
      const rail = buildRailSegment(10, 0, CHAR_SETS.unicode);
      expect(rail.startsWith('●')).toBe(true);
      expect(rail).not.toContain('➤');
      expect(rail).not.toContain('>');
    });

    it('should place dot at end when progress is close to 1 without arrowheads', () => {
      const rail = buildRailSegment(10, 1, CHAR_SETS.unicode);
      expect(rail.endsWith('●')).toBe(true);
      expect(rail).not.toContain('➤');
    });

    it('should render ascii fallback correctly', () => {
      const rail = buildRailSegment(10, 0.5, CHAR_SETS.ascii);
      expect(rail).toContain('o');
      expect(rail).not.toContain('>:');
    });
  });

  describe('buildBouncingRailSegment', () => {
    it('bounces back and forth across 5 character positions', () => {
      // 0: pos 0
      expect(buildBouncingRailSegment(5, 0, CHAR_SETS.unicode)).toBe('●────');
      // 1: pos 1
      expect(buildBouncingRailSegment(5, 1, CHAR_SETS.unicode)).toBe('─●───');
      // 2: pos 2
      expect(buildBouncingRailSegment(5, 2, CHAR_SETS.unicode)).toBe('──●──');
      // 3: pos 3
      expect(buildBouncingRailSegment(5, 3, CHAR_SETS.unicode)).toBe('───●─');
      // 4: pos 4 (touches skill)
      expect(buildBouncingRailSegment(5, 4, CHAR_SETS.unicode)).toBe('────●');
      // 5: bounces back to pos 3
      expect(buildBouncingRailSegment(5, 5, CHAR_SETS.unicode)).toBe('───●─');
      // 6: pos 2
      expect(buildBouncingRailSegment(5, 6, CHAR_SETS.unicode)).toBe('──●──');
      // 7: pos 1
      expect(buildBouncingRailSegment(5, 7, CHAR_SETS.unicode)).toBe('─●───');
      // 8: pos 0 (back at frontman)
      expect(buildBouncingRailSegment(5, 8, CHAR_SETS.unicode)).toBe('●────');
    });

    it('defaults to center position when frame is undefined', () => {
      expect(buildBouncingRailSegment(5, undefined, CHAR_SETS.unicode)).toBe('──●──');
      expect(buildBouncingRailSegment(5, undefined, CHAR_SETS.ascii)).toBe('--o--');
    });
  });

  describe('renderLegend', () => {
    it('should always include all roles with solid box icons in the legend', () => {
      const legend = renderLegend(CHAR_SETS.unicode);
      expect(legend).toContain('Legend:');
      expect(legend).toContain('Frontman');
      expect(legend).toContain('Scout');
      expect(legend).toContain('Planner');
      expect(legend).toContain('Executor');
      expect(legend).toContain('{yellow-fg}■{/yellow-fg}');
      expect(legend).toContain('{green-fg}■{/green-fg}');
    });
  });

  describe('detectTerminalCapability', () => {
    it('should respect manual CREWMATE_GRAPH_RENDERER env override', () => {
      process.env.CREWMATE_GRAPH_RENDERER = 'ascii';
      expect(detectTerminalCapability()).toBe('ascii');

      process.env.CREWMATE_GRAPH_RENDERER = 'unicode';
      expect(detectTerminalCapability()).toBe('unicode');
    });
  });

  describe('renderGraph', () => {
    it('should render asking state when frontman is asking user question', () => {
      const result = renderGraph({
        edges: [],
        frontmanState: 'asking',
        spinnerFrame: 0,
        charSet: CHAR_SETS.unicode,
      });
      expect(result).toContain('asking user question');
      expect(result).toContain(SPINNERS[0]);
      expect(result).toContain('Legend:');
    });

    it('should render thinking state when frontman is analyzing/thinking', () => {
      const result = renderGraph({
        edges: [],
        frontmanState: 'thinking',
        spinnerFrame: 1,
        charSet: CHAR_SETS.unicode,
      });
      expect(result).toContain('thinking');
      expect(result).toContain(SPINNERS[1]);
      expect(result).toContain('Legend:');
    });

    it('should render idle notice when workflow is idle', () => {
      const result = renderGraph({ edges: [], frontmanState: 'idle' });
      expect(result).toContain('idle');
      expect(result).toContain('Legend:');
    });

    it('should render detailed granular activity descriptions when FrontmanActivity is passed', () => {
      const questioningResult = renderGraph({
        edges: [],
        activity: {
          id: 'a1',
          briefId: 'b1',
          activityType: 'questioning',
          message: 'What database should we use?',
          metadata: null,
          startedAt: new Date().toISOString(),
          endedAt: null,
        },
        spinnerFrame: 0,
        charSet: CHAR_SETS.unicode,
      });
      expect(questioningResult).toContain('asking user question: What database should we use?');
      expect(questioningResult).toContain(SPINNERS[0]);

      const analyzingResult = renderGraph({
        edges: [],
        activity: {
          id: 'a2',
          briefId: 'b1',
          activityType: 'analyzing',
          message: 'Processing requirements',
          metadata: null,
          startedAt: new Date().toISOString(),
          endedAt: null,
        },
        spinnerFrame: 1,
        charSet: CHAR_SETS.unicode,
      });
      expect(analyzingResult).toContain('analyzing requirements: Processing requirements');
      expect(analyzingResult).toContain(SPINNERS[1]);

      const idleResult = renderGraph({
        edges: [],
        activity: {
          id: 'a3',
          briefId: 'b1',
          activityType: 'idle',
          message: null,
          metadata: null,
          startedAt: new Date().toISOString(),
          endedAt: null,
        },
        charSet: CHAR_SETS.unicode,
      });
      expect(idleResult).toContain('idle · waiting for dispatch');
    });

    it('should render skill channeling visual when harness is antigravity', () => {
      const scoutResult = renderGraph({
        edges: [],
        harnessName: 'antigravity',
        activity: {
          id: 'a1',
          briefId: 'b1',
          activityType: 'analyzing',
          message: 'Scout workspace discovery',
          metadata: null,
          startedAt: new Date().toISOString(),
          endedAt: null,
        },
        spinnerFrame: 0,
        charSet: CHAR_SETS.unicode,
      });
      expect(scoutResult).toContain('●────');
      expect(scoutResult).toContain('[Skill: Scout]');
      expect(scoutResult).toContain('analyzing codebase architecture: Scout workspace discovery');

      const plannerResult = renderGraph({
        edges: [],
        harnessName: 'antigravity',
        activity: {
          id: 'a2',
          briefId: 'b1',
          activityType: 'planning',
          message: 'Decomposing brief into tasks',
          metadata: null,
          startedAt: new Date().toISOString(),
          endedAt: null,
        },
        spinnerFrame: 1,
        charSet: CHAR_SETS.unicode,
      });
      expect(plannerResult).toContain('─●───');
      expect(plannerResult).toContain('[Skill: Planner]');
      expect(plannerResult).toContain('decomposing brief & dependency graph');

      const executorResult = renderGraph({
        edges: [],
        harnessName: 'antigravity',
        activity: {
          id: 'a3',
          briefId: 'b1',
          activityType: 'orchestrating',
          message: 'Executing Task 1: Scaffolding',
          metadata: null,
          startedAt: new Date().toISOString(),
          endedAt: null,
        },
        spinnerFrame: 2,
        charSet: CHAR_SETS.unicode,
      });
      expect(executorResult).toContain('──●──');
      expect(executorResult).toContain('[Skill: Executor]');
      expect(executorResult).toContain(
        'executing task implementation: Executing Task 1: Scaffolding'
      );
    });

    it('should render single dispatch from frontman to executor with animated spinners and legend', () => {
      const edges: DispatchEdge[] = [
        {
          source: 'frontman',
          target: 'executor',
          taskId: 't1',
          startTime: Date.now() - 500, // 500ms elapsed
        },
      ];

      const result = renderGraph({
        edges,
        charSet: CHAR_SETS.unicode,
        spinnerFrame: 2,
      });
      expect(result).toContain(`{yellow-fg}${SPINNERS[2]}{/yellow-fg}`);
      expect(result).toContain(`{green-fg}${SPINNERS[2]}{/green-fg}`);
      expect(result).toContain('●');
      expect(result).toContain('Legend:');
      expect(result).toContain('{yellow-fg}■{/yellow-fg}'); // Legend retains square shape
    });

    it('should stack multiple dispatches vertically connected with branch characters', () => {
      const edges: DispatchEdge[] = [
        {
          source: 'frontman',
          target: 'executor',
          taskId: 't1',
          startTime: Date.now() - 200,
        },
        {
          source: 'frontman',
          target: 'scout',
          taskId: 't2',
          startTime: Date.now() - 200,
        },
      ];

      const result = renderGraph({
        edges,
        charSet: CHAR_SETS.unicode,
        spinnerFrame: 0,
      });
      expect(result).toContain('└');
      expect(result).toContain(`{cyan-fg}${SPINNERS[0]}{/cyan-fg}`);
      expect(result).toContain(`{green-fg}${SPINNERS[0]}{/green-fg}`);
    });
  });
});
