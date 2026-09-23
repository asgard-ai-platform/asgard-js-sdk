import { describe, it, expect } from 'vitest';
import { isAgentTool, isSubagentChildTool, reduceSubagents, SubagentEvent } from './subagent-reducer';

// F-012 — Subagent list accumulation. `reduceSubagents` folds the Agent tool-call + `subagent.*` +
// child tool-calls into the current list, keyed by `parentToolUseId`. The critical rule: status is
// terminal only via `subagentComplete` — the async `Agent` tool-call completion (which the adapter
// never feeds as a subagentComplete) must never mark the subagent done.

describe('isAgentTool / isSubagentChildTool (F-012)', () => {
  it('isAgentTool is true only for the native Agent tool', () => {
    expect(isAgentTool({ toolsetName: '', toolName: 'Agent' })).toBe(true);
    expect(isAgentTool({ toolsetName: '', toolName: 'Read' })).toBe(false);
    expect(isAgentTool({ toolsetName: 'db', toolName: 'Agent' })).toBe(false);
  });

  it('isSubagentChildTool is true when parentToolUseId is non-empty', () => {
    expect(isSubagentChildTool('X')).toBe(true);
    expect(isSubagentChildTool('')).toBe(false);
    expect(isSubagentChildTool(undefined)).toBe(false);
  });
});

describe('reduceSubagents (F-012)', () => {
  it('agentStart ensures an entry (running) carrying the description', () => {
    const subs = reduceSubagents([{ kind: 'agentStart', toolUseId: 'X', description: '查資料' }]);
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ parentToolUseId: 'X', status: 'running', description: '查資料' });
  });

  it('subagentStart fills agentId / subagentType / description without changing status', () => {
    const subs = reduceSubagents([
      { kind: 'agentStart', toolUseId: 'X' },
      { kind: 'subagentStart', parentToolUseId: 'X', agentId: 'Y', subagentType: 'general-purpose', description: 'd' },
    ]);
    expect(subs[0]).toMatchObject({
      agentId: 'Y',
      subagentType: 'general-purpose',
      description: 'd',
      status: 'running',
    });
  });

  it('child toolStart/toolComplete fold into the subagent tool list with status', () => {
    const subs = reduceSubagents([
      { kind: 'agentStart', toolUseId: 'X' },
      {
        kind: 'toolStart',
        parentToolUseId: 'X',
        toolUseId: 't1',
        toolsetName: '',
        toolName: 'Read',
        parameter: { file_path: '/a' },
      },
      { kind: 'toolStart', parentToolUseId: 'X', toolUseId: 't2', toolsetName: 'db', toolName: 'query' },
      { kind: 'toolComplete', parentToolUseId: 'X', toolUseId: 't1' },
      { kind: 'toolComplete', parentToolUseId: 'X', toolUseId: 't2', isError: true },
    ]);
    expect(subs[0].tools.map(t => `${t.toolName}:${t.status}`)).toEqual(['Read:completed', 'query:error']);
  });

  it('subagentComplete drives the terminal status + summary', () => {
    for (const status of ['completed', 'failed', 'cancelled'] as const) {
      const subs = reduceSubagents([
        { kind: 'agentStart', toolUseId: 'X' },
        { kind: 'subagentComplete', parentToolUseId: 'X', status, summary: 's' },
      ]);
      expect(subs[0]).toMatchObject({ status, summary: 's' });
    }
  });

  it('preserves first-seen order across multiple subagents', () => {
    const subs = reduceSubagents([
      { kind: 'agentStart', toolUseId: 'A' },
      { kind: 'agentStart', toolUseId: 'B' },
      { kind: 'subagentComplete', parentToolUseId: 'B', status: 'completed' },
    ]);
    expect(subs.map(s => s.parentToolUseId)).toEqual(['A', 'B']);
  });

  // 附錄 A: the Agent tool completes early (async_launched) — never fed as subagentComplete — so the
  // subagent stays running even after all its child tools finish, until subagent.complete arrives.
  const timeline: SubagentEvent[] = [
    { kind: 'agentStart', toolUseId: 'X', description: '查詢資料庫' },
    { kind: 'subagentStart', parentToolUseId: 'X', agentId: 'Y', subagentType: 'general-purpose' },
    // (the Agent tool_call.complete with result.status="async_launched" is NOT an event here)
    {
      kind: 'toolStart',
      parentToolUseId: 'X',
      toolUseId: 't1',
      toolsetName: 'db',
      toolName: 'list_database_semantic_models',
    },
    { kind: 'toolComplete', parentToolUseId: 'X', toolUseId: 't1' },
    { kind: 'toolStart', parentToolUseId: 'X', toolUseId: 't2', toolsetName: 'db', toolName: 'execute_database_query' },
    { kind: 'toolComplete', parentToolUseId: 'X', toolUseId: 't2' },
  ];

  it('R4: stays running after child tools finish, with no subagentComplete (async-launched)', () => {
    const subs = reduceSubagents(timeline);
    expect(subs[0].status).toBe('running');
    expect(subs[0].tools).toHaveLength(2);
    expect(subs[0].tools.every(t => t.status === 'completed')).toBe(true);
  });

  it('R4: goes completed only once subagent.complete arrives', () => {
    const subs = reduceSubagents([
      ...timeline,
      { kind: 'subagentComplete', parentToolUseId: 'X', status: 'completed' },
    ]);
    expect(subs[0].status).toBe('completed');
  });

  // A replay re-applies the *same* arrival order, so the trailing `complete` wins and the snapshot is
  // unchanged. (Before issue #382 this case asserted that a trailing `subagentStart` could never revert
  // a completed subagent — that freeze is exactly what made a resumed subagent read as finished.)
  it('R5: replay-safe — re-folding the same arrival order yields the same terminal snapshot', () => {
    const run: SubagentEvent[] = [
      { kind: 'agentStart', toolUseId: 'X' },
      { kind: 'subagentStart', parentToolUseId: 'X', agentId: 'Y' },
      { kind: 'subagentComplete', parentToolUseId: 'X', status: 'completed' },
    ];
    expect(reduceSubagents(run)[0].status).toBe('completed');
    expect(reduceSubagents([...run, ...run])[0].status).toBe('completed');
  });

  it('R5: any prefix folds to a consistent snapshot', () => {
    expect(reduceSubagents([])).toEqual([]);
    expect(reduceSubagents(timeline.slice(0, 3))[0]).toMatchObject({ status: 'running' });
  });
});

