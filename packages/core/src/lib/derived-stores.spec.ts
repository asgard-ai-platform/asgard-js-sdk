import { describe, it, expect } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import Conversation from './conversation';
import { createDerivedStores, deriveSubagents, deriveTasks, subagentsEqual, tasksEqual } from './derived-stores';
import { EventType } from '../constants/enum';
import type { ConversationMessage, SseResponse, Subagent, SubagentTerminalStatus, Task } from '../types';

// F-013 — derived-state stores. `deriveTasks` / `deriveSubagents` are pure folds over the conversation;
// `createDerivedStores` exposes per-slice `BehaviorSubject`s that emit only when the slice structurally
// changes (so high-frequency message deltas don't re-notify list-only consumers).

function conv(messages: ConversationMessage[]): Conversation {
  return new Conversation({ messages: new Map(messages.map(m => [m.messageId, m])) });
}

function taskCreate(seq: number, id: string, subject: string): ConversationMessage {
  return {
    type: 'tool-call',
    messageId: `task-${seq}`,
    eventType: EventType.TOOL_CALL_COMPLETE,
    processId: 'p',
    callSeq: seq,
    toolName: 'TaskCreate',
    reason: '',
    toolsetName: '',
    parameter: { subject },
    sidecar: { task: { id } },
    isComplete: true,
    time: new Date(0),
  };
}

function botMessage(id: string, text: string): ConversationMessage {
  return {
    type: 'bot',
    messageId: id,
    eventType: EventType.MESSAGE_COMPLETE,
    isTyping: false,
    typingText: null,
    message: { messageId: id, text } as never,
    time: new Date(0),
    raw: '',
  };
}

function agentTool(seq: number, toolUseId: string, description: string): ConversationMessage {
  return {
    type: 'tool-call',
    messageId: `agent-${seq}`,
    eventType: EventType.TOOL_CALL_COMPLETE,
    processId: 'p',
    callSeq: seq,
    toolName: 'Agent',
    reason: '',
    toolsetName: '',
    parameter: { description },
    toolUseId,
    result: { status: 'async_launched' },
    isComplete: true,
    time: new Date(0),
  };
}

function subagentStart(id: string, parentToolUseId: string): ConversationMessage {
  return {
    type: 'subagent',
    messageId: `sub-start-${parentToolUseId}`,
    kind: 'start',
    parentToolUseId,
    agentId: id,
    subagentType: 'general-purpose',
    description: 'work',
    time: new Date(0),
  };
}

function subagentComplete(
  parentToolUseId: string,
  status: SubagentTerminalStatus,
  summary: string,
): ConversationMessage {
  return {
    type: 'subagent',
    messageId: `sub-complete-${parentToolUseId}`,
    kind: 'complete',
    parentToolUseId,
    agentId: 'Y',
    status,
    summary,
    time: new Date(0),
  };
}

function childTool(seq: number, parentToolUseId: string, isComplete: boolean): ConversationMessage {
  return {
    type: 'tool-call',
    messageId: `child-${seq}`,
    eventType: isComplete ? EventType.TOOL_CALL_COMPLETE : EventType.TOOL_CALL_START,
    processId: 'p',
    callSeq: seq,
    toolName: 'Read',
    reason: '',
    toolsetName: '',
    parameter: {},
    toolUseId: `t${seq}`,
    parentToolUseId,
    isComplete,
    time: new Date(0),
  };
}

describe('deriveTasks / deriveSubagents (F-013)', () => {
  it('deriveTasks folds the completed task tool-calls into the Task list', () => {
    const tasks = deriveTasks(conv([taskCreate(1, '1', 'a'), botMessage('b1', 'hi'), taskCreate(2, '2', 'b')]));
    expect(tasks.map(t => t.id)).toEqual(['1', '2']);
    expect(tasks[0]).toMatchObject({ subject: 'a', status: 'pending' });
  });

  it('deriveSubagents folds Agent + subagent.start into the Subagent list (running)', () => {
    const subs = deriveSubagents(conv([agentTool(1, 'X', 'query'), subagentStart('Y', 'X')]));
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ parentToolUseId: 'X', status: 'running', subagentType: 'general-purpose' });
  });

  it('an empty conversation derives empty lists', () => {
    expect(deriveTasks(conv([]))).toEqual([]);
    expect(deriveSubagents(conv([]))).toEqual([]);
  });
});

