import { v4 as uuidv4 } from 'uuid';
import { EventType, MessageTemplateType } from '../constants/enum';
import {
  ConversationBotMessage,
  ConversationCanvasMessage,
  ConversationMessage,
  ConversationSubagentMessage,
  ConversationThinkingMessage,
  ConversationToolCallMessage,
  ConversationUserMessage,
  MessageFeedbackState,
  SseResponse,
  ToolCallConsentEventData,
} from '../types';

interface IConversation {
  messages: Map<string, ConversationMessage> | null;
  pendingConsent?: ToolCallConsentEventData | null;
  /**
   * Feedback frames whose target reply has not arrived yet (F-033), keyed by `targetMessageId`. The
   * server writes a reply before anything can rate it, so in seq order the target always precedes its
   * feedback — this only catches an out-of-order delivery, the same class of defect F-011 hardens
   * against. Applied when the target's `message.complete` lands; never rendered on its own.
   */
  pendingFeedback?: Map<string, MessageFeedbackState> | null;
}

export default class Conversation implements IConversation {
  public messages: Map<string, ConversationMessage> | null = null;
  public pendingConsent: ToolCallConsentEventData | null = null;
  public pendingFeedback: Map<string, MessageFeedbackState> | null = null;

  constructor({ messages, pendingConsent = null, pendingFeedback = null }: IConversation) {
    this.messages = messages;
    this.pendingConsent = pendingConsent ?? null;
    this.pendingFeedback = pendingFeedback ?? null;
  }

  pushMessage(message: ConversationMessage): Conversation {
    const messages = new Map(this.messages);
    messages.set(message.messageId, message);

    return new Conversation({ messages, pendingConsent: this.pendingConsent, pendingFeedback: this.pendingFeedback });
  }

  clearPendingConsent(): Conversation {
    if (!this.pendingConsent) return this;

    return new Conversation({ messages: this.messages, pendingConsent: null, pendingFeedback: this.pendingFeedback });
  }

  /**
   * Put a consent prompt back (#410) — the mirror of {@link clearPendingConsent}, used to undo the
   * optimistic clear when the reply never reaches the server. Yields to a prompt that arrived in the
   * meantime: that one is newer than the batch being restored.
   */
  restorePendingConsent(pendingConsent: ToolCallConsentEventData): Conversation {
    if (this.pendingConsent) return this;

    return new Conversation({ messages: this.messages, pendingConsent, pendingFeedback: this.pendingFeedback });
  }

  /**
   * Converge everything the aborted run left mid-flight (F-020 AC10, F-023). A stopped run sends no
   * closing frame for whatever was in progress, so without this those messages advertise activity that
   * has ceased — and they persist in the transcript that way:
   *
   * - a tool-call with `isComplete === false` gets no `tool_call.complete`, and would render as
   *   `running` forever, so it converges to `cancelled`;
   * - a thinking block with `isThinking === true` gets no `message.thinking.complete`, and would keep
   *   its highlighted "Thinking…" state forever, so it converges to the settled state.
   *
   * Content is preserved either way — never rolled back. Already-settled messages and every other
   * message type are untouched, and the same instance is returned when nothing was in flight.
   */
  settleInFlightMessages(): Conversation {
    if (!this.messages) return this;

    let changed = false;
    const messages = new Map(this.messages);
    for (const [id, message] of messages) {
      if (message.type === 'tool-call' && !message.isComplete) {
        messages.set(id, { ...message, isComplete: true, isCancelled: true });
        changed = true;
      }

      // F-023 — found only by stopping a real run mid-thinking: the mock and the unit tests had always
      // interrupted after the thinking block had already completed, so this path went unexercised.
      if (message.type === 'thinking' && message.isThinking) {
        messages.set(id, { ...message, isThinking: false });
        changed = true;
      }
    }

    if (!changed) return this;

    return new Conversation({ messages, pendingConsent: this.pendingConsent, pendingFeedback: this.pendingFeedback });
  }

