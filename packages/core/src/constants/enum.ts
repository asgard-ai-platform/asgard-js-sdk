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
  // inferred from prototype@f73545c pending `asgard-sdk-go/pkg/models/sse_event.go` (EXT-003).
  SUBAGENT_START = 'asgard.subagent.start',
  SUBAGENT_COMPLETE = 'asgard.subagent.complete',
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
