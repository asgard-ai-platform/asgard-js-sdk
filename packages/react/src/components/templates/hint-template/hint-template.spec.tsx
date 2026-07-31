import { EventType, MessageTemplateType, type ConversationBotMessage } from '@asgard-js/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HintTemplate } from './hint-template';

const message: ConversationBotMessage = {
  type: 'bot',
  messageId: 'hint-message',
  eventType: EventType.MESSAGE_COMPLETE,
  isTyping: false,
  typingText: null,
  message: {
    messageId: 'hint-message',
    replyToCustomMessageId: 'user-message',
    text: 'Current location: Taipei',
    payload: null,
    isDebug: false,
    idx: null,
    template: {
      type: MessageTemplateType.HINT,
      text: 'Current location: Taipei',
      quickReplies: [],
    },
  },
  time: new Date('2026-07-31T00:00:00.000Z'),
  raw: '',
};

describe('HintTemplate message chrome', () => {
  it('renders bot hints without a timestamp', () => {
    const html = renderToStaticMarkup(<HintTemplate message={message} />);

    expect(html).toContain('Current location: Taipei');
    expect(html).not.toContain('asgard-time');
    expect(html).not.toMatch(/\d{1,2}:\d{2}/);
  });
});
