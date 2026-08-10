// @vitest-environment jsdom
import {
  EventType,
  MessageTemplateType,
  type ConversationBotMessage,
  type ConversationErrorMessage,
} from '@asgard-js/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AsgardTemplateContext } from '../../../context';
import { t } from '../../../i18n';
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

/**
 * A run that dies on an admission-denied Sandbox (workspace quota / lapsed subscription) reports
 * the reason in `asgard.run.error`'s `message`. The bubble used to render a fixed "Unexpected
 * error" and drop it, leaving the user with nothing actionable and no way to see what happened.
 */
const QUOTA_REASON = 'sandbox provision seconds quota exceeded for workspace ws_42: used 3600 / 3600 this period';

function errorMessage(error?: Partial<ConversationErrorMessage['error']>, traceId?: string): ConversationErrorMessage {
  return {
    type: 'error',
    messageId: 'err-1',
    eventType: EventType.ERROR,
    error: {
      message: QUOTA_REASON,
      code: 'QUOTA_EXCEED',
      inner: '',
      location: { namespace: '', workflowName: '', processorName: '', processorType: '' },
      ...error,
    },
    time: new Date('2026-07-31T00:00:00.000Z'),
    traceId,
  };
}

describe('HintTemplate error bubble', () => {
  afterEach(cleanup);

  it("shows the backend's error message instead of a fixed string", () => {
    render(<HintTemplate message={errorMessage()} />);

    expect(screen.getByText(QUOTA_REASON)).toBeTruthy();
    expect(screen.queryByText(t('en-US', 'error.unexpected'))).toBeNull();
  });

  it('falls back to "Unexpected error" when the event carries no message', () => {
    render(<HintTemplate message={errorMessage({ message: '   ' })} />);

    expect(screen.getByText(t('en-US', 'error.unexpected'))).toBeTruthy();
  });

  it('keeps diagnostics collapsed until the user asks for them', () => {
    render(<HintTemplate message={errorMessage({ inner: 'admission webhook denied the request' }, 'trace-abc')} />);

    expect(screen.queryByText('QUOTA_EXCEED')).toBeNull();
    expect(screen.queryByText('trace-abc')).toBeNull();
    expect(screen.queryByText('admission webhook denied the request')).toBeNull();
    expect(screen.getByRole('button', { name: t('en-US', 'error.showDetails') })).toBeTruthy();
  });

  it('reveals code, trace id and the raw inner error on expand, and hides them again', () => {
    render(<HintTemplate message={errorMessage({ inner: 'admission webhook denied the request' }, 'trace-abc')} />);

    fireEvent.click(screen.getByRole('button', { name: t('en-US', 'error.showDetails') }));

    expect(screen.getByText('QUOTA_EXCEED')).toBeTruthy();
    expect(screen.getByText('trace-abc')).toBeTruthy();
    expect(screen.getByText('admission webhook denied the request')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: t('en-US', 'error.hideDetails') }));

    expect(screen.queryByText('QUOTA_EXCEED')).toBeNull();
  });

  it('omits the toggle when there is nothing to reveal', () => {
    render(<HintTemplate message={errorMessage({ code: '', inner: '' })} />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  // Preserves the previous `errorMessageRenderer?.(message) ?? <default/>` contract: a renderer
  // that opts out for a given message must not blank the bubble.
  it('falls through to the default UI when errorMessageRenderer returns null', () => {
    render(
      <AsgardTemplateContext.Provider value={{ locale: 'en-US', errorMessageRenderer: () => null }}>
        <HintTemplate message={errorMessage()} />
      </AsgardTemplateContext.Provider>,
    );

    expect(screen.getByText(QUOTA_REASON)).toBeTruthy();
  });

  it('defers to errorMessageRenderer when it returns content', () => {
    render(
      <AsgardTemplateContext.Provider
        value={{ locale: 'en-US', errorMessageRenderer: () => <span>custom error UI</span> }}
      >
        <HintTemplate message={errorMessage()} />
      </AsgardTemplateContext.Provider>,
    );

    expect(screen.getByText('custom error UI')).toBeTruthy();
    expect(screen.queryByText(QUOTA_REASON)).toBeNull();
  });
});