// Issue #382 — end to end over the conversation. `conversationToSubagentEvents` reads the message Map's
// insertion order as arrival order, and `Conversation` re-keys a resumed subagent's lifecycle messages to
// the tail, so the orders below are the ones a real resumed run produces.
describe('deriveSubagents — a resumed subagent (issue #382)', () => {
  const agent = agentTool(1, 'X', 'query');
  const firstRun = [agent, subagentStart('Y', 'X'), childTool(1, 'X', true), subagentComplete('X', 'completed', 'a')];

  it('the first run alone derives a terminal card carrying its summary', () => {
    const subs = deriveSubagents(conv(firstRun));
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ parentToolUseId: 'X', status: 'completed', summary: 'a' });
  });

  it('shape B — a later-turn resume (no lifecycle event) revives the card on its child tool alone', () => {
    const subs = deriveSubagents(conv([...firstRun, childTool(2, 'X', false)]));
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ status: 'running', summary: undefined });
    expect(subs[0].tools).toHaveLength(2);
  });

  it('shape A — a same-turn resume (start re-keyed to the tail) reads as running', () => {
    // Map order after the resume's `start` is re-keyed: agent, t1, complete, start, t2
    const subs = deriveSubagents(
      conv([agent, childTool(1, 'X', true), subagentComplete('X', 'completed', 'a'), subagentStart('Y', 'X'), childTool(2, 'X', false)]), // prettier-ignore
    );
    expect(subs[0]).toMatchObject({ status: 'running', summary: undefined });
  });

  it('shape A — once the resumed run completes, the re-keyed complete settles the card again', () => {
    // Map order after both lifecycle messages are re-keyed: agent, t1, start, t2, complete
    const subs = deriveSubagents(
      conv([agent, childTool(1, 'X', true), subagentStart('Y', 'X'), childTool(2, 'X', true), subagentComplete('X', 'failed', 'b')]), // prettier-ignore
    );
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ status: 'failed', summary: 'b' });
  });
});

describe('tasksEqual / subagentsEqual (F-013)', () => {
  it('tasksEqual is true for structurally-equal lists, false on any field change', () => {
    const a: Task[] = [{ id: '1', subject: 's', status: 'pending' }];
    expect(tasksEqual(a, [{ id: '1', subject: 's', status: 'pending' }])).toBe(true);
    expect(tasksEqual(a, [{ id: '1', subject: 's', status: 'in_progress' }])).toBe(false);
    expect(tasksEqual(a, [])).toBe(false);
  });

  it('subagentsEqual compares the child tool list too', () => {
    const base: Subagent[] = [
      {
        parentToolUseId: 'X',
        status: 'running',
        tools: [{ toolsetName: 'db', toolName: 'q', parameter: {}, status: 'running' }],
      },
    ];
    const sameShape: Subagent[] = [
      {
        parentToolUseId: 'X',
        status: 'running',
        tools: [{ toolsetName: 'db', toolName: 'q', parameter: {}, status: 'running' }],
      },
    ];
    const toolDone: Subagent[] = [
      {
        parentToolUseId: 'X',
        status: 'running',
        tools: [{ toolsetName: 'db', toolName: 'q', parameter: {}, status: 'completed' }],
      },
    ];
    expect(subagentsEqual(base, sameShape)).toBe(true);
    expect(subagentsEqual(base, toolDone)).toBe(false);
  });
});

describe('createDerivedStores (F-013)', () => {
  it('a conversation delta that does NOT change tasks does not emit on tasks$', () => {
    const conversation$ = new BehaviorSubject<Conversation>(conv([taskCreate(1, '1', 'a')]));
    const stores = createDerivedStores(conversation$);

    const emissions: Task[][] = [];
    const sub = stores.tasks$.subscribe(t => emissions.push(t));
    expect(emissions).toHaveLength(1); // initial replay

    // add an unrelated bot message → tasks unchanged → no new emission
    conversation$.next(conv([taskCreate(1, '1', 'a'), botMessage('b1', 'hi')]));
    expect(emissions).toHaveLength(1);

    // a real task change → emits
    conversation$.next(conv([taskCreate(1, '1', 'a'), botMessage('b1', 'hi'), taskCreate(2, '2', 'b')]));
    expect(emissions).toHaveLength(2);
    expect(emissions[1].map(t => t.id)).toEqual(['1', '2']);

    sub.unsubscribe();
    stores.teardown();
  });

  it('subagents$ emits only on subagent-slice changes; getSnapshot reflects the latest', () => {
    const conversation$ = new BehaviorSubject<Conversation>(conv([]));
    const stores = createDerivedStores(conversation$);

    const emissions: Subagent[][] = [];
    const sub = stores.subagents$.subscribe(s => emissions.push(s));
    expect(emissions).toHaveLength(1); // []

    conversation$.next(conv([agentTool(1, 'X', 'query')]));
    expect(emissions).toHaveLength(2);
    expect(stores.getSubagents()[0]).toMatchObject({ parentToolUseId: 'X', status: 'running' });

    // adding a plain bot message doesn't touch the subagent slice
    conversation$.next(conv([agentTool(1, 'X', 'query'), botMessage('b1', 'hi')]));
    expect(emissions).toHaveLength(2);

    sub.unsubscribe();
    stores.teardown();
  });

  it('a late subscriber immediately replays the current snapshot', () => {
    const conversation$ = new BehaviorSubject<Conversation>(conv([taskCreate(1, '1', 'a')]));
    const stores = createDerivedStores(conversation$);

    let latest: Task[] | undefined;
    const sub = stores.tasks$.subscribe(t => (latest = t));
    expect(latest?.map(t => t.id)).toEqual(['1']); // replayed without waiting for a new emission
    expect(stores.getTasks().map(t => t.id)).toEqual(['1']);

    sub.unsubscribe();
    stores.teardown();
  });

  it('teardown stops further derivation', () => {
    const conversation$ = new BehaviorSubject<Conversation>(conv([]));
    const stores = createDerivedStores(conversation$);
    stores.teardown();

    conversation$.next(conv([taskCreate(1, '1', 'a')]));
    expect(stores.getTasks()).toEqual([]); // no longer updating after teardown
  });
});

