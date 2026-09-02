// @vitest-environment jsdom
import { ReactNode, useContext } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationBotMessage, ConversationMessage, EventType, MessageTemplateType } from '@asgard-js/core';
import { AsgardServiceContext, AsgardServiceContextValue } from '../../context/asgard-service-context';
import { AsgardTemplateContextProvider, AsgardTemplateContextValue } from '../../context/asgard-template-context';
import { ConversationMessageRenderer } from '../chatbot/chatbot-body/conversation-message-renderer';
import { Locale, t } from '../../i18n';

/**
 * F-033 — Good / Bad response feedback. Rendered through `ConversationMessageRenderer` on purpose: the
 * bar is message-level chrome mounted *after* the content, and the property that matters most for the
 * first consumer (Mimir) is that a `renderMessageContent` override which never calls
 * `renderDefaultContent()` still gets the bar.
 */

function botMessage(overrides: Partial<ConversationBotMessage> = {}): ConversationBotMessage {
  return {
    type: 'bot',
    messageId: 'm1',
    eventType: EventType.MESSAGE_COMPLETE,
    isTyping: false,
    typingText: null,
    message: {
      messageId: 'm1',
      replyToCustomMessageId: '',
      text: '上週營收 1,284 萬。',
      payload: null,
      isDebug: false,
      idx: null,
      template: { type: MessageTemplateType.TEXT, text: '上週營收 1,284 萬。', quickReplies: [] },
    },
    time: new Date(),
    raw: '',
    ...overrides,
  };
}

const USER_MESSAGE: ConversationMessage = { type: 'user', messageId: 'u1', text: 'hi', time: new Date() };

function Harness({
  message,
  service,
  template,
  locale = 'en-US',
}: {
  message: ConversationMessage;
  service: Partial<AsgardServiceContextValue>;
  template?: Partial<AsgardTemplateContextValue>;
  locale?: Locale;
}): ReactNode {
  const base = useContext(AsgardServiceContext);

  return (
    <AsgardServiceContext.Provider value={{ ...base, ...service }}>
      <AsgardTemplateContextProvider locale={locale} enableFeedback {...template}>
        <ConversationMessageRenderer message={message} />
      </AsgardTemplateContextProvider>
    </AsgardServiceContext.Provider>
  );
}

function mount(
  message: ConversationMessage = botMessage(),
  service: Partial<AsgardServiceContextValue> = {},
  template?: Partial<AsgardTemplateContextValue>,
  locale?: Locale,
): { sendMessageFeedback: ReturnType<typeof vi.fn>; sendMessage: ReturnType<typeof vi.fn> } {
  const sendMessageFeedback = vi.fn().mockResolvedValue({ messageId: 'fb-1', seq: 1 });
  const sendMessage = vi.fn().mockResolvedValue(undefined);

  render(
    <Harness
      message={message}
      service={{ sendMessageFeedback, sendMessage, isRunning: false, ...service }}
      template={template}
      locale={locale}
    />,
  );

  return { sendMessageFeedback, sendMessage };
}

const good = (): HTMLButtonElement => screen.getByRole('button', { name: 'Good response' }) as HTMLButtonElement;
const bad = (): HTMLButtonElement => screen.getByRole('button', { name: 'Bad response' }) as HTMLButtonElement;
const dialog = (): HTMLElement => screen.getByRole('dialog');
const dialogTitle = (): string | null | undefined =>
  document.getElementById(dialog().getAttribute('aria-labelledby') ?? '')?.textContent;
const textarea = (): HTMLTextAreaElement => screen.getByRole('textbox') as HTMLTextAreaElement;
const checkbox = (): HTMLInputElement => screen.getByRole('checkbox') as HTMLInputElement;
const submitButton = (): HTMLButtonElement => screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement;

afterEach(cleanup);

