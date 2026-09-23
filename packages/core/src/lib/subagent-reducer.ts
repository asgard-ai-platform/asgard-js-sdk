// Subagent list accumulation (F-012) — the framework-agnostic data-layer SoT.
//
// An `Agent` tool-call spawns a subagent, but it is only the "launch" viewpoint and lacks the
// subagent's detail. So the react layer:
//   1. routes the `Agent` tool-call (isAgentTool) and every child tool-call (parentToolUseId !== "")
//      out of the main tool-call group;
//   2. folds the `Agent` tool-call + `subagent.{start,complete}` + child tool-calls into one current
//      subagent list with `reduceSubagents`, presented by `<SubagentList>`.
//
// Two correctness rules (verified against asgard-sdk-go + the new-example11 dump):
//   - A subagent's status is driven by `subagent.start` → `subagent.complete`, NOT the `Agent`
//     tool_call.complete — async subagents complete the `Agent` tool early (result.status =
//     "async_launched") while the subagent is still running.
//   - Correlation key = `parentToolUseId` (= the `Agent` tool-call's `toolUseId`).
//   - A subagent is not one-shot: the orchestrator can resume an existing one, so a terminal card that
//     produces new activity goes back to `running` (issue #382 — see `resume` below).
import { Subagent, SubagentStatus, SubagentToolCall } from '../types/subagent';

/** The spawning `Agent` tool-call (native builtin). `true` → route out of the tool-call group. */
export function isAgentTool(call: { toolsetName: string; toolName: string }): boolean {
  return call.toolsetName === '' && call.toolName === 'Agent';
}

/** Whether a tool-call belongs to a subagent (child). The main group keeps only `parentToolUseId === ""`. */
export function isSubagentChildTool(parentToolUseId?: string): boolean {
  return !!parentToolUseId;
}

/** The subagent-related SSE events, adapted from their facts by the react layer, in arrival order. */
export type SubagentEvent =
  | { kind: 'agentStart'; toolUseId: string; description?: string }
  | { kind: 'subagentStart'; parentToolUseId: string; agentId?: string; subagentType?: string; description?: string }
  | {
      kind: 'toolStart';
      parentToolUseId: string;
      toolUseId: string;
      toolsetName: string;
      toolName: string;
      parameter?: Record<string, unknown>;
      reason?: string;
    }
  | {
      kind: 'toolComplete';
      parentToolUseId: string;
      toolUseId: string;
      isError?: boolean;
      result?: Record<string, unknown>;
      sidecar?: Record<string, unknown>;
    }
  | { kind: 'subagentComplete'; parentToolUseId: string; status: SubagentStatus; summary?: string };

interface Meta {
  agentId?: string;
  subagentType?: string;
  description?: string;
  status: SubagentStatus;
  summary?: string;
}

/**
 * A subagent that produces new activity is working again, so a terminal card goes back to `running`
 * and drops the summary — that summary concluded the run that already finished (issue #382).
 */
function resume(m: Meta): void {
  if (m.status === 'running') return;

  m.status = 'running';
  m.summary = undefined;
}

/**
 * Fold the subagent event stream into the current list (in first-seen order). Pure and replay-safe:
 * a replay re-applies the same arrival order, so the trailing `subagentComplete` wins and the snapshot
 * is unchanged. (The guard would only be load-bearing if a replay could deliver a `start` — or a child
 * `toolStart` — *without* the `complete` that followed it, which is not how the folded stream is built.)
 */
export function reduceSubagents(events: SubagentEvent[]): Subagent[] {
  const order: string[] = [];
  const meta = new Map<string, Meta>();
  const tools = new Map<string, Map<string, SubagentToolCall>>(); // parentToolUseId -> (toolUseId -> tool)

  const ensure = (id: string): Meta => {
    if (!meta.has(id)) {
      order.push(id);
      meta.set(id, { status: 'running' });
      tools.set(id, new Map());
    }

    return meta.get(id) as Meta;
  };

  for (const event of events) {
    switch (event.kind) {
      case 'agentStart': {
        const m = ensure(event.toolUseId);

        if (event.description && !m.description) m.description = event.description;

        break;
      }

      case 'subagentStart': {
        const m = ensure(event.parentToolUseId);

        m.agentId = event.agentId ?? m.agentId;
        m.subagentType = event.subagentType ?? m.subagentType;
        m.description = event.description ?? m.description;
        resume(m); // shape A: the orchestrator re-started an existing subagent within the same turn

        break;
      }

      case 'toolStart': {
        // shape B (the common resume): a later-turn resume carries no lifecycle event at all, so a
        // child tool-call landing on a terminal card is the only signal that it is working again.
        resume(ensure(event.parentToolUseId));
        (tools.get(event.parentToolUseId) as Map<string, SubagentToolCall>).set(event.toolUseId, {
          toolsetName: event.toolsetName,
          toolName: event.toolName,
          parameter: event.parameter ?? {},
          reason: event.reason,
          status: 'running',
        });

        break;
      }

      case 'toolComplete': {
        const tool = tools.get(event.parentToolUseId)?.get(event.toolUseId);

        if (!tool) break;

        tool.status = event.isError ? 'error' : 'completed';

        // Hand over the frame's own objects: a consumer may compare them by reference (subagentsEqual does).
        if (event.result !== undefined) tool.result = event.result;

        if (event.sidecar !== undefined) tool.sidecar = event.sidecar;

        break;
      }

      case 'subagentComplete': {
        const m = ensure(event.parentToolUseId);

        m.status = event.status;
        m.summary = event.summary;

        break;
      }
    }
  }

  return order.map(id => ({
    parentToolUseId: id,
    ...(meta.get(id) as Meta),
    tools: Array.from((tools.get(id) as Map<string, SubagentToolCall>).values()),
  }));
}