// Issue #382 — a subagent is not one-shot. The orchestrator can send further instructions to an
// *existing* subagent, and the resume arrives in one of two shapes (both pinned by asgard-core#168):
//   A. resumed within the same turn — a second `subagent.start` follows the `subagent.complete`.
//   B. resumed in a later turn — the backend emits NO subagent lifecycle event at all; the resumed
//      run's child tool-calls (still carrying the original parentToolUseId) are the only signal.
// A card that is producing new activity must read as running in both.
describe('reduceSubagents — a resumed subagent reads as running again (issue #382)', () => {
  const child = (toolUseId: string): SubagentEvent => ({
    kind: 'toolStart',
    parentToolUseId: 'X',
    toolUseId,
    toolsetName: '',
    toolName: 'Read',
  });

  const firstRun: SubagentEvent[] = [
    { kind: 'agentStart', toolUseId: 'X', description: '查資料' },
    { kind: 'subagentStart', parentToolUseId: 'X', agentId: 'Y', subagentType: 'general-purpose' },
    child('t1'),
    { kind: 'toolComplete', parentToolUseId: 'X', toolUseId: 't1' },
    { kind: 'subagentComplete', parentToolUseId: 'X', status: 'completed', summary: '第一輪結論' },
  ];

  it('R1: shape A — start → complete → start goes back to running', () => {
    const subs = reduceSubagents([...firstRun, { kind: 'subagentStart', parentToolUseId: 'X', agentId: 'Y' }]);
    expect(subs).toHaveLength(1);
    expect(subs[0].status).toBe('running');
  });

  it('R2: shape A — start → complete → start → complete ends terminal again', () => {
    const subs = reduceSubagents([
      ...firstRun,
      { kind: 'subagentStart', parentToolUseId: 'X', agentId: 'Y' },
      child('t2'),
      { kind: 'toolComplete', parentToolUseId: 'X', toolUseId: 't2' },
      { kind: 'subagentComplete', parentToolUseId: 'X', status: 'failed', summary: '第二輪結論' },
    ]);
    expect(subs[0]).toMatchObject({ status: 'failed', summary: '第二輪結論' });
  });

  it('R3: shape B — a child toolStart on a terminal card revives it, on the same card', () => {
    const subs = reduceSubagents([...firstRun, child('t2')]);
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ parentToolUseId: 'X', status: 'running' });
    expect(subs[0].tools.map(t => t.toolName)).toEqual(['Read', 'Read']);
  });

  it('R3: shape B — the card keeps its identity (subagentType / description) across the resume', () => {
    const subs = reduceSubagents([...firstRun, child('t2')]);
    expect(subs[0]).toMatchObject({ subagentType: 'general-purpose', description: '查資料' });
  });

  it('R4: reverting to running drops the finished run’s summary', () => {
    expect(reduceSubagents([...firstRun, child('t2')])[0].summary).toBeUndefined();
    expect(
      reduceSubagents([...firstRun, { kind: 'subagentStart', parentToolUseId: 'X', agentId: 'Y' }])[0].summary,
    ).toBeUndefined();
  });

  it('R4: a tool-call on a still-running subagent leaves its state alone', () => {
    const subs = reduceSubagents([...firstRun.slice(0, 4), child('t2')]);
    expect(subs[0].status).toBe('running');
    expect(subs[0].summary).toBeUndefined();
  });
});

