import { describe, it, expect } from 'vitest';
import { EventType } from '../constants/enum';
import { ConversationMessage } from '../types';
import { deepEqual, reduceSubagents, reduceTasks } from './derived-state';

function toolCall(
  key: string,
  toolName: string,
  parameter: Record<string, unknown>,
  opts: {
    toolUseId?: string;
    parentToolUseId?: string;
    isError?: boolean;
    isComplete?: boolean;
    sidecar?: Record<string, unknown>;
  } = {},
): ConversationMessage {
  return {
    type: 'tool-call',
    messageId: key,
    eventType: opts.isComplete === false ? EventType.TOOL_CALL_START : EventType.TOOL_CALL_COMPLETE,
    processId: 'p',
    callSeq: 0,
    toolName,
    toolsetName: '',
    parameter,
    isComplete: opts.isComplete ?? true,
    isError: opts.isError,
    toolUseId: opts.toolUseId,
    parentToolUseId: opts.parentToolUseId,
    toolUseResultSidecar: opts.sidecar,
    time: new Date(0),
  };
}

function subagentMsg(
  parentToolUseId: string,
  status: 'running' | 'completed' | 'failed' | 'cancelled',
  extra: { subagentType?: string; description?: string } = {},
): ConversationMessage {
  return {
    type: 'subagent',
    messageId: parentToolUseId,
    eventType: status === 'running' ? EventType.SUBAGENT_START : EventType.SUBAGENT_COMPLETE,
    parentToolUseId,
    subagentType: extra.subagentType,
    description: extra.description,
    status,
    time: new Date(0),
  };
}

function botDelta(id: string): ConversationMessage {
  return {
    type: 'bot',
    messageId: id,
    eventType: EventType.MESSAGE_DELTA,
    isTyping: true,
    typingText: 'streaming…',
    // minimal Message stand-in; reducers never read it
    message: { messageId: id } as never,
    time: new Date(0),
    raw: '',
  };
}

describe('reduceTasks (F-010, relocated to core in F-013)', () => {
  it('folds TaskCreate/TaskUpdate into one list in create-arrival order', () => {
    const tasks = reduceTasks([
      toolCall('c1', 'TaskCreate', { id: 't1', subject: 'A', status: 'pending' }),
      toolCall('c2', 'TaskCreate', { id: 't2', subject: 'B', status: 'pending' }),
      toolCall('c3', 'TaskUpdate', { id: 't1', status: 'completed' }),
    ]);
    expect(tasks.map(t => t.id)).toEqual(['t1', 't2']);
    expect(tasks[0].status).toBe('completed');
    expect(tasks[1].status).toBe('pending');
    expect(tasks[0].subject).toBe('A');
  });

  it('ignores non-task tool calls', () => {
    expect(reduceTasks([toolCall('r', 'Read', { file_path: '/a' })])).toEqual([]);
  });

  // EXT-002: the authoritative id + status come from the tool-result sidecar, not `parameter`.
  it('reads id + subject from the TaskCreate sidecar (sidecar-first)', () => {
    const tasks = reduceTasks([
      toolCall(
        'c1',
        'TaskCreate',
        { activeForm: 'doing A', description: 'desc A' },
        { sidecar: { task: { id: 't1', subject: 'A' } } },
      ),
    ]);
    expect(tasks).toEqual([
      { id: 't1', subject: 'A', activeForm: 'doing A', description: 'desc A', status: 'pending' },
    ]);
  });

  it('takes TaskUpdate status from sidecar.statusChange.to, keyed by sidecar.taskId', () => {
    const tasks = reduceTasks([
      toolCall('c1', 'TaskCreate', {}, { sidecar: { task: { id: 't1', subject: 'A' } } }),
      toolCall(
        'c2',
        'TaskUpdate',
        {},
        { sidecar: { taskId: 't1', statusChange: { from: 'pending', to: 'completed' } } },
      ),
    ]);
    expect(tasks).toEqual([
      { id: 't1', subject: 'A', activeForm: undefined, description: undefined, status: 'completed' },
    ]);
  });

  it('prefers the sidecar over parameter when both disagree', () => {
    const tasks = reduceTasks([
      toolCall(
        'c1',
        'TaskCreate',
        { id: 'stale', subject: 'stale' },
        { sidecar: { task: { id: 't1', subject: 'real' } } },
      ),
      toolCall(
        'c2',
        'TaskUpdate',
        { id: 'stale', status: 'pending' },
        { sidecar: { taskId: 't1', statusChange: { to: 'in_progress' } } },
      ),
    ]);
    expect(tasks).toEqual([
      { id: 't1', subject: 'real', activeForm: undefined, description: undefined, status: 'in_progress' },
    ]);
  });

  it('falls back to parameter when no sidecar is present (older frames)', () => {
    const tasks = reduceTasks([
      toolCall('c1', 'TaskCreate', { id: 't1', subject: 'A', status: 'pending' }),
      toolCall('c2', 'TaskUpdate', { id: 't1', status: 'completed' }),
    ]);
    expect(tasks).toEqual([
      { id: 't1', subject: 'A', activeForm: undefined, description: undefined, status: 'completed' },
    ]);
  });
});