describe('F-033 R6 — where the bar renders', () => {
  it('under a completed bot message, with both verdict buttons unpressed', () => {
    mount();

    expect(good().getAttribute('aria-pressed')).toBe('false');
    expect(bad().getAttribute('aria-pressed')).toBe('false');
  });

  it('not under a user message', () => {
    mount(USER_MESSAGE);

    expect(screen.queryByRole('button', { name: 'Good response' })).toBeNull();
  });

  it('not while the reply is still streaming', () => {
    mount(botMessage({ isTyping: true, typingText: '上週' }));

    expect(screen.queryByRole('button', { name: 'Good response' })).toBeNull();
  });

  it('not when enableFeedback is off', () => {
    mount(botMessage(), {}, { enableFeedback: false });

    expect(screen.queryByRole('button', { name: 'Good response' })).toBeNull();
  });

  it('not in preview mode (no channel to post to)', () => {
    mount(botMessage(), { sendMessageFeedback: undefined });

    expect(screen.queryByRole('button', { name: 'Good response' })).toBeNull();
  });

  it('still renders when renderMessageContent never calls renderDefaultContent (Mimir TABLE / CHART turns)', () => {
    mount(botMessage(), {}, { renderMessageContent: () => <div data-testid="custom-card">custom card</div> });

    expect(screen.getByTestId('custom-card')).toBeTruthy();
    expect(good()).toBeTruthy();
    // After the content, not before or inside it.
    expect(
      screen.getByTestId('custom-card').compareDocumentPosition(good()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe('F-033 R7 — the dialog', () => {
  it('opens per verdict with the textarea focused, the checkbox checked, in textarea → checkbox → buttons order', () => {
    mount();

    fireEvent.click(bad());

    const d = dialog();
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(dialogTitle()).toBe('Give negative feedback');
    expect(document.activeElement).toBe(textarea());
    expect(textarea().placeholder).toBe('What went wrong with this response?');
    expect(checkbox().checked).toBe(true);

    const following = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(textarea().compareDocumentPosition(checkbox()) & following).toBeTruthy();
    expect(checkbox().compareDocumentPosition(submitButton()) & following).toBeTruthy();
  });

  it('the positive variant has its own title and placeholder', () => {
    mount();

    fireEvent.click(good());

    expect(dialogTitle()).toBe('Give positive feedback');
    expect(textarea().placeholder).toBe('What was satisfying about this response?');
  });

  it.each(['Escape', 'Cancel', 'backdrop'])('%s closes without sending (UC-055 Alt B)', how => {
    const { sendMessageFeedback } = mount();

    fireEvent.click(good());
    fireEvent.change(textarea(), { target: { value: 'draft' } });

    if (how === 'Escape') fireEvent.keyDown(textarea(), { key: 'Escape' });

    if (how === 'Cancel') fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    if (how === 'backdrop') fireEvent.mouseDown(dialog().parentElement as HTMLElement);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sendMessageFeedback).not.toHaveBeenCalled();
    expect(good().getAttribute('aria-pressed')).toBe('false');
  });
});

describe('F-033 R8 / R10 — submitting', () => {
  it('no comment: posts the bare verdict, closes, and follows up with the prefix alone (UC-055)', async () => {
    const { sendMessageFeedback, sendMessage } = mount();

    fireEvent.click(good());
    fireEvent.click(submitButton());

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sendMessageFeedback).toHaveBeenCalledWith('m1', { verdict: 'GOOD' });
    expect(sendMessage).toHaveBeenCalledWith({ text: '[Response Feedback: Good]' });
  });

  it('with a comment: posts it trimmed and follows up with prefix + blank line + comment (UC-056)', async () => {
    const { sendMessageFeedback, sendMessage } = mount();

    fireEvent.click(bad());
    fireEvent.change(textarea(), { target: { value: '  表格的數字跟我算的對不起來  ' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sendMessageFeedback).toHaveBeenCalledWith('m1', { verdict: 'BAD', comment: '表格的數字跟我算的對不起來' });
    expect(sendMessage).toHaveBeenCalledWith({ text: '[Response Feedback: Bad]\n\n表格的數字跟我算的對不起來' });
  });

  it('unchecking "send to AI as well" posts the verdict and sends nothing else (UC-057 Alt B)', async () => {
    const { sendMessageFeedback, sendMessage } = mount();

    fireEvent.click(good());
    fireEvent.click(checkbox());
    expect(checkbox().checked).toBe(false);
    fireEvent.click(submitButton());

    await waitFor(() => expect(sendMessageFeedback).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('a comment over 8 KiB of UTF-8 is refused before any request (UC-056 Alt B)', () => {
    const { sendMessageFeedback } = mount();

    fireEvent.click(bad());
    // 2 800 CJK characters = 8 400 bytes: under the cap in characters, over it in bytes.
    fireEvent.change(textarea(), { target: { value: '字'.repeat(2800) } });
    fireEvent.click(submitButton());

    expect(screen.getByRole('alert').textContent).toBe('Your comment is too long — please keep it under 8 KB.');
    expect(sendMessageFeedback).not.toHaveBeenCalled();
    expect(dialog()).toBeTruthy();
  });

  it('disables Submit while the request is in flight', async () => {
    let release: () => void = () => undefined;
    const sendMessageFeedback = vi.fn().mockImplementation(
      () =>
        new Promise<void>(resolve => {
          release = resolve;
        }),
    );
    mount(botMessage(), { sendMessageFeedback });

    fireEvent.click(good());
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Submitting…' }) as HTMLButtonElement).disabled).toBe(true),
    );

    await act(async () => release());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('F-033 R9 — when the post fails', () => {
  it('keeps the dialog and the typed comment, shows the error, sends no follow-up, lights nothing (UC-055 Alt A)', async () => {
    const sendMessageFeedback = vi.fn().mockRejectedValue(new Error('HTTP 404'));
    const sendMessage = vi.fn();
    mount(botMessage(), { sendMessageFeedback, sendMessage });

    fireEvent.click(bad());
    fireEvent.change(textarea(), { target: { value: 'still here' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toBe('Your feedback could not be submitted. Please try again.');
    expect(dialog()).toBeTruthy();
    expect(textarea().value).toBe('still here');
    expect(sendMessage).not.toHaveBeenCalled();
    expect(bad().getAttribute('aria-pressed')).toBe('false');
    expect(submitButton().disabled).toBe(false);
  });
});

describe('F-033 R11 — the rated state comes from the message, latest wins', () => {
  it('lights the rated button and re-rating flips it', () => {
    const service = { sendMessageFeedback: vi.fn(), sendMessage: vi.fn(), isRunning: false };
    const { rerender } = render(<Harness message={botMessage({ feedback: { verdict: 'GOOD' } })} service={service} />);

    expect(good().getAttribute('aria-pressed')).toBe('true');
    expect(good().getAttribute('title')).toBe('You rated this response good');
    expect(bad().getAttribute('aria-pressed')).toBe('false');

    rerender(<Harness message={botMessage({ feedback: { verdict: 'BAD', comment: 'nope' } })} service={service} />);

    expect(good().getAttribute('aria-pressed')).toBe('false');
    expect(bad().getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking the already-lit button opens the same dialog (no un-rate; UC-059 Alt A)', () => {
    mount(botMessage({ feedback: { verdict: 'GOOD' } }));

    fireEvent.click(good());

    expect(dialogTitle()).toBe('Give positive feedback');
  });
});

describe('F-033 R13 — while a run is in flight', () => {
  it('renders the bar with both buttons disabled', () => {
    mount(botMessage(), { isRunning: true });

    expect(good().disabled).toBe(true);
    expect(bad().disabled).toBe(true);
  });
});

describe('F-033 R12 — three locales', () => {
  const KEYS = [
    'feedback.good',
    'feedback.bad',
    'feedback.titleGood',
    'feedback.titleBad',
    'feedback.detailsLabel',
    'feedback.placeholderGood',
    'feedback.placeholderBad',
    'feedback.sendToAi',
    'feedback.sendToAiTitle',
    'feedback.cancel',
    'feedback.submit',
    'feedback.submitting',
    'feedback.rated.GOOD',
    'feedback.rated.BAD',
    'feedback.submitFailed',
    'feedback.tooLong',
  ];

  it('resolves every feedback.* key in en-US, ja-JP and zh-TW without falling back to the key', () => {
    for (const locale of ['en-US', 'ja-JP', 'zh-TW'] as const) {
      for (const key of KEYS) {
        const value = t(locale, key);

        expect(value, `${locale} / ${key} is missing`).not.toBe(key);
        expect(value.trim(), `${locale} / ${key} is blank`).not.toBe('');
      }
    }
  });

  it('the zh-TW dialog reads in Chinese end to end', () => {
    mount(botMessage(), {}, undefined, 'zh-TW');

    fireEvent.click(screen.getByRole('button', { name: '沒幫助' }));

    expect(dialogTitle()).toBe('提供負面回饋');
    expect(textarea().placeholder).toBe('這則回應哪裡出了問題？');
    expect(screen.getByRole('checkbox', { name: '同時告訴 AI' }).parentElement?.getAttribute('title')).toBe(
      '把回饋也送進對話，讓 AI 能即時回應與調整',
    );
    expect(screen.getByRole('button', { name: '送出' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '取消' })).toBeTruthy();
  });
});
