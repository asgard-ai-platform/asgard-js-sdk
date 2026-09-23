// Derived-state stores (F-013) — framework-agnostic Task / Subagent stores.
//
// The Task List (F-010) and Subagent List (F-012) are pure folds over the conversation. This module
// exposes them as reactive slices so SDK consumers can render the lists *outside* the Chatbot in any
// framework: a current immutable snapshot + change notification, never a fire-and-forget delta event.
//
// The key performance property: `conversation` changes on every message delta (high frequency), but a
// consumer that "just wants to draw the list" must not re-render on unrelated deltas. Each slice is a
// `BehaviorSubject` fed through `distinctUntilChanged` on structural equality, so it only emits when
// that slice actually changes.
import { BehaviorSubject, distinctUntilChanged, map, Observable, Subscription } from 'rxjs';
import Conversation from './conversation';
import { isTaskTool, reduceTaskEvents } from './task-reducer';
import { isAgentTool, isSubagentChildTool, reduceSubagents, SubagentEvent } from './subagent-reducer';
import { ConversationMessage, ConversationToolCallMessage, Subagent, SubagentToolCall, Task } from '../types';

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Adapt the ordered conversation messages into the `SubagentEvent[]` that `reduceSubagents` folds.
 * Iterating the conversation Map yields arrival order: a message updated in place keeps its slot (a
 * tool-call completing does not jump the queue), and the one case where a message genuinely arrives
 * again — a resumed subagent re-emitting `subagent.start` / `subagent.complete` under the same key —
 * is re-keyed to the tail by `Conversation` so this fold still sees true order (issue #382). A completed
 * child tool emits toolStart + toolComplete back-to-back (its final status is what shows); an
 * in-progress child emits only toolStart (→ running).
 */
export function conversationToSubagentEvents(messages: ConversationMessage[]): SubagentEvent[] {
  const events: SubagentEvent[] = [];

  for (const message of messages) {
    if (message.type === 'tool-call' && isAgentTool(message)) {
      events.push({
        kind: 'agentStart',
        toolUseId: message.toolUseId ?? message.messageId,
        description: str(message.parameter.description),
      });
      continue;
    }

    if (message.type === 'tool-call' && isSubagentChildTool(message.parentToolUseId)) {
      const toolUseId = message.toolUseId ?? message.messageId;

      events.push({
        kind: 'toolStart',
        parentToolUseId: message.parentToolUseId as string,
        toolUseId,
        toolsetName: message.toolsetName,
        toolName: message.toolName,
        parameter: message.parameter,
        reason: message.reason,
      });

      if (message.isComplete) {
        events.push({
          kind: 'toolComplete',
          parentToolUseId: message.parentToolUseId as string,
          toolUseId,
          isError: message.isError,
          result: message.result,
          sidecar: message.sidecar,
        });
      }

      continue;
    }

    if (message.type === 'subagent' && message.kind === 'start') {
      events.push({
        kind: 'subagentStart',
        parentToolUseId: message.parentToolUseId,
        agentId: message.agentId,
        subagentType: message.subagentType,
        description: message.description,
      });
      continue;
    }

    if (message.type === 'subagent' && message.kind === 'complete' && message.status) {
      events.push({
        kind: 'subagentComplete',
        parentToolUseId: message.parentToolUseId,
        status: message.status,
        summary: message.summary,
      });
    }
  }

  return events;
}

/** Fold the conversation's completed Task tool-calls into the current Task list (F-010). */
export function deriveTasks(conversation: Conversation): Task[] {
  const messages = Array.from(conversation.messages?.values() ?? []).filter(
    (message): message is ConversationToolCallMessage =>
      message.type === 'tool-call' && message.isComplete && isTaskTool(message),
  );

  return reduceTaskEvents(messages);
}

/** Fold the conversation's Agent / subagent / child tool-call events into the current Subagent list (F-012). */
export function deriveSubagents(conversation: Conversation): Subagent[] {
  return reduceSubagents(conversationToSubagentEvents(Array.from(conversation.messages?.values() ?? [])));
}

/** Structural equality for two derived Task lists (so a slice only emits when the list truly changes). */
export function tasksEqual(a: Task[], b: Task[]): boolean {
  if (a === b) return true;

  if (a.length !== b.length) return false;

  return a.every((task, i) => {
    const other = b[i];

    return (
      task.id === other.id &&
      task.status === other.status &&
      task.subject === other.subject &&
      task.activeForm === other.activeForm &&
      task.description === other.description
    );
  });
}

function toolsEqual(a: SubagentToolCall[], b: SubagentToolCall[]): boolean {
  if (a.length !== b.length) return false;

  return a.every((tool, i) => {
    const other = b[i];

    return (
      tool.toolName === other.toolName &&
      tool.toolsetName === other.toolsetName &&
      tool.status === other.status &&
      tool.reason === other.reason &&
      // By reference: `Conversation` keeps an untouched message's objects across updates, so an unrelated
      // delta re-derives the very same result and does not count as a change.
      tool.result === other.result &&
      tool.sidecar === other.sidecar
    );
  });
}

/** Structural equality for two derived Subagent lists (including each subagent's child tool list). */
export function subagentsEqual(a: Subagent[], b: Subagent[]): boolean {
  if (a === b) return true;

  if (a.length !== b.length) return false;

  return a.every((subagent, i) => {
    const other = b[i];

    return (
      subagent.parentToolUseId === other.parentToolUseId &&
      subagent.status === other.status &&
      subagent.subagentType === other.subagentType &&
      subagent.description === other.description &&
      subagent.summary === other.summary &&
      toolsEqual(subagent.tools, other.tools)
    );
  });
}

export interface DerivedStores {
  /** Emits the current Task list; only when it changes (not on every conversation delta). */
  tasks$: Observable<Task[]>;
  /** Emits the current Subagent list; only when it changes. */
  subagents$: Observable<Subagent[]>;
  /** The current Task list snapshot (immutable). */
  getTasks: () => Task[];
  /** The current Subagent list snapshot (immutable). */
  getSubagents: () => Subagent[];
  /** Tear down the internal subscriptions. */
  teardown: () => void;
}

/**
 * Build the per-slice derived stores from a `conversation$` source. Each slice is a `BehaviorSubject`
 * (replays the current snapshot to late subscribers) fed through `distinctUntilChanged`, so it emits
 * only when that slice structurally changes — unrelated high-frequency deltas are suppressed.
 */
export function createDerivedStores(conversation$: Observable<Conversation>): DerivedStores {
  const tasks$ = new BehaviorSubject<Task[]>([]);
  const subagents$ = new BehaviorSubject<Subagent[]>([]);
  const subscription = new Subscription();

  subscription.add(conversation$.pipe(map(deriveTasks), distinctUntilChanged(tasksEqual)).subscribe(tasks$));
  subscription.add(
    conversation$.pipe(map(deriveSubagents), distinctUntilChanged(subagentsEqual)).subscribe(subagents$),
  );

  return {
    tasks$: tasks$.asObservable(),
    subagents$: subagents$.asObservable(),
    getTasks: () => tasks$.value,
    getSubagents: () => subagents$.value,
    teardown: () => subscription.unsubscribe(),
  };
}
