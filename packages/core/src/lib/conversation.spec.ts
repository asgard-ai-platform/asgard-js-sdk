import { describe, it, expect } from 'vitest';
import Conversation from './conversation';
import { EventType, MessageTemplateType } from '../constants/enum';
import { ConversationBotMessage, Fact, Message, SseResponse } from '../types';

function makeMessage(messageId: string, text: string): Message {
  return {
    messageId,
    replyToCustomMessageId: '',
    text,
    payload: null,
    isDebug: false,
    idx: null,
    template: { type: MessageTemplateType.TEXT, text, quickReplies: [] },
  };
}

const nullFact = {
  runInit: null,
  runDone: null,
  runError: null,
  messageStart: null,
  messageDelta: null,
  messageComplete: null,
  toolCallStart: null,
  toolCallComplete: null,
  toolCallConsent: null,
};

function start(messageId: string, text = ''): SseResponse<EventType.MESSAGE_START> {
  const fact: Fact<EventType.MESSAGE_START> = { ...nullFact, messageStart: { message: makeMessage(messageId, text) } };

  return {
    eventType: EventType.MESSAGE_START,
    requestId: 'req',
    namespace: 'ns',
    botProviderName: 'bp',
    customChannelId: 'ch',
    fact,
  };
}

function delta(messageId: string, text: string): SseResponse<EventType.MESSAGE_DELTA> {
  const fact: Fact<EventType.MESSAGE_DELTA> = { ...nullFact, messageDelta: { message: makeMessage(messageId, text) } };

  return {
    eventType: EventType.MESSAGE_DELTA,
    requestId: 'req',
    namespace: 'ns',
    botProviderName: 'bp',
    customChannelId: 'ch',
    fact,
  };
}

function complete(messageId: string, text: string): SseResponse<EventType.MESSAGE_COMPLETE> {
  const fact: Fact<EventType.MESSAGE_COMPLETE> = {
    ...nullFact,
    messageComplete: { message: makeMessage(messageId, text) },
  };

  return {
    eventType: EventType.MESSAGE_COMPLETE,
    requestId: 'req',
    namespace: 'ns',
    botProviderName: 'bp',
    customChannelId: 'ch',
    fact,
  };
}

function emptyConversation(): Conversation {
  return new Conversation({ messages: new Map() });
}

function botMessage(conv: Conversation, messageId: string): ConversationBotMessage {
  const message = conv.messages?.get(messageId);
  expect(message?.type).toBe('bot');

  return message as ConversationBotMessage;
}

describe('Conversation message stream assembly (F-011)', () => {
  it('normal flow: start → delta → delta accumulates typingText', () => {
    const conv = emptyConversation()
      .onMessageStart(start('m1'))
      .onMessageDelta(delta('m1', 'Hel'))
      .onMessageDelta(delta('m1', 'lo'));
    const msg = botMessage(conv, 'm1');
    expect(msg.isTyping).toBe(true);
    expect(msg.typingText).toBe('Hello');
  });

  // R1 — complete is self-sufficient
  it('complete-only: materializes terminal state with no prior start/delta', () => {
    const conv = emptyConversation().onMessageComplete(complete('m1', 'final answer'));
    const msg = botMessage(conv, 'm1');
    expect(msg.isTyping).toBe(false);
    expect(msg.typingText).toBeNull();
    expect(msg.eventType).toBe(EventType.MESSAGE_COMPLETE);
    expect(msg.message.text).toBe('final answer');
  });

  // R2 — delta before start lazily creates the entry (no dropped chars)
  it('delta-before-start: lazily creates the entry and keeps the text', () => {
    const conv = emptyConversation().onMessageDelta(delta('m1', 'partial'));
    const msg = botMessage(conv, 'm1');
    expect(msg.isTyping).toBe(true);
    expect(msg.typingText).toBe('partial');
  });

  // R3 — late start after complete is ignored
  it('start-after-complete: terminal state is preserved (no reset to empty typing)', () => {
    const conv = emptyConversation().onMessageComplete(complete('m1', 'final')).onMessageStart(start('m1'));
    const msg = botMessage(conv, 'm1');
    expect(msg.isTyping).toBe(false);
    expect(msg.typingText).toBeNull();
    expect(msg.message.text).toBe('final');
    expect(msg.eventType).toBe(EventType.MESSAGE_COMPLETE);
  });

  // R4 — late delta after complete is ignored (no rollback, no "null…")
  it('delta-after-complete: terminal state is preserved (no rollback, no null concat)', () => {
    const conv = emptyConversation().onMessageComplete(complete('m1', 'final')).onMessageDelta(delta('m1', 'x'));
    const msg = botMessage(conv, 'm1');
    expect(msg.isTyping).toBe(false);
    expect(msg.typingText).toBeNull();
    expect(msg.message.text).toBe('final');
  });

  // R5 — duplicate complete is idempotent (single message, same terminal)
  it('duplicate-complete: stays terminal and does not create a second message', () => {
    const conv = emptyConversation().onMessageComplete(complete('m1', 'a')).onMessageComplete(complete('m1', 'a'));
    expect(conv.messages?.size).toBe(1);
    const msg = botMessage(conv, 'm1');
    expect(msg.isTyping).toBe(false);
    expect(msg.message.text).toBe('a');
  });

  // R6 — chaotic subset/out-of-order/duplicate never throws and ends terminal
  it('out-of-order storm: never throws and preserves the terminal message', () => {
    expect(() => {
      const conv = emptyConversation()
        .onMessageDelta(delta('m1', 'a'))
        .onMessageComplete(complete('m1', 'done'))
        .onMessageStart(start('m1'))
        .onMessageDelta(delta('m1', 'b'))
        .onMessageComplete(complete('m1', 'done'));
      const msg = botMessage(conv, 'm1');
      expect(msg.isTyping).toBe(false);
      expect(msg.message.text).toBe('done');
    }).not.toThrow();
  });
});
