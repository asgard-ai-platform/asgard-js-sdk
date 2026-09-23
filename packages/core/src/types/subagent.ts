// Subagent list types (F-012). A subagent is spawned by an `Agent` tool-call; its lifecycle is driven
// by `asgard.subagent.{start,complete}` and it runs its own child tool-calls (all carrying the same
// `parentToolUseId`). Accumulated by `reduceSubagents` (see `lib/subagent-reducer.ts`). Run-level live
// state, not a message block. Framework-agnostic — no React / DOM.

/**
 * Subagent status. Terminal states come only from `subagent.complete.status`; while no complete has
 * arrived the subagent is `running` (never inferred from the async `Agent` tool-call completion).
 */
export type SubagentStatus = 'running' | 'completed' | 'failed' | 'cancelled';

/** The terminal subset carried by `subagent.complete.status` (never `running`). */
export type SubagentTerminalStatus = Exclude<SubagentStatus, 'running'>;

/** The status of one child tool-call inside a subagent (mirrors the tool-call unified status). */
export type SubagentToolStatus = 'running' | 'completed' | 'error';

/** One child tool-call a subagent has invoked (its own tool-calls, routed out of the main group). */
export interface SubagentToolCall {
  toolsetName: string;
  toolName: string;
  parameter: Record<string, unknown>;
  reason?: string;
  status: SubagentToolStatus;
  /**
   * The call's `toolCallResult`, handed over as the frame carried it — never truncated or masked (redaction
   * is the presenter's job). Absent while the call is `running`; `{}` when it completed with an empty result.
   */
  result?: Record<string, unknown>;
  /** The call's structured `toolUseResultSidecar`, when the frame carries one (see `ConversationToolCallMessage.sidecar`). */
  sidecar?: Record<string, unknown>;
}

/**
 * One subagent, folded from the `Agent` tool-call + `subagent.*` + child tool-call stream.
 * Not a message block — presented by the docked `<SubagentList>` panel (run-level chrome).
 */
export interface Subagent {
  /** Correlation key = the spawning `Agent` tool-call's `toolUseId` (every child event carries it). */
  parentToolUseId: string;
  /** The subagent's own id (from `subagent.start`; display detail). */
  agentId?: string;
  /** e.g. `general-purpose` (from `subagent.start` / `.complete`). */
  subagentType?: string;
  /** Task description (from `subagent.start.description` or the `Agent` tool-call's `parameter.description`). */
  description?: string;
  status: SubagentStatus;
  /** `subagent.complete.summary` (final report; not rendered this cycle). */
  summary?: string;
  /** The child tool-calls this subagent has run / is running. */
  tools: SubagentToolCall[];
}