  /**
   * @deprecated Renamed to {@link settleInFlightMessages} in 0.3.27 — it settles in-flight thinking
   * blocks as well as tool-calls, which the old name no longer described. Behaviour is unchanged;
   * this alias will be removed in a future major version.
   */
  cancelInFlightToolCalls(): Conversation {
    return this.settleInFlightMessages();
  }

  onMessage(response: SseResponse<EventType>): Conversation {
    switch (response.eventType) {
      case EventType.MESSAGE_START:
        return this.onMessageStart(response as SseResponse<EventType.MESSAGE_START>);
      case EventType.MESSAGE_DELTA:
        return this.onMessageDelta(response as SseResponse<EventType.MESSAGE_DELTA>);
      case EventType.MESSAGE_COMPLETE:
        return this.onMessageComplete(response as SseResponse<EventType.MESSAGE_COMPLETE>);
      case EventType.MESSAGE_USER:
        return this.onMessageUser(response as SseResponse<EventType.MESSAGE_USER>);
      case EventType.MESSAGE_FEEDBACK:
        return this.onMessageFeedback(response as SseResponse<EventType.MESSAGE_FEEDBACK>);
      case EventType.MESSAGE_THINKING_START:
        return this.onThinkingStart(response as SseResponse<EventType.MESSAGE_THINKING_START>);
      case EventType.MESSAGE_THINKING_DELTA:
        return this.onThinkingDelta(response as SseResponse<EventType.MESSAGE_THINKING_DELTA>);
      case EventType.MESSAGE_THINKING_COMPLETE:
        return this.onThinkingComplete(response as SseResponse<EventType.MESSAGE_THINKING_COMPLETE>);
      case EventType.MESSAGE_CANVAS_START:
        return this.onCanvasStart(response as SseResponse<EventType.MESSAGE_CANVAS_START>);
      case EventType.MESSAGE_CANVAS_DELTA:
        return this.onCanvasDelta(response as SseResponse<EventType.MESSAGE_CANVAS_DELTA>);
      case EventType.MESSAGE_CANVAS_COMPLETE:
        return this.onCanvasComplete(response as SseResponse<EventType.MESSAGE_CANVAS_COMPLETE>);
      case EventType.TOOL_CALL_START:
        return this.onToolCallStart(response as SseResponse<EventType.TOOL_CALL_START>);
      case EventType.TOOL_CALL_COMPLETE:
        return this.onToolCallComplete(response as SseResponse<EventType.TOOL_CALL_COMPLETE>);
      case EventType.TOOL_CALL_CONSENT:
        return this.onToolCallConsent(response as SseResponse<EventType.TOOL_CALL_CONSENT>);
      case EventType.SUBAGENT_START:
        return this.onSubagentStart(response as SseResponse<EventType.SUBAGENT_START>);
      case EventType.SUBAGENT_COMPLETE:
        return this.onSubagentComplete(response as SseResponse<EventType.SUBAGENT_COMPLETE>);
      case EventType.ERROR:
        return this.onMessageError(response as SseResponse<EventType.ERROR>);
      default:
        return this;
    }
  }

  /**
   * A message is terminal once `complete` has materialized it (a bot message with `isTyping === false`).
   * Terminal messages must never regress to typing/streaming — late `start`/`delta` frames from replay
   * or out-of-order delivery are ignored (F-011 / UC-018).
   */
  private isTerminalBot(message: ConversationMessage | undefined): boolean {
    return message?.type === 'bot' && !message.isTyping;
  }

  /**
   * A thinking block is terminal once `thinking.complete` has settled it (`isThinking === false`).
   * Like the bot terminal guard (F-011), it must never regress to the streaming state — late
   * `thinking.start` / `thinking.delta` frames from replay or out-of-order delivery are ignored.
   */
  private isTerminalThinking(message: ConversationMessage | undefined): boolean {
    return message?.type === 'thinking' && !message.isThinking;
  }

