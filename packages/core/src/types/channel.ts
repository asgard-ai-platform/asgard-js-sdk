import { Observer } from 'rxjs';
import { EventType } from '../constants/enum';
import Conversation from '../lib/conversation';
import { IAsgardServiceClient } from './client';
import { ErrorMessage, Message } from './sse-response';

export type ObserverOrNext<T> = Partial<Observer<T>> | ((value: T) => void);

export interface ChannelStates {
  isConnecting: boolean;
  conversation: Conversation;
}

export interface ChannelConfig {
  client: IAsgardServiceClient;
  customChannelId: string;
  customMessageId?: string;
  conversation: Conversation;
  statesObserver?: ObserverOrNext<ChannelStates>;
}

export type ConversationUserMessage = {
  type: 'user';
  messageId: string;
  text: string;
  blobIds?: string[];
  filePreviewUrls?: string[];
  documentNames?: string[];
  time: Date;
  traceId?: string;
};

export type ConversationBotMessage = {
  type: 'bot';
  messageId: string;
  eventType: EventType;
  isTyping: boolean;
  typingText: string | null;
  message: Message;
  time: Date;
  traceId?: string;
  raw: string;
};

export type ConversationErrorMessage = {
  type: 'error';
  messageId: string;
  eventType: EventType;
  error: ErrorMessage;
  time: Date;
  traceId?: string;
};

export type ConversationToolCallMessage = {
  type: 'tool-call';
  messageId: string; // `${processId}-${callSeq}`
  eventType: EventType.TOOL_CALL_START | EventType.TOOL_CALL_COMPLETE;
  processId: string;
  callSeq: number;
  toolName: string;
  toolsetName: string;
  parameter: Record<string, unknown>;
  result?: Record<string, unknown>;
  isComplete: boolean;
  time: Date;
  traceId?: string;
};

export type ConversationMessage =
  | ConversationUserMessage
  | ConversationBotMessage
  | ConversationErrorMessage
  | ConversationToolCallMessage;
