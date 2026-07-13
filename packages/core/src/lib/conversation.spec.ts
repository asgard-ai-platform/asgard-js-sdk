import { describe, it, expect } from 'vitest';
import Conversation from './conversation';
import { EventType, MessageTemplateType } from '../constants/enum';
import {
  ConversationBotMessage,
  ConversationSubagentMessage,
  ConversationThinkingMessage,
  ConversationToolCallMessage,
  Fact,
  Message,
  SseResponse,
} from '../types';

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
  subagentStart: null,
  subagentComplete: null,
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

// ---- F-012 subagent stream builders ----

function subagentStartEvt(
  parentToolUseId: string,
  opts: { agentId?: string; subagentType?: string; description?: string } = {},
): SseResponse<EventType.SUBAGENT_START> {
  const fact: Fact<EventType.SUBAGENT_START> = {
    ...nullFact,
    subagentStart: {
      agentId: opts.agentId ?? 'agent-1',
      parentToolUseId,
      subagentType: opts.subagentType,
      description: opts.description,
    },
  };

  return {
    eventType: EventType.SUBAGENT_START,
    requestId: 'req',
    namespace: 'ns',
    botProviderName: 'bp',
    customChannelId: 'ch',
    fact,
  };
}

function subagentCompleteEvt(
  parentToolUseId: string,
  status: 'completed' | 'failed' | 'cancelled',
  opts: { agentId?: string; subagentType?: string; summary?: string } = {},
): SseResponse<EventType.SUBAGENT_COMPLETE> {
  const fact: Fact<EventType.SUBAGENT_COMPLETE> = {
    ...nullFact,
    subagentComplete: {
      agentId: opts.agentId ?? 'agent-1',
      parentToolUseId,
      subagentType: opts.subagentType,
      status,
      summary: opts.summary,
    },
  };

  return {
    eventType: EventType.SUBAGENT_COMPLETE,
    requestId: 'req',
    namespace: 'ns',
    botProviderName: 'bp',
    customChannelId: 'ch',
    fact,
  };
}

function toolCallStartEvt(
  processId: string,
  callSeq: number,
  toolName: string,
  opts: {
    toolsetName?: string;
    toolUseId?: string;
    parentToolUseId?: string;
    parameter?: Record<string, unknown>;
  } = {},
): SseResponse<EventType.TOOL_CALL_START> {
  const fact: Fact<EventType.TOOL_CALL_START> = {
    ...nullFact,
    toolCallStart: {
      processId,
      callSeq,
      toolUseId: opts.toolUseId,
      parentToolUseId: opts.parentToolUseId,
      toolCall: { toolsetName: opts.toolsetName ?? '', toolName, parameter: opts.parameter ?? {} },
    },
  };

  return {
    eventType: EventType.TOOL_CALL_START,
    requestId: 'req',
    namespace: 'ns',
    botProviderName: 'bp',
    customChannelId: 'ch',
    fact,
  };
}

function subagentMessage(conv: Conversation, key: string): ConversationSubagentMessage {
  const message = conv.messages?.get(key);
  expect(message?.type).toBe('subagent');

  return message as ConversationSubagentMessage;
}

describe('Conversation subagent stream assembly (F-012)', () => {
  it('normal flow: start → running, complete → terminal status with merged meta', () => {
    const conv = emptyConversation()
      .onSubagentStart(subagentStartEvt('X', { subagentType: 'general-purpose', description: 'do work' }))
      .onSubagentComplete(subagentCompleteEvt('X', 'completed', { summary: 'done' }));
    const sa = subagentMessage(conv, 'X');
    expect(sa.status).toBe('completed');
    expect(sa.subagentType).toBe('general-purpose');
    expect(sa.description).toBe('do work');
    expect(sa.summary).toBe('done');
  });

  it('start-after-complete: terminal status preserved (replay-safe, R2)', () => {
    const conv = emptyConversation()
      .onSubagentComplete(subagentCompleteEvt('X', 'completed'))
      .onSubagentStart(subagentStartEvt('X'));
    const sa = subagentMessage(conv, 'X');
    expect(sa.status).toBe('completed');
    expect(sa.eventType).toBe(EventType.SUBAGENT_COMPLETE);
  });

  it('complete-only (out of order): materializes terminal from its own fields', () => {
    const conv = emptyConversation().onSubagentComplete(
      subagentCompleteEvt('X', 'failed', { subagentType: 'general-purpose', summary: 'gave up' }),
    );
    const sa = subagentMessage(conv, 'X');
    expect(sa.status).toBe('failed');
    expect(sa.subagentType).toBe('general-purpose');
    expect(sa.summary).toBe('gave up');
    // `subagent.complete` carries no `description`; with no prior `start`, it stays undefined.
    expect(sa.description).toBeUndefined();
  });

  it('start alone: running, keyed by parentToolUseId', () => {
    const conv = emptyConversation().onSubagentStart(subagentStartEvt('X', { agentId: 'ag', description: 'd' }));
    const sa = subagentMessage(conv, 'X');
    expect(sa.status).toBe('running');
    expect(sa.agentId).toBe('ag');
    expect(sa.parentToolUseId).toBe('X');
  });

  it('tool_call.start carries toolUseId / parentToolUseId onto the message', () => {
    const conv = emptyConversation().onToolCallStart(
      toolCallStartEvt('p', 0, 'Read', { toolUseId: 't1', parentToolUseId: 'X', parameter: { file_path: '/a' } }),
    );
    const msg = conv.messages?.get('p-0') as ConversationToolCallMessage;
    expect(msg.type).toBe('tool-call');
    expect(msg.toolUseId).toBe('t1');
    expect(msg.parentToolUseId).toBe('X');
  });

  it('Agent tool call stays main-line (no parentToolUseId); child carries the parent key', () => {
    const conv = emptyConversation()
      .onToolCallStart(toolCallStartEvt('p', 0, 'Agent', { toolUseId: 'X', parameter: { description: 'spawn' } }))
      .onToolCallStart(toolCallStartEvt('p', 1, 'Read', { toolUseId: 't1', parentToolUseId: 'X' }));
    const agent = conv.messages?.get('p-0') as ConversationToolCallMessage;
    const child = conv.messages?.get('p-1') as ConversationToolCallMessage;
    expect(agent.parentToolUseId).toBeUndefined();
    expect(agent.toolUseId).toBe('X');
    expect(child.parentToolUseId).toBe('X');
  });
});
