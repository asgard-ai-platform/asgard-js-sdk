import { v4 as uuidv4 } from 'uuid';
import { EventType } from '../constants/enum';
import { ConversationMessage, ConversationToolCallMessage, SseResponse, ToolCallConsentEventData } from '../types';

interface IConversation {
  messages: Map<string, ConversationMessage> | null;
  pendingConsent?: ToolCallConsentEventData | null;
}

// A bot message that has already reached its terminal (complete) state. Once
// terminal, late/replayed `start`/`delta` frames (F-002 resume, out-of-order)
// must not roll it back to typing.
function isTerminalBotMessage(message: ConversationMessage | undefined): boolean {
  return message?.type === 'bot' && message.eventType === EventType.MESSAGE_COMPLETE;
}

// Same terminal anti-rollback contract as isTerminalBotMessage, for the thinking family
// (F-001). Once thinking.complete has landed, late/replayed start/delta must be ignored.
function isTerminalThinkingMessage(message: ConversationMessage | undefined): boolean {
  return message?.type === 'thinking' && message.eventType === EventType.MESSAGE_THINKING_COMPLETE;
}

export default class Conversation implements IConversation {
  public messages: Map<string, ConversationMessage> | null = null;
  public pendingConsent: ToolCallConsentEventData | null = null;

  constructor({ messages, pendingConsent = null }: IConversation) {
    this.messages = messages;
    this.pendingConsent = pendingConsent ?? null;
  }

  pushMessage(message: ConversationMessage): Conversation {
    const messages = new Map(this.messages);
    messages.set(message.messageId, message);

    return new Conversation({ messages, pendingConsent: this.pendingConsent });
  }

  clearPendingConsent(): Conversation {
    if (!this.pendingConsent) return this;

    return new Conversation({ messages: this.messages, pendingConsent: null });
  }

  onMessage(response: SseResponse<EventType>): Conversation {
    switch (response.eventType) {
      case EventType.MESSAGE_START:
        return this.onMessageStart(response as SseResponse<EventType.MESSAGE_START>);
      case EventType.MESSAGE_DELTA:
        return this.onMessageDelta(response as SseResponse<EventType.MESSAGE_DELTA>);
      case EventType.MESSAGE_COMPLETE:
        return this.onMessageComplete(response as SseResponse<EventType.MESSAGE_COMPLETE>);
      case EventType.MESSAGE_THINKING_START:
        return this.onMessageThinkingStart(response as SseResponse<EventType.MESSAGE_THINKING_START>);
      case EventType.MESSAGE_THINKING_DELTA:
        return this.onMessageThinkingDelta(response as SseResponse<EventType.MESSAGE_THINKING_DELTA>);
      case EventType.MESSAGE_THINKING_COMPLETE:
        return this.onMessageThinkingComplete(response as SseResponse<EventType.MESSAGE_THINKING_COMPLETE>);
      case EventType.TOOL_CALL_START:
        return this.onToolCallStart(response as SseResponse<EventType.TOOL_CALL_START>);
      case EventType.TOOL_CALL_COMPLETE:
        return this.onToolCallComplete(response as SseResponse<EventType.TOOL_CALL_COMPLETE>);
      case EventType.TOOL_CALL_CONSENT:
        return this.onToolCallConsent(response as SseResponse<EventType.TOOL_CALL_CONSENT>);
      case EventType.ERROR:
        return this.onMessageError(response as SseResponse<EventType.ERROR>);
      default:
        return this;
    }
  }

  onMessageStart(response: SseResponse<EventType.MESSAGE_START>): Conversation {
    const message = response.fact.messageStart.message;
    const messages = new Map(this.messages);

    // Terminal anti-rollback guard: ignore a late `start` for an already-complete message.
    if (isTerminalBotMessage(messages.get(message.messageId))) return this;

    messages.set(message.messageId, {
      type: 'bot',
      eventType: EventType.MESSAGE_START,
      isTyping: true,
      typingText: '',
      messageId: message.messageId,
      message,
      time: new Date(),
      traceId: response.traceId,
      raw: '',
    });

    return new Conversation({ messages, pendingConsent: this.pendingConsent });
  }

