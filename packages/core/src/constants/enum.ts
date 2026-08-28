export enum FetchSseAction {
  /**
   * @deprecated The SDK no longer sends this (F-032). It bundles "delete the channel" and "post the
   * first message" into one request, and blobs belong to the channel that was live when they were
   * uploaded — so the delete strips them and the accompanying `blobIds` resolve to nothing, silently.
   * The backend now answers `400` to `RESET_CHANNEL` carrying a non-empty `blobIds`.
   *
   * To clear a conversation and start over on the same id, call `client.deleteChannel(customChannelId)`
   * and then open with `action: NONE` — `Channel.reset()` does exactly that. Retained (and still
   * accepted by the backend) so existing type references keep compiling.
   */
  RESET_CHANNEL = 'RESET_CHANNEL',
  NONE = 'NONE',
  RESPONSE_TOOL_CALL_CONSENT = 'RESPONSE_TOOL_CALL_CONSENT',
  NUDGE = 'NUDGE',
}

export enum EventType {
  INIT = 'asgard.run.init',
  PROCESS = 'asgard.process',
  PROCESS_START = 'asgard.process.start',
  PROCESS_COMPLETE = 'asgard.process.complete',
  MESSAGE = 'asgard.message',
  MESSAGE_START = 'asgard.message.start',
  MESSAGE_DELTA = 'asgard.message.delta',
  MESSAGE_COMPLETE = 'asgard.message.complete',
  // Persist-only user turn — never on the live plane; only replayed on GET rejoin (F-014).
  MESSAGE_USER = 'asgard.message.user',
  // Extended-thinking (reasoning) stream — same shape as a normal message, rendered as a
  // separate collapsible thinking block (F-001). Independent of and usually earlier than the answer.
  MESSAGE_THINKING_START = 'asgard.message.thinking.start',
  MESSAGE_THINKING_DELTA = 'asgard.message.thinking.delta',
  MESSAGE_THINKING_COMPLETE = 'asgard.message.thinking.complete',

  // Canvas stream (F-030). `start` opens the block, each `delta` carries the markup that became
  // available (in the message's `text`, appended exactly like a text delta), and `complete` carries the
  // whole fragment as a CANVAS template — authoritative and self-sufficient, since a rejoin replays
  // only the complete. A `complete` with no template means the canvas could not be rendered.
  MESSAGE_CANVAS_START = 'asgard.message.canvas.start',
  MESSAGE_CANVAS_DELTA = 'asgard.message.canvas.delta',
  MESSAGE_CANVAS_COMPLETE = 'asgard.message.canvas.complete',
  TOOL_CALL = 'asgard.tool_call',
  TOOL_CALL_START = 'asgard.tool_call.start',
  TOOL_CALL_COMPLETE = 'asgard.tool_call.complete',
  TOOL_CALL_CONSENT = 'asgard.tool_call.consent',
  // Subagent lifecycle — a subagent spawned by an `Agent` tool-call. Its status is driven only by
  // these events, never the `Agent` tool_call.complete (async → completes early). Accumulated into
  // the Subagent list (F-012), keyed by `parentToolUseId` = the `Agent` tool-call's `toolUseId`.
  SUBAGENT_START = 'asgard.subagent.start',
  SUBAGENT_COMPLETE = 'asgard.subagent.complete',
  // Channel title push — reserved for F-016 to consume; enum aligned with asgard-core here (F-014).
  CHANNEL_TITLE_UPDATE = 'asgard.channel.title.update',
  // Next-turn prediction: at most one per run, pushed after the reply and before the run's terminal
  // event (F-028). Live-only — never persisted, so a rejoin replay does not carry it. "No suggestion"
  // is the normal case: most turns get none, and nothing may block waiting for one.
  PROMPT_SUGGESTION = 'asgard.prompt_suggestion',
  // Sandbox cold-start lifecycle (F-018) — `launch` = the backend is provisioning a compute sandbox,
  // `ready` = it is up. Drives the sandbox-phase store consumed by the Launch HUD; independent of the
  // run seam / RunningIndicator. Fact shape aligns with asgard-sdk-go `{ sandboxName, blueprintName }`.
  SANDBOX_LAUNCH = 'asgard.sandbox.launch',
  SANDBOX_READY = 'asgard.sandbox.ready',
  DONE = 'asgard.run.done',
  ERROR = 'asgard.run.error',
}

export enum ToolCallConsentResult {
  ALLOW_ONCE = 'ALLOW_ONCE',
  ALLOW_ALWAYS = 'ALLOW_ALWAYS',
  DENY_ONCE = 'DENY_ONCE',
}

export enum MessageTemplateType {
  TEXT = 'TEXT',
  HINT = 'HINT',
  BUTTON = 'BUTTON',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  LOCATION = 'LOCATION',
  CAROUSEL = 'CAROUSEL',
  CHART = 'CHART',
  TABLE = 'TABLE',
  ATTACHMENT = 'ATTACHMENT',
  QUESTION = 'QUESTION',
  CANVAS = 'CANVAS',
}