// asgard-freyr-pm#815 — a child tool-call's result reaches `SubagentToolCall` untouched, so a consumer can
// show what each step returned, not only that it succeeded.
describe('reduceSubagents — child tool-call results (asgard-freyr-pm#815)', () => {
  const start: SubagentEvent[] = [
    { kind: 'agentStart', toolUseId: 'X' },
    { kind: 'toolStart', parentToolUseId: 'X', toolUseId: 't1', toolsetName: '', toolName: 'Bash' },
  ];

  it('carries the result and sidecar onto the tool, as the very same objects', () => {
    const result = { stdout: 'ok', exitCode: 0 };
    const sidecar = { kind: 'bash', lines: 1 };
    const subs = reduceSubagents([
      ...start,
      { kind: 'toolComplete', parentToolUseId: 'X', toolUseId: 't1', result, sidecar },
    ]);

    expect(subs[0].tools[0].result).toBe(result);
    expect(subs[0].tools[0].sidecar).toBe(sidecar);
  });

  it('leaves the sidecar absent when the frame carries none', () => {
    const subs = reduceSubagents([
      ...start,
      { kind: 'toolComplete', parentToolUseId: 'X', toolUseId: 't1', result: {} },
    ]);

    expect(subs[0].tools[0]).not.toHaveProperty('sidecar');
  });

  it('tells "not yet" (running, no result) apart from "present but empty" ({})', () => {
    const running = reduceSubagents(start);
    const empty = reduceSubagents([
      ...start,
      { kind: 'toolComplete', parentToolUseId: 'X', toolUseId: 't1', result: {} },
    ]);

    expect(running[0].tools[0]).toMatchObject({ status: 'running' });
    expect(running[0].tools[0].result).toBeUndefined();
    expect(empty[0].tools[0]).toMatchObject({ status: 'completed', result: {} });
  });

  it('keeps the result of a failed call too', () => {
    const result = { error: 'permission denied' };
    const subs = reduceSubagents([
      ...start,
      { kind: 'toolComplete', parentToolUseId: 'X', toolUseId: 't1', isError: true, result },
    ]);

    expect(subs[0].tools[0]).toMatchObject({ status: 'error', result });
  });
});