  onMessageDelta(response: SseResponse<EventType.MESSAGE_DELTA>): Conversation {
    const message = response.fact.messageDelta.message;

    const messages = new Map(this.messages);

    const currentMessage = messages.get(message.messageId);

    // Terminal anti-rollback guard: ignore a late `delta` for an already-complete message
    // (also avoids the `null` typingText concatenation path).
    if (isTerminalBotMessage(currentMessage)) return this;

    // Don't clobber a non-bot entry that happens to share this id.
    if (currentMessage && currentMessage.type !== 'bot') return this;

    // Lazy-init when there is no prior bot entry (skipped `start` / mid-stream resume):
    // accumulate onto any existing typing text, or start fresh — never drop the delta.
    const typingText = `${currentMessage?.typingText ?? ''}${message.text}`;

    messages.set(message.messageId, {
      type: 'bot',
      eventType: EventType.MESSAGE_DELTA,
      isTyping: true,
      typingText,
      messageId: message.messageId,
      message,
      time: new Date(),
      traceId: response.traceId ?? currentMessage?.traceId,
      raw: currentMessage?.raw ?? '',
    });

    return new Conversation({ messages, pendingConsent: this.pendingConsent });
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
      raw: JSON.stringify(response),
    });

    return new Conversation({ messages, pendingConsent: this.pendingConsent });
  }

  onMessageThinkingStart(response: SseResponse<EventType.MESSAGE_THINKING_START>): Conversation {
    const message = response.fact.messageThinkingStart.message;
    const messages = new Map(this.messages);

    // Terminal anti-rollback guard (same F-011 contract as the message family).
    if (isTerminalThinkingMessage(messages.get(message.messageId))) return this;

    messages.set(message.messageId, {
      type: 'thinking',
      eventType: EventType.MESSAGE_THINKING_START,
      isStreaming: true,
      text: message.text,
      messageId: message.messageId,
      time: new Date(),
      traceId: response.traceId,
    });

    return new Conversation({ messages, pendingConsent: this.pendingConsent });
  }

  onMessageThinkingDelta(response: SseResponse<EventType.MESSAGE_THINKING_DELTA>): Conversation {
    const message = response.fact.messageThinkingDelta.message;
    const messages = new Map(this.messages);
    const currentMessage = messages.get(message.messageId);

    // Ignore a late `delta` once complete; don't clobber a non-thinking entry sharing this id.
    if (isTerminalThinkingMessage(currentMessage)) return this;

    if (currentMessage && currentMessage.type !== 'thinking') return this;

    // Lazy-init when no prior thinking entry (skipped `start` / mid-stream resume): accumulate, never drop.
    const text = `${currentMessage?.text ?? ''}${message.text}`;

    messages.set(message.messageId, {
      type: 'thinking',
      eventType: EventType.MESSAGE_THINKING_DELTA,
      isStreaming: true,
      text,
      messageId: message.messageId,
      time: currentMessage?.time ?? new Date(),
      traceId: response.traceId ?? currentMessage?.traceId,
    });

    return new Conversation({ messages, pendingConsent: this.pendingConsent });
  }

  onMessageThinkingComplete(response: SseResponse<EventType.MESSAGE_THINKING_COMPLETE>): Conversation {
    const message = response.fact.messageThinkingComplete.message;
    const messages = new Map(this.messages);
    const currentMessage = messages.get(message.messageId);
    const previousText = currentMessage?.type === 'thinking' ? currentMessage.text : '';

    // `complete` is self-sufficient: materialize the terminal thinking block from this frame
    // alone (prefer the frame's full text, fall back to what was accumulated).
    messages.set(message.messageId, {
      type: 'thinking',
      eventType: EventType.MESSAGE_THINKING_COMPLETE,
      isStreaming: false,
      text: message.text || previousText,
      messageId: message.messageId,
      time: currentMessage?.type === 'thinking' ? currentMessage.time : new Date(),
      traceId: response.traceId ?? (currentMessage?.type === 'thinking' ? currentMessage.traceId : undefined),
    });

    return new Conversation({ messages, pendingConsent: this.pendingConsent });
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

    return new Conversation({ messages, pendingConsent: this.pendingConsent });
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
      reason: toolCallStart.toolCall.reason,
      toolsetName: toolCallStart.toolCall.toolsetName,
      parameter: toolCallStart.toolCall.parameter,
      isComplete: false,
      time: new Date(),
      traceId: response.traceId,
    };

    messages.set(toolCallKey, toolCallMessage);

    return new Conversation({ messages, pendingConsent: this.pendingConsent });
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
        isError: toolCallComplete.isError,
        traceId: response.traceId ?? existingMessage.traceId,
      };
      messages.set(toolCallKey, updatedMessage);
    }

    return new Conversation({ messages, pendingConsent: this.pendingConsent });
  }

  onToolCallConsent(response: SseResponse<EventType.TOOL_CALL_CONSENT>): Conversation {
    const consent = response.fact.toolCallConsent;

    return new Conversation({ messages: this.messages, pendingConsent: consent });
  }
}
