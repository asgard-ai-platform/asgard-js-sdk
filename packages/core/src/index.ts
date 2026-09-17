export type { Subscription } from 'rxjs';

export type * from './types';
export { HttpError, isHttpError } from './types/http-error';
export { ChannelBusyError, isChannelBusyError } from './types/channel-busy-error';
export { ChannelAwaitingConsentError, isChannelAwaitingConsentError } from './types/channel-awaiting-consent-error';

export * from './constants/enum';

export { default as AsgardServiceClient } from './lib/client';

export {
  default as AsgardSourceSetClient,
  SOURCE_SET_DEFAULT_MAX_ENTRIES,
  SOURCE_SET_MAX_PAGE_SIZE,
} from './lib/source-set-client';
export { assertVolumePath, SOURCE_SET_VOLUME_ROOT } from './lib/source-set-path';

export { default as Channel } from './lib/channel';

export { default as Conversation } from './lib/conversation';

export { isTaskTool, reduceTaskEvents } from './lib/task-reducer';
export type { TaskToolEvent } from './lib/task-reducer';

export { isAgentTool, isSubagentChildTool, reduceSubagents } from './lib/subagent-reducer';
export type { SubagentEvent } from './lib/subagent-reducer';

export { reconcileLaunched } from './lib/launched-sandboxes';

export {
  composeFeedbackMessage,
  feedbackCommentByteLength,
  FEEDBACK_COMMENT_MAX_BYTES,
  RESPONSE_FEEDBACK_PREFIX,
} from './lib/feedback-message';

export { resolveSandboxUri } from './lib/resolve-sandbox-uri';
export type { SandboxUriIntent } from './lib/resolve-sandbox-uri';

// F-035 — sandbox browser protocol layer. Keysym conversion and the Neko transport are public because the
// panel in @asgard-js/react is only one consumer: a host rendering its own surface uses the same pieces.
export {
  charToKeysym,
  isPrintableKeysym,
  keyToKeysym,
  KEYSYM,
  mapModifierKeysym,
  normalizeWheel,
  WHEEL_MAX,
  WHEEL_THROTTLE_MS,
  XK,
} from './lib/keysym';
export type { WheelDelta } from './lib/keysym';

export { createSandboxBrowserTransport, decodeCursorFrame } from './lib/sandbox-browser-transport';
export type { SandboxBrowserCredentialSource, SandboxBrowserTransportOptions } from './lib/sandbox-browser-transport';

export {
  conversationToSubagentEvents,
  createDerivedStores,
  deriveSubagents,
  deriveTasks,
  subagentsEqual,
  tasksEqual,
} from './lib/derived-stores';
export type { DerivedStores } from './lib/derived-stores';