describe('reduceSubagents (F-012, relocated to core in F-013)', () => {
  it('folds Agent + subagent + child tools into one subagent keyed by parentToolUseId', () => {
    const subagents = reduceSubagents([
      toolCall('a', 'Agent', { description: 'analyze' }, { toolUseId: 'X' }),
      subagentMsg('X', 'running', { subagentType: 'general-purpose', description: 'analyze' }),
      toolCall('t1', 'Read', { file_path: '/a' }, { toolUseId: 'c1', parentToolUseId: 'X' }),
      toolCall('t2', 'WebSearch', { query: 'q' }, { toolUseId: 'c2', parentToolUseId: 'X', isError: true }),
      subagentMsg('X', 'completed', { subagentType: 'general-purpose' }),
    ]);
    expect(subagents).toHaveLength(1);
    expect(subagents[0].parentToolUseId).toBe('X');
    expect(subagents[0].status).toBe('completed'); // driven by the subagent message
    expect(subagents[0].subagentType).toBe('general-purpose');
    expect(subagents[0].tools.map(t => t.status)).toEqual(['completed', 'error']);
  });

  it('Agent tool call alone seeds a running subagent', () => {
    const subagents = reduceSubagents([toolCall('a', 'Agent', { description: 'go' }, { toolUseId: 'X' })]);
    expect(subagents).toEqual([{ parentToolUseId: 'X', status: 'running', description: 'go', tools: [] }]);
  });
});

describe('deepEqual + slice stability (F-013 distinctUntilChanged)', () => {
  it('structurally compares primitives, arrays, and nested objects', () => {
    expect(deepEqual([{ a: 1, b: [2] }], [{ a: 1, b: [2] }])).toBe(true);
    expect(deepEqual([{ a: 1 }], [{ a: 2 }])).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEqual(undefined, undefined)).toBe(true);
  });

  it('a message.delta that does not touch tasks leaves the reduced slice structurally equal', () => {
    const base: ConversationMessage[] = [toolCall('c1', 'TaskCreate', { id: 't1', subject: 'A', status: 'pending' })];
    const afterDelta = [...base, botDelta('m1')];
    // distinctUntilChanged(deepEqual) would block the re-emit → the store does not push a new list.
    expect(deepEqual(reduceTasks(base), reduceTasks(afterDelta))).toBe(true);
    expect(deepEqual(reduceSubagents(base), reduceSubagents(afterDelta))).toBe(true);
  });

  it('a real task change is detected (not blocked)', () => {
    const before = [toolCall('c1', 'TaskCreate', { id: 't1', subject: 'A', status: 'pending' })];
    const after = [...before, toolCall('c2', 'TaskUpdate', { id: 't1', status: 'completed' })];
    expect(deepEqual(reduceTasks(before), reduceTasks(after))).toBe(false);
  });
});
