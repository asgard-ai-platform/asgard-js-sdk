import { describe, it, expect } from 'vitest';
import Conversation from './conversation';
import { EventType, MessageTemplateType } from '../constants/enum';
import { ConversationBotMessage, ConversationThinkingMessage, Fact, Message, SseResponse } from '../types';

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

function thinkingStart(messageId: string, text = ''): SseResponse<EventType.MESSAGE_THINKING_START> {
  const fact: Fact<EventType.MESSAGE_THINKING_START> = {
    ...nullFact,
    messageThinkingStart: { message: makeMessage(messageId, text) },
  };

  return {
    eventType: EventType.MESSAGE_THINKING_START,
    requestId: 'req',
    namespace: 'ns',
    botProviderName: 'bp',
    customChannelId: 'ch',
    fact,
  };
}

function thinkingDelta(messageId: string, text: string): SseResponse<EventType.MESSAGE_THINKING_DELTA> {
  const fact: Fact<EventType.MESSAGE_THINKING_DELTA> = {
    ...nullFact,
    messageThinkingDelta: { message: makeMessage(messageId, text) },
  };

  return {
    eventType: EventType.MESSAGE_THINKING_DELTA,
    requestId: 'req',
    namespace: 'ns',
    botProviderName: 'bp',
    customChannelId: 'ch',
    fact,
  };
}

function thinkingComplete(messageId: string, text: string): SseResponse<EventType.MESSAGE_THINKING_COMPLETE> {
  const fact: Fact<EventType.MESSAGE_THINKING_COMPLETE> = {
    ...nullFact,
    messageThinkingComplete: { message: makeMessage(messageId, text) },
  };

  return {
    eventType: EventType.MESSAGE_THINKING_COMPLETE,
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

function thinkingMessage(conv: Conversation, messageId: string): ConversationThinkingMessage {
  const message = conv.messages?.get(messageId);
  expect(message?.type).toBe('thinking');

  return message as ConversationThinkingMessage;
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

describe('Conversation thinking stream assembly (F-001, F-011 contract)', () => {
  it('normal flow: start → delta → delta accumulates streaming text', () => {
    const conv = emptyConversation()
      .onMessageThinkingStart(thinkingStart('t1'))
      .onMessageThinkingDelta(thinkingDelta('t1', 'Rea'))
      .onMessageThinkingDelta(thinkingDelta('t1', 'soning'));
    const msg = thinkingMessage(conv, 't1');
    expect(msg.isStreaming).toBe(true);
    expect(msg.text).toBe('Reasoning');
  });

  it('complete-only: materializes terminal thinking block with no prior start/delta', () => {
    const conv = emptyConversation().onMessageThinkingComplete(thinkingComplete('t1', 'final reasoning'));
    const msg = thinkingMessage(conv, 't1');
    expect(msg.isStreaming).toBe(false);
    expect(msg.eventType).toBe(EventType.MESSAGE_THINKING_COMPLETE);
    expect(msg.text).toBe('final reasoning');
  });

  it('delta-before-start: lazily creates the entry and keeps the text', () => {
    const conv = emptyConversation().onMessageThinkingDelta(thinkingDelta('t1', 'partial'));
    const msg = thinkingMessage(conv, 't1');
    expect(msg.isStreaming).toBe(true);
    expect(msg.text).toBe('partial');
  });

  it('start-after-complete: terminal state preserved (no reset to streaming)', () => {
    const conv = emptyConversation()
      .onMessageThinkingComplete(thinkingComplete('t1', 'final'))
      .onMessageThinkingStart(thinkingStart('t1'));
    const msg = thinkingMessage(conv, 't1');
    expect(msg.isStreaming).toBe(false);
    expect(msg.text).toBe('final');
  });

  it('delta-after-complete: terminal state preserved (no rollback, no null concat)', () => {
    const conv = emptyConversation()
      .onMessageThinkingComplete(thinkingComplete('t1', 'final'))
      .onMessageThinkingDelta(thinkingDelta('t1', 'x'));
    const msg = thinkingMessage(conv, 't1');
    expect(msg.isStreaming).toBe(false);
    expect(msg.text).toBe('final');
  });

  it('duplicate-complete: stays terminal, single message', () => {
    const conv = emptyConversation()
      .onMessageThinkingComplete(thinkingComplete('t1', 'a'))
      .onMessageThinkingComplete(thinkingComplete('t1', 'a'));
    expect(conv.messages?.size).toBe(1);
    expect(thinkingMessage(conv, 't1').isStreaming).toBe(false);
  });

  it('thinking and answer messages coexist as separate entries', () => {
    const conv = emptyConversation()
      .onMessageThinkingComplete(thinkingComplete('t1', 'reasoning'))
      .onMessageComplete(complete('m1', 'answer'));
    expect(conv.messages?.size).toBe(2);
    expect(thinkingMessage(conv, 't1').text).toBe('reasoning');
    expect(botMessage(conv, 'm1').message.text).toBe('answer');
  });
});
