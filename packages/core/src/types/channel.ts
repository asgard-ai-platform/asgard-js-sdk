import { Observer } from 'rxjs';
import { EventType } from 'src/constants/enum';
import Conversation from 'src/lib/conversation';
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

export interface FileAttachment {
  name: string;
  size: number;
  type: string;
  url?: string; // Preview URL if available
  blobId?: string; // Backend blob ID
}

export type ConversationUserMessage = {
  type: 'user';
  messageId: string;
  text: string;
  time: Date;
  files?: FileAttachment[]; // File attachments support
};

export type ConversationBotMessage = {
  type: 'bot';
  messageId: string;
  eventType: EventType;
  isTyping: boolean;
  typingText: string | null;
  message: Message;
  time: Date;
};

export type ConversationErrorMessage = {
  type: 'error';
  messageId: string;
  eventType: EventType;
  error: ErrorMessage;
  time: Date;
};

export type ConversationMessage =
  | ConversationUserMessage
  | ConversationBotMessage
  | ConversationErrorMessage;
