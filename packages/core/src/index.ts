export type { Subscription } from 'rxjs';

export type * from './types';
export { HttpError, isHttpError } from './types/http-error';

export * from './constants/enum';

export { default as AsgardServiceClient } from './lib/client';

export { default as Channel } from './lib/channel';

export { default as Conversation } from './lib/conversation';

// Derived-state reducers + predicates + types (F-013): Task List (F-010) and Subagent List (F-012)
// accumulation, exposed for framework-agnostic consumption.
export {
  reduceTasks,
  reduceSubagents,
  isTaskTool,
  isAgentTool,
  isSubagentChildTool,
  isSubagentRelated,
  deepEqual,
} from './lib/derived-state';
export type { Task, Subagent, SubagentToolCall } from './lib/derived-state';