// asgard-freyr-pm#815 — the child tool-call result survives the fold, end to end over real frames. A GET
// rejoin replays only the terminal `tool_call.complete` (no `start`), so both paths must derive the same.
function childFrame(
  eventType: EventType.TOOL_CALL_START | EventType.TOOL_CALL_COMPLETE,
  callSeq: number,
  extra: Record<string, unknown> = {},
): SseResponse<EventType> {
  const data = {
    processId: 'p',
    callSeq,
    toolUseId: `t${callSeq}`,
    parentToolUseId: 'X',
    toolCall: { toolsetName: '', toolName: 'Bash', parameter: { command: 'ls' } },
    ...extra,
  };

  return {
    eventType,
    requestId: 'req-1',
    traceId: 'trace-1',
    namespace: 'ns',
    botProviderName: 'bp',
    customChannelId: 'ch',
    fact: eventType === EventType.TOOL_CALL_START ? { toolCallStart: data } : { toolCallComplete: data },
  } as unknown as SseResponse<EventType>;
}

describe('deriveSubagents — child tool-call results (asgard-freyr-pm#815)', () => {
  const result = { stdout: 'a.ts\nb.ts' };
  const sidecar = { lines: 2 };
  const complete = childFrame(EventType.TOOL_CALL_COMPLETE, 1, {
    toolCallResult: result,
    toolUseResultSidecar: sidecar,
  });
  const empty = (): Conversation => conv([agentTool(0, 'X', 'query')]);

  it('a live run exposes the result and sidecar the conversation stored, as the same objects', () => {
    const live = empty().onMessage(childFrame(EventType.TOOL_CALL_START, 1)).onMessage(complete);
    const tool = deriveSubagents(live)[0].tools[0];
    const message = live.messages?.get('p-1') as Extract<ConversationMessage, { type: 'tool-call' }>;

    expect(tool).toMatchObject({ toolName: 'Bash', status: 'completed', result, sidecar });
    expect(tool.result).toBe(message.result);
    expect(tool.sidecar).toBe(message.sidecar);
  });

  it('a still-running child carries no result yet', () => {
    const running = empty().onMessage(childFrame(EventType.TOOL_CALL_START, 1));

    const tool = deriveSubagents(running)[0].tools[0];

    expect(tool.status).toBe('running');
    expect(tool.result).toBeUndefined();
  });

  it('a GET rejoin (complete without start) derives the same tool as the live run', () => {
    const live = empty().onMessage(childFrame(EventType.TOOL_CALL_START, 1)).onMessage(complete);
    const rejoin = empty().onMessage(complete);

    expect(deriveSubagents(rejoin)).toEqual(deriveSubagents(live));
  });

  it('subagentsEqual treats the same result objects as equal, and a changed result or sidecar as a change', () => {
    const tool = { toolsetName: '', toolName: 'Bash', parameter: {}, status: 'completed' as const };
    const withResult = (r: Record<string, unknown>): Subagent[] => [
      { parentToolUseId: 'X', status: 'running', tools: [{ ...tool, result: r, sidecar }] },
    ];

    expect(subagentsEqual(withResult(result), withResult(result))).toBe(true);
    expect(subagentsEqual(withResult(result), withResult({ stdout: 'other' }))).toBe(false);
    expect(
      subagentsEqual(withResult(result), [{ parentToolUseId: 'X', status: 'running', tools: [{ ...tool, result }] }]),
    ).toBe(false);
  });

  it('subagents$ emits when the result lands, then stays quiet on unrelated deltas', () => {
    const started = empty().onMessage(childFrame(EventType.TOOL_CALL_START, 1));
    const conversation$ = new BehaviorSubject<Conversation>(started);
    const stores = createDerivedStores(conversation$);

    const emissions: Subagent[][] = [];
    const sub = stores.subagents$.subscribe(s => emissions.push(s));

    const completed = started.onMessage(complete);
    conversation$.next(completed);
    expect(emissions).toHaveLength(2);
    expect(emissions[1][0].tools[0].result).toBe(result);

    conversation$.next(
      new Conversation({ messages: new Map([...(completed.messages ?? []), ['b1', botMessage('b1', 'hi')]]) }),
    );
    expect(emissions).toHaveLength(2);

    sub.unsubscribe();
    stores.teardown();
  });
});