  /**
   * A tool-call is terminal once it has completed (`isComplete === true`), whether that came from a
   * live `tool_call.complete` or from one materialized on GET rejoin. Same policy as the bot and
   * thinking guards (F-011): a late / out-of-order `tool_call.start` must not roll it back to
   * running, which would also drop the result and hide it from the Task list.
   */
  private isTerminalToolCall(message: ConversationMessage | undefined): boolean {
    return message?.type === 'tool-call' && message.isComplete === true;
  }

  /**
   * A canvas is terminal once `canvas.complete` has delivered the authoritative fragment
   * (`isDrawing === false`). Same policy as the bot / thinking guards (F-011): a late start or delta
   * must not swap that fragment back to whatever prefix happened to be in flight.
   */
  private isTerminalCanvas(message: ConversationMessage | undefined): boolean {
    return message?.type === 'canvas' && !message.isDrawing;
  }

  onMessageStart(response: SseResponse<EventType.MESSAGE_START>): Conversation {
    const message = response.fact.messageStart.message;

    // BUG-001: subagent frames carry a non-empty `parentToolUseId`; hide them from the main conversation.
    if (message.parentToolUseId) return this;

    // Terminal guard: a completed message stays put; a late `start` must not blank it into a typing bubble.
    if (this.isTerminalBot(this.messages?.get(message.messageId))) return this;

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
      raw: '',
    });

    return new Conversation({ messages, pendingConsent: this.pendingConsent, pendingFeedback: this.pendingFeedback });
  }

  onMessageDelta(response: SseResponse<EventType.MESSAGE_DELTA>): Conversation {
    const message = response.fact.messageDelta.message;

    // BUG-001: subagent frames carry a non-empty `parentToolUseId`; hide them from the main conversation.
    if (message.parentToolUseId) return this;

    const currentMessage = this.messages?.get(message.messageId);

    // Terminal guard: a late `delta` after `complete` must not flip the message back into typing (UC-018).
    if (this.isTerminalBot(currentMessage)) return this;

    // Lazy-init: a `delta` with no existing entry (delta-before-start / mid-stream join) creates the
    // typing message rather than silently dropping its text (UC-017).
    const currentBot = currentMessage?.type === 'bot' ? currentMessage : undefined;
    const messages = new Map(this.messages);

    messages.set(message.messageId, {
      type: 'bot',
      eventType: EventType.MESSAGE_DELTA,
      isTyping: true,
      typingText: `${currentBot?.typingText ?? ''}${message.text}`,
      messageId: message.messageId,
      message,
      time: new Date(),
      traceId: response.traceId ?? currentBot?.traceId,
      raw: currentBot?.raw ?? '',
    });

    return new Conversation({ messages, pendingConsent: this.pendingConsent, pendingFeedback: this.pendingFeedback });
  }

  onMessageComplete(response: SseResponse<EventType.MESSAGE_COMPLETE>): Conversation {
    const message = response.fact.messageComplete.message;

    // BUG-001: subagent frames carry a non-empty `parentToolUseId`; hide them from the main conversation.
    if (message.parentToolUseId) return this;

    const messages = new Map(this.messages);

    const currentMessage = messages.get(message.messageId);
    const currentBot = currentMessage?.type === 'bot' ? currentMessage : undefined;

    // F-033 — the rating is state *about* the reply, not part of the frame, so a late / duplicate
    // `complete` must not wipe it. A feedback frame that arrived before this reply (out of order) is
    // consumed here; it wins over whatever the reply carried, being the newer fact.
    const pendingFeedback = this.pendingFeedback?.get(message.messageId);
    const feedback = pendingFeedback ?? currentBot?.feedback;

    messages.set(message.messageId, {
      type: 'bot',
      eventType: EventType.MESSAGE_COMPLETE,
      isTyping: false,
      typingText: null,
      messageId: message.messageId,
      message,
      ...(feedback ? { feedback } : {}),
      time: new Date(),
      traceId: response.traceId ?? currentBot?.traceId,
      raw: JSON.stringify(response),
    });

    let remainingPending = this.pendingFeedback;
    if (pendingFeedback) {
      remainingPending = new Map(this.pendingFeedback);
      remainingPending.delete(message.messageId);
    }

    return new Conversation({ messages, pendingConsent: this.pendingConsent, pendingFeedback: remainingPending });
  }

  /**
   * `asgard.message.feedback` (F-033): fold a rating into the reply it targets. The server is
   * append-only and latest-wins, so a later frame for the same target simply replaces the earlier
   * state — on a replay the frames arrive in seq order and the last one standing is the current one.
   * Only a bot reply can carry a rating; a frame naming anything else (or a reply that has not arrived
   * yet) is parked in `pendingFeedback` and applied if that reply's `complete` shows up later.
   */
  onMessageFeedback(response: SseResponse<EventType.MESSAGE_FEEDBACK>): Conversation {
    const data = response.fact.messageFeedback;
    const feedback: MessageFeedbackState = {
      verdict: data.verdict,
      ...(data.text ? { comment: data.text } : {}),
    };

    return this.applyFeedback(data.targetMessageId, feedback);
  }

  /**
   * Set the current rating of one bot reply (F-033). Used by the reducer for server frames and by
   * `Channel.sendMessageFeedback` once this client's own POST has been accepted — the SDK has no open
   * stream between runs, so the live echo of its own feedback would never reach it. A target that is not
   * (yet) a bot reply is parked in `pendingFeedback`; see {@link onMessageComplete}.
   */
  applyFeedback(targetMessageId: string, feedback: MessageFeedbackState): Conversation {
    const target = this.messages?.get(targetMessageId);

    if (target?.type === 'bot') {
      const messages = new Map(this.messages);
      const rated: ConversationBotMessage = { ...target, feedback };
      messages.set(targetMessageId, rated);

      return new Conversation({ messages, pendingConsent: this.pendingConsent, pendingFeedback: this.pendingFeedback });
    }

    const pendingFeedback = new Map(this.pendingFeedback);
    pendingFeedback.set(targetMessageId, feedback);

    return new Conversation({ messages: this.messages, pendingConsent: this.pendingConsent, pendingFeedback });
  }

  onThinkingStart(response: SseResponse<EventType.MESSAGE_THINKING_START>): Conversation {
    const message = response.fact.messageThinkingStart.message;

    // BUG-001: subagent frames carry a non-empty `parentToolUseId`; hide them from the main conversation.
    if (message.parentToolUseId) return this;

    // Terminal guard: a completed thinking block stays put; a late `start` must not reopen it (F-011).
    if (this.isTerminalThinking(this.messages?.get(message.messageId))) return this;

    const messages = new Map(this.messages);
    const thinking: ConversationThinkingMessage = {
      type: 'thinking',
      messageId: message.messageId,
      text: message.text,
      isThinking: true,
      time: new Date(),
      traceId: response.traceId,
    };
    messages.set(message.messageId, thinking);

    return new Conversation({ messages, pendingConsent: this.pendingConsent, pendingFeedback: this.pendingFeedback });
  }

  onThinkingDelta(response: SseResponse<EventType.MESSAGE_THINKING_DELTA>): Conversation {
    const message = response.fact.messageThinkingDelta.message;

    // BUG-001: subagent frames carry a non-empty `parentToolUseId`; hide them from the main conversation.
    if (message.parentToolUseId) return this;

    const currentMessage = this.messages?.get(message.messageId);

    // Terminal guard: a late `delta` after `complete` must not flip the block back into streaming (F-011).
    if (this.isTerminalThinking(currentMessage)) return this;

    // Lazy-init: a `delta` with no existing block (delta-before-start / mid-stream join) creates the
    // streaming block rather than dropping its reasoning text (F-011 / UC-001).
    const currentThinking = currentMessage?.type === 'thinking' ? currentMessage : undefined;
    const messages = new Map(this.messages);
    const thinking: ConversationThinkingMessage = {
      type: 'thinking',
      messageId: message.messageId,
      text: `${currentThinking?.text ?? ''}${message.text}`,
      isThinking: true,
      time: currentThinking?.time ?? new Date(),
      traceId: response.traceId ?? currentThinking?.traceId,
    };
    messages.set(message.messageId, thinking);

    return new Conversation({ messages, pendingConsent: this.pendingConsent, pendingFeedback: this.pendingFeedback });
  }

  onThinkingComplete(response: SseResponse<EventType.MESSAGE_THINKING_COMPLETE>): Conversation {
    const message = response.fact.messageThinkingComplete.message;

    // BUG-001: subagent frames carry a non-empty `parentToolUseId`; hide them from the main conversation.
    if (message.parentToolUseId) return this;

    const currentMessage = this.messages?.get(message.messageId);
    const currentThinking = currentMessage?.type === 'thinking' ? currentMessage : undefined;

    const messages = new Map(this.messages);
    const thinking: ConversationThinkingMessage = {
      type: 'thinking',
      messageId: message.messageId,
      // Self-sufficient (F-011): the complete frame carries the full reasoning, so a complete-only
      // replay (no start/delta) still renders the whole text.
      text: message.text,
      isThinking: false,
      time: currentThinking?.time ?? new Date(),
      traceId: response.traceId ?? currentThinking?.traceId,
    };
    messages.set(message.messageId, thinking);

    return new Conversation({ messages, pendingConsent: this.pendingConsent, pendingFeedback: this.pendingFeedback });
  }

  onCanvasStart(response: SseResponse<EventType.MESSAGE_CANVAS_START>): Conversation {
    const message = response.fact.messageCanvasStart.message;

    // BUG-001: subagent frames carry a non-empty `parentToolUseId`; hide them from the main conversation.
    if (message.parentToolUseId) return this;

    // Terminal guard: a finished canvas stays put; a late `start` must not blank it (F-011).
    if (this.isTerminalCanvas(this.messages?.get(message.messageId))) return this;

    const messages = new Map(this.messages);
    const canvas: ConversationCanvasMessage = {
      type: 'canvas',
      messageId: message.messageId,
      html: '',
      isDrawing: true,
      time: new Date(),
      traceId: response.traceId,
    };
    messages.set(message.messageId, canvas);

    return new Conversation({ messages, pendingConsent: this.pendingConsent, pendingFeedback: this.pendingFeedback });
  }

  onCanvasDelta(response: SseResponse<EventType.MESSAGE_CANVAS_DELTA>): Conversation {
    const message = response.fact.messageCanvasDelta.message;

    // BUG-001: subagent frames carry a non-empty `parentToolUseId`; hide them from the main conversation.
    if (message.parentToolUseId) return this;

    const currentMessage = this.messages?.get(message.messageId);

    // Terminal guard: a late `delta` must not flip a finished canvas back into drawing (F-011).
    if (this.isTerminalCanvas(currentMessage)) return this;

    // Lazy-init: a `delta` with no existing canvas (joining mid-stream) opens the block rather than
    // dropping the markup that already arrived.
    const currentCanvas = currentMessage?.type === 'canvas' ? currentMessage : undefined;
    const messages = new Map(this.messages);
    const canvas: ConversationCanvasMessage = {
      type: 'canvas',
      messageId: message.messageId,
      // Deltas are incremental, exactly like a text delta.
      html: `${currentCanvas?.html ?? ''}${message.text}`,
      title: currentCanvas?.title,
      isDrawing: true,
      time: currentCanvas?.time ?? new Date(),
      traceId: response.traceId ?? currentCanvas?.traceId,
    };
    messages.set(message.messageId, canvas);

    return new Conversation({ messages, pendingConsent: this.pendingConsent, pendingFeedback: this.pendingFeedback });
  }

  onCanvasComplete(response: SseResponse<EventType.MESSAGE_CANVAS_COMPLETE>): Conversation {
    const message = response.fact.messageCanvasComplete.message;

    // BUG-001: subagent frames carry a non-empty `parentToolUseId`; hide them from the main conversation.
    if (message.parentToolUseId) return this;

    const template = message.template?.type === MessageTemplateType.CANVAS ? message.template : undefined;
    const html = template?.canvas?.html;

    // No template (or no markup) means the backend could not render this canvas — the frame exists only
    // to close the block `start` opened. Discard the whole card: keeping the partial markup would
    // present an unfinished document as a finished one. For an unknown id this is a no-op.
    if (!html) {
      if (!this.messages?.has(message.messageId)) return this;

      const messages = new Map(this.messages);
      messages.delete(message.messageId);

      return new Conversation({ messages, pendingConsent: this.pendingConsent, pendingFeedback: this.pendingFeedback });
    }

    const currentMessage = this.messages?.get(message.messageId);
    const currentCanvas = currentMessage?.type === 'canvas' ? currentMessage : undefined;
    const messages = new Map(this.messages);
    const canvas: ConversationCanvasMessage = {
      type: 'canvas',
      messageId: message.messageId,
      // **Replace, never append.** This fragment is authoritative, and a rejoin replays only the
      // complete — appending here would stream correctly and come back empty after a reload.
      html,
      title: template?.title,
      isDrawing: false,
      time: currentCanvas?.time ?? new Date(),
      traceId: response.traceId ?? currentCanvas?.traceId,
    };
    messages.set(message.messageId, canvas);

    return new Conversation({ messages, pendingConsent: this.pendingConsent, pendingFeedback: this.pendingFeedback });
  }

  onMessageUser(response: SseResponse<EventType.MESSAGE_USER>): Conversation {
    const data = response.fact.messageUser;

    // Dedup: the optimistic bubble sent live is keyed by the customMessageId the client generated, which
    // the backend echoes back here as `customMessageId`. If that (or the backend messageId) already maps
    // to a user message, this replayed turn is a duplicate — keep the existing one (F-014 invariant).
    const existing =
      this.messages?.get(data.messageId) ??
      (data.customMessageId ? this.messages?.get(data.customMessageId) : undefined);

    if (existing?.type === 'user') return this;

    const messages = new Map(this.messages);
    const userMessage: ConversationUserMessage = {
      type: 'user',
      messageId: data.messageId,
      text: data.text,
      blobIds: data.blobIds,
      blobs: data.blobs,
      customMessageId: data.customMessageId,
      identityHint: data.identityHint,
      time: new Date(),
      traceId: response.traceId,
    };
    messages.set(data.messageId, userMessage);

    return new Conversation({ messages, pendingConsent: this.pendingConsent, pendingFeedback: this.pendingFeedback });
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

    return new Conversation({ messages, pendingConsent: this.pendingConsent, pendingFeedback: this.pendingFeedback });
  }

  onToolCallStart(response: SseResponse<EventType.TOOL_CALL_START>): Conversation {
    const toolCallStart = response.fact.toolCallStart;
    const messages = new Map(this.messages);
    const toolCallKey = `${toolCallStart.processId}-${toolCallStart.callSeq}`;

    // Terminal guard, mirroring `isTerminalBot` / `isTerminalThinking` (F-011): a tool-call that has
    // already completed must never regress to running. This became reachable once a replayed
    // `tool_call.complete` can materialize the message on its own — a late or out-of-order `start`
    // would otherwise overwrite it back to `isComplete: false` and drop `result` / `isError` /
    // `sidecar`, with no further `complete` coming to repair it. `isComplete` is also what the Task
    // list folds on (`derived-stores.ts`), so the regression would silently empty that list too.
    if (this.isTerminalToolCall(this.messages?.get(toolCallKey))) return this;

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
      toolUseId: toolCallStart.toolUseId,
      parentToolUseId: toolCallStart.parentToolUseId,
      isComplete: false,
      time: new Date(),
      traceId: response.traceId,
    };

    messages.set(toolCallKey, toolCallMessage);

    return new Conversation({ messages, pendingConsent: this.pendingConsent, pendingFeedback: this.pendingFeedback });
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
        isError: toolCallComplete.isError,
        sidecar: toolCallComplete.toolUseResultSidecar,
        isComplete: true,
        traceId: response.traceId ?? existingMessage.traceId,
      };
      messages.set(toolCallKey, updatedMessage);
    } else {
      // Replay-safety (BUG-009): a GET rejoin only replays terminal frames, so `tool_call.complete`
      // arrives with no preceding `tool_call.start`. Dropping it here made every tool-call block
      // vanish when re-entering a conversation. The complete frame extends the same base payload as
      // the start frame (`toolCall.*` plus the correlation ids), so it can stand alone as a finished
      // call — the only thing lost is the original start timestamp.
      const replayedMessage: ConversationToolCallMessage = {
        type: 'tool-call',
        eventType: EventType.TOOL_CALL_COMPLETE,
        messageId: toolCallKey,
        processId: toolCallComplete.processId,
        callSeq: toolCallComplete.callSeq,
        toolName: toolCallComplete.toolCall.toolName,
        reason: toolCallComplete.toolCall.reason,
        toolsetName: toolCallComplete.toolCall.toolsetName,
        parameter: toolCallComplete.toolCall.parameter,
        toolUseId: toolCallComplete.toolUseId,
        parentToolUseId: toolCallComplete.parentToolUseId,
        result: toolCallComplete.toolCallResult,
        isError: toolCallComplete.isError,
        sidecar: toolCallComplete.toolUseResultSidecar,
        isComplete: true,
        time: new Date(),
        traceId: response.traceId,
      };
      messages.set(toolCallKey, replayedMessage);
    }

    return new Conversation({ messages, pendingConsent: this.pendingConsent, pendingFeedback: this.pendingFeedback });
  }

  onToolCallConsent(response: SseResponse<EventType.TOOL_CALL_CONSENT>): Conversation {
    const consent = response.fact.toolCallConsent;

    return new Conversation({
      messages: this.messages,
      pendingConsent: consent,
      pendingFeedback: this.pendingFeedback,
    });
  }

  onSubagentStart(response: SseResponse<EventType.SUBAGENT_START>): Conversation {
    const start = response.fact.subagentStart;
    const messages = new Map(this.messages);
    const key = `subagent:${start.parentToolUseId}:start`;

    const message: ConversationSubagentMessage = {
      type: 'subagent',
      messageId: key,
      kind: 'start',
      parentToolUseId: start.parentToolUseId,
      agentId: start.agentId,
      subagentType: start.subagentType,
      description: start.description,
      time: new Date(),
      traceId: response.traceId,
    };

    // Re-key to the tail: a resumed subagent re-emits `start` under the same key, and `Map.set` alone
    // would keep it at the first run's position. `deriveSubagents` reads insertion order as arrival
    // order, so a stale position would fold the resume before the tool-calls it precedes (issue #382).
    messages.delete(key);
    messages.set(key, message);

    return new Conversation({ messages, pendingConsent: this.pendingConsent, pendingFeedback: this.pendingFeedback });
  }

  onSubagentComplete(response: SseResponse<EventType.SUBAGENT_COMPLETE>): Conversation {
    const complete = response.fact.subagentComplete;
    const messages = new Map(this.messages);
    const key = `subagent:${complete.parentToolUseId}:complete`;

    const message: ConversationSubagentMessage = {
      type: 'subagent',
      messageId: key,
      kind: 'complete',
      parentToolUseId: complete.parentToolUseId,
      agentId: complete.agentId,
      subagentType: complete.subagentType,
      status: complete.status,
      summary: complete.summary,
      time: new Date(),
      traceId: response.traceId,
    };

    // Same re-keying as `onSubagentStart`: the second `complete` of a resumed subagent must fold after
    // that run's child tool-calls, otherwise the card never settles back to terminal (issue #382).
    messages.delete(key);
    messages.set(key, message);

    return new Conversation({ messages, pendingConsent: this.pendingConsent, pendingFeedback: this.pendingFeedback });
  }
}
