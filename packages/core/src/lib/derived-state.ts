// Derived-state reducers (F-013). The single source of truth for the Task List (F-010) and
// Subagent List (F-012) accumulation, folded from the same `ConversationMessage` stream that flows
// into `Channel`. Framework-agnostic and pure — `@asgard-js/react` and any other consumer reduce
// through here, and `Channel` exposes the results as reactive stores.
import type { ConversationMessage, ConversationToolCallMessage } from '../types/channel';
import type { SubagentStatus } from '../types/sse-response';

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

// ---- Task List (F-010) ----

export interface Task {
  /** Backend-assigned authoritative id (TaskCreate). */
  id: string;
  subject: string;
  activeForm?: string;
  description?: string;
  /** pending | in_progress | completed | (unknown status kept as-is, rendered neutrally). */
  status: string;
}

const TASK_TOOLS = new Set(['TaskCreate', 'TaskUpdate']);

// TaskCreate/TaskUpdate are native tool calls (`toolsetName === ''`) but semantically increment a
// single task list — routed out of the tool-call group and folded here (F-010).
export function isTaskTool(message: ConversationMessage): boolean {
  return message.type === 'tool-call' && message.toolsetName === '' && TASK_TOOLS.has(message.toolName);
}

// BACKEND CONTRACT (F-010 / EXT-002, confirmed against asgard-core@dev-1.16.19): the authoritative
// Task id + status live on the tool-result sidecar — TaskCreate → `sidecar.task.{id,subject}`,
// TaskUpdate → `sidecar.taskId` + `sidecar.statusChange.to`. `reduceTasks` reads the sidecar first and
// falls back to `parameter` (the tool input) for older frames / fields the sidecar omits
// (`activeForm` / `description`). Pure + replay-safe (fold over arrival order).
export function reduceTasks(messages: ConversationMessage[]): Task[] {
  const byId = new Map<string, Task>();
  const order: string[] = [];

  for (const message of messages) {
    if (!isTaskTool(message)) continue;

    const call = message as ConversationToolCallMessage;
    if (!call.isComplete) continue; // fold the `.complete` events

    const p = call.parameter ?? {};
    const sc = call.toolUseResultSidecar;
    // Sidecar id is authoritative (TaskCreate → task.id, TaskUpdate → taskId); parameter is the fallback.
    const id = sc?.task?.id ?? sc?.taskId ?? str(p.id) ?? str(p.taskId) ?? call.messageId;

    if (!byId.has(id)) order.push(id);

    if (call.toolName === 'TaskCreate') {
      byId.set(id, {
        id,
        subject: sc?.task?.subject ?? str(p.subject) ?? str(p.content) ?? '',
        activeForm: str(p.activeForm),
        description: str(p.description),
        status: sc?.statusChange?.to ?? str(p.status) ?? 'pending',
      });
    } else {
      const existing = byId.get(id);
      byId.set(id, {
        id,
        subject: sc?.task?.subject ?? existing?.subject ?? str(p.subject) ?? '',
        activeForm: str(p.activeForm) ?? existing?.activeForm,
        description: str(p.description) ?? existing?.description,
        // `sidecar.statusChange.to` is authoritative for the transition; parameter/existing are fallbacks.
        status: sc?.statusChange?.to ?? str(p.status) ?? existing?.status ?? 'pending',
      });
    }
  }

  return order.map(id => byId.get(id)).filter((task): task is Task => Boolean(task));
}

// ---- Subagent List (F-012) ----

export interface SubagentToolCall {
  toolsetName: string;
  toolName: string;
  parameter: Record<string, unknown>;
  reason?: string;
  status: 'running' | 'completed' | 'error';
}

export interface Subagent {
  /** Association key = the spawning `Agent` tool call's `toolUseId` (all child events carry it). */
  parentToolUseId: string;
  agentId?: string;
  subagentType?: string;
  description?: string;
  /** Driven by `subagent.complete` (replay-safe); never by the `Agent` tool_call.complete. */
  status: SubagentStatus;
  summary?: string;
  tools: SubagentToolCall[];
}

