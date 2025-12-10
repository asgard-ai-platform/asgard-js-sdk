import { v4 as uuidv4 } from 'uuid';
import { EventType } from '../constants/enum';
import { ConversationMessage, ConversationToolCallMessage, SseResponse } from '../types';

interface IConversation {
  messages: Map<string, ConversationMessage> | null;
}

export default class Conversation implements IConversation {
  public messages: Map<string, ConversationMessage> | null = null;

  constructor({ messages }: IConversation) {
    this.messages = messages;
  }

  pushMessage(message: ConversationMessage): Conversation {
    const messages = new Map(this.messages);
    messages.set(message.messageId, message);

    return new Conversation({ messages });
  }

  onMessage(response: SseResponse<EventType>): Conversation {
    switch (response.eventType) {
      case EventType.MESSAGE_START:
        return this.onMessageStart(response as SseResponse<EventType.MESSAGE_START>);
      case EventType.MESSAGE_DELTA:
        return this.onMessageDelta(response as SseResponse<EventType.MESSAGE_DELTA>);
      case EventType.MESSAGE_COMPLETE:
        return this.onMessageComplete(response as SseResponse<EventType.MESSAGE_COMPLETE>);
      case EventType.TOOL_CALL_START:
        return this.onToolCallStart(response as SseResponse<EventType.TOOL_CALL_START>);
      case EventType.TOOL_CALL_COMPLETE:
        return this.onToolCallComplete(response as SseResponse<EventType.TOOL_CALL_COMPLETE>);
      case EventType.ERROR:
        return this.onMessageError(response as SseResponse<EventType.ERROR>);
      default:
        return this;
    }
  }

  onMessageStart(response: SseResponse<EventType.MESSAGE_START>): Conversation {
    const message = response.fact.messageStart.message;
    const messages = new Map(this.messages);

    messages.set(message.messageId, {
      type: 'bot',
      eventType: EventType.MESSAGE_START,
      isTyping: true,
      typingText: '',
      messageId: message.messageId,
      message,
      time: new Date(),
      traceId: response.traceId,
    });

    return new Conversation({ messages });
  }

  onMessageDelta(response: SseResponse<EventType.MESSAGE_DELTA>): Conversation {
    const message = response.fact.messageDelta.message;

    const messages = new Map(this.messages);

    const currentMessage = messages.get(message.messageId);

    if (currentMessage?.type !== 'bot') return this;

    const typingText = `${currentMessage?.typingText ?? ''}${message.text}`;

    messages.set(message.messageId, {
      type: 'bot',
      eventType: EventType.MESSAGE_DELTA,
      isTyping: true,
      typingText,
      messageId: message.messageId,
      message,
      time: new Date(),
      traceId: response.traceId ?? currentMessage.traceId,
    });

    return new Conversation({ messages });
  }

  onMessageComplete(response: SseResponse<EventType.MESSAGE_COMPLETE>): Conversation {
    const message = response.fact.messageComplete.message;

    const messages = new Map(this.messages);

    const currentMessage = messages.get(message.messageId);

    messages.set(message.messageId, {
      type: 'bot',
      eventType: EventType.MESSAGE_COMPLETE,
      isTyping: false,
      typingText: null,
      messageId: message.messageId,
      message,
      time: new Date(),
      traceId: response.traceId ?? (currentMessage?.type === 'bot' ? currentMessage.traceId : undefined),
    });

    return new Conversation({ messages });
  }

  onMessageError(response: SseResponse<EventType.ERROR>): Conversation {
    const messageId = uuidv4();
    const error = response.fact.runError.error;

    const messages = new Map(this.messages);

    messages.set(messageId, {
      type: 'error',
      eventType: EventType.ERROR,
      messageId,
      error,
      time: new Date(),
      traceId: response.traceId,
    });

    return new Conversation({ messages });
  }

  onToolCallStart(response: SseResponse<EventType.TOOL_CALL_START>): Conversation {
    const toolCallStart = response.fact.toolCallStart;
    const messages = new Map(this.messages);
    const toolCallKey = `${toolCallStart.processId}-${toolCallStart.callSeq}`;

    const toolCallMessage: ConversationToolCallMessage = {
      type: 'tool-call',
      eventType: EventType.TOOL_CALL_START,
      messageId: toolCallKey,
      processId: toolCallStart.processId,
      callSeq: toolCallStart.callSeq,
      toolName: toolCallStart.toolCall.toolName,
      toolsetName: toolCallStart.toolCall.toolsetName,
      parameter: toolCallStart.toolCall.parameter,
      isComplete: false,
      time: new Date(),
      traceId: response.traceId,
    };

    messages.set(toolCallKey, toolCallMessage);

    return new Conversation({ messages });
  }

  onToolCallComplete(response: SseResponse<EventType.TOOL_CALL_COMPLETE>): Conversation {
    const toolCallComplete = response.fact.toolCallComplete;
    const messages = new Map(this.messages);
    const toolCallKey = `${toolCallComplete.processId}-${toolCallComplete.callSeq}`;

    const existingMessage = messages.get(toolCallKey);

    if (existingMessage?.type === 'tool-call') {
      const updatedMessage: ConversationToolCallMessage = {
        ...existingMessage,
        eventType: EventType.TOOL_CALL_COMPLETE,
        result: toolCallComplete.toolCallResult,
        isComplete: true,
        traceId: response.traceId ?? existingMessage.traceId,
      };
      messages.set(toolCallKey, updatedMessage);
    }

    return new Conversation({ messages });
  }
}
