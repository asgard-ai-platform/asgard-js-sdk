import {
  EventType,
  MessageTemplateType,
  type ConversationBotMessage,
  type ConversationUserMessage,
} from '@asgard-js/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TextTemplate } from './text-template';

const time = new Date('2026-07-31T00:00:00.000Z');

const botMessage: ConversationBotMessage = {
  type: 'bot',
  messageId: 'bot-message',
  eventType: EventType.MESSAGE_COMPLETE,
  isTyping: false,
  typingText: null,
  message: {
    messageId: 'bot-message',
    replyToCustomMessageId: 'user-message',
    text: 'Plain bot response',
    payload: null,
    isDebug: false,
    idx: null,
    template: {
      type: MessageTemplateType.TEXT,
      text: 'Plain bot response',
      quickReplies: [],
    },
  },
  time,
  raw: '',
};

const userMessage: ConversationUserMessage = {
  type: 'user',
  messageId: 'user-message',
  text: 'User message',
  time,
};

describe('TextTemplate message chrome', () => {
  it('renders bot text without avatar, timestamp, or inline bubble background', () => {
    const html = renderToStaticMarkup(<TextTemplate message={botMessage} />);

    expect(html).toContain('Plain bot response');
    expect(html).not.toContain('asgard-avatar');
    expect(html).not.toContain('asgard-time');
    expect(html).not.toContain('background-color');
  });

  it('keeps the user message bubble and timestamp', () => {
    const html = renderToStaticMarkup(<TextTemplate message={userMessage} />);

    expect(html).toContain('User message');
    expect(html).toContain('asgard-time');
  });
});