// The `Agent` tool call = spawn marker (native builtin `toolsetName === '' && toolName === 'Agent'`).
export function isAgentTool(message: ConversationMessage): boolean {
  return message.type === 'tool-call' && message.toolsetName === '' && message.toolName === 'Agent';
}

// A tool call that belongs to a subagent (child): `parentToolUseId` is non-empty.
export function isSubagentChildTool(message: ConversationMessage): boolean {
  return message.type === 'tool-call' && !!message.parentToolUseId;
}

// Everything the subagent list owns — routed out of the message thread and the main tool-call group.
export function isSubagentRelated(message: ConversationMessage): boolean {
  return message.type === 'subagent' || isAgentTool(message) || isSubagentChildTool(message);
}

interface SubagentMeta {
  agentId?: string;
  subagentType?: string;
  description?: string;
  status: SubagentStatus;
  summary?: string;
}

// Unified status (F-007/F-009), same rule as the main tool-call group: running → completed / error.
function toolStatus(call: ConversationToolCallMessage): SubagentToolCall['status'] {
  if (!call.isComplete) return 'running';

  return call.isError ?? Boolean(call.result?.error) ? 'error' : 'completed';
}

// Fold the conversation into the current subagent list, keyed by `parentToolUseId` in first-seen
// order. Pure + replay-safe: subagent status comes straight off the (core-computed) `subagent`
// message; the `Agent` tool call only seeds the entry and its description.
export function reduceSubagents(messages: ConversationMessage[]): Subagent[] {
  const order: string[] = [];
  const meta = new Map<string, SubagentMeta>();
  const tools = new Map<string, Map<string, SubagentToolCall>>();

  const ensure = (id: string): SubagentMeta => {
    if (!meta.has(id)) {
      order.push(id);
      meta.set(id, { status: 'running' });
      tools.set(id, new Map());
    }

    return meta.get(id) as SubagentMeta;
  };

  for (const message of messages) {
    if (message.type === 'subagent') {
      const m = ensure(message.parentToolUseId);
      m.agentId = message.agentId ?? m.agentId;
      m.subagentType = message.subagentType ?? m.subagentType;
      m.description = message.description ?? m.description;
      m.status = message.status; // core-authoritative (replay-safe)
      m.summary = message.summary ?? m.summary;
      continue;
    }

    if (message.type !== 'tool-call') continue;

    if (isAgentTool(message)) {
      if (!message.toolUseId) continue;

      const m = ensure(message.toolUseId);
      const description = str(message.parameter?.description);
      if (description && !m.description) m.description = description;

      continue;
    }

    if (isSubagentChildTool(message) && message.parentToolUseId) {
      ensure(message.parentToolUseId);
      const toolMap = tools.get(message.parentToolUseId) as Map<string, SubagentToolCall>;
      toolMap.set(message.toolUseId ?? message.messageId, {
        toolsetName: message.toolsetName,
        toolName: message.toolName,
        parameter: message.parameter,
        reason: message.reason,
        status: toolStatus(message),
      });
    }
  }

  return order.map(id => ({
    parentToolUseId: id,
    ...(meta.get(id) as SubagentMeta),
    tools: Array.from((tools.get(id) as Map<string, SubagentToolCall>).values()),
  }));
}

// ---- Structural equality (F-013 store `distinctUntilChanged`) ----

// Minimal structural deep-equal for the derived slices, so `tasks$` / `subagents$` re-emit only
// when their content actually changes (a high-frequency `message.delta` that leaves the slice
// unchanged must not push a new value). Handles primitives, arrays, and plain objects.
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;

  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr !== bArr) return false;

  if (aArr && bArr) {
    if (a.length !== b.length) return false;

    return a.every((v, i) => deepEqual(v, b[i]));
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every(k => Object.prototype.hasOwnProperty.call(bObj, k) && deepEqual(aObj[k], bObj[k]));
}
