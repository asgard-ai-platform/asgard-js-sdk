export enum FetchSseAction {
  RESET_CHANNEL = 'RESET_CHANNEL',
  NONE = 'NONE',
  RESPONSE_TOOL_CALL_CONSENT = 'RESPONSE_TOOL_CALL_CONSENT',
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
  // The user's own turn, replayed on a transcript rejoin so a client can render the user side of the
  // history (F-014). `persist-only` — never echoed on the live POST path; only GET replay carries it.
  // Confirmed against asgard-core@dev-1.16.19 `internal/constants.go`.
  MESSAGE_USER = 'asgard.message.user',
  MESSAGE_THINKING_START = 'asgard.message.thinking.start',
  MESSAGE_THINKING_DELTA = 'asgard.message.thinking.delta',
  MESSAGE_THINKING_COMPLETE = 'asgard.message.thinking.complete',
  TOOL_CALL = 'asgard.tool_call',
  TOOL_CALL_START = 'asgard.tool_call.start',
  TOOL_CALL_COMPLETE = 'asgard.tool_call.complete',
  TOOL_CALL_CONSENT = 'asgard.tool_call.consent',
  // Subagent lifecycle (F-012). A spawned subagent emits `subagent.start` → `subagent.complete`
  // around its own child tool calls; status is driven by `.complete`, never by the spawning
  // `Agent` tool call's `tool_call.complete` (which returns `async_launched` early). Event names
  // confirmed against asgard-core@dev-1.16.19 `internal/constants.go` (EXT-003 closed).
  SUBAGENT_START = 'asgard.subagent.start',
  SUBAGENT_COMPLETE = 'asgard.subagent.complete',
  // The agent updated the channel's human-readable title (F-016 consumes it; added here for enum
  // parity per F-014). Ephemeral — not persisted, so a rejoin seeds the title from channel metadata
  // instead. Confirmed against asgard-core@dev-1.16.19.
  CHANNEL_TITLE_UPDATE = 'asgard.channel.title.update',
  // Sandbox lifecycle (sandbox Files/Browser foundation): the run's sandbox is provisioning
  // (`launch`) / ready to serve fs + browser APIs (`ready`); both carry `sandboxName`. Ephemeral —
  // not persisted, so a cold rejoin lacks the name until the next sandbox event (no metadata seed
  // exists yet). Confirmed against asgard-core@dev-1.16.19 (`internal/constants.go`).
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
}
