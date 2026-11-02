// @vitest-environment jsdom
import { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import type { ButtonAction, ButtonMessageTemplate } from '@asgard-js/core';
import { AsgardTemplateContextProvider } from '../../context/asgard-template-context';
import { Locale, t } from '../../i18n';

/**
 * F-040 — the connection-gated cards in preview mode (`botProviderEndpoint: 'skip'`: no client, no channel, no
 * `sendMessage`). They stay in the thread but disabled, with a tooltip; plain links keep working; and connected, every
 * card behaves as it did. The download-file card has its own state machine and is covered with it in
 * `sandbox-download.spec.tsx`.
 */

const ctx = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock('../../context/asgard-service-context', () => ({
  useAsgardContext: (): Record<string, unknown> => ctx.value,
}));

const { isConnectionGatedAction } = await import('./disabled-action');
const { AttachmentChip } = await import('../templates/attachment-template/chip');
const { Card } = await import('../templates/button-template/card');

const OPEN_BROWSER: ButtonAction = { type: 'uri', uri: 'sandbox://sb-1/open-browser' };
const OPEN_FILE: ButtonAction = { type: 'uri', uri: 'sandbox://sb-1/open-file?absolute_path=%2Fwork%2Fa.md' };
const OPEN_FOLDER: ButtonAction = { type: 'uri', uri: 'sandbox://sb-1/open-folder?absolute_path=%2Fwork%2Fout' };
const DOWNLOAD_FILE: ButtonAction = { type: 'uri', uri: 'sandbox://sb-1/download-file?absolute_path=%2Fwork%2Fa.pdf' };
const CHANNEL_HOME: ButtonAction = { type: 'uri', uri: 'channel-home://contracts/draft.docx' };
const PLAIN_LINK: ButtonAction = { type: 'uri', uri: 'https://example.com/pricing' };
const MESSAGE: ButtonAction = { type: 'message', text: 'hi' };

const UNAVAILABLE: Record<Locale, string> = {
  'zh-TW': '無法開啟這個項目',
  'en-US': "This item can't be opened",
  'ja-JP': 'この項目は開けません',
};

const hosts = {
  onSandboxOpenBrowser: vi.fn(),
  onSandboxOpenFile: vi.fn(),
  onSandboxOpenFolder: vi.fn(),
};
let windowOpen: MockInstance<Parameters<Window['open']>, ReturnType<Window['open']>>;
let sendMessage: ReturnType<typeof vi.fn>;

function connect(connected: boolean): void {
  ctx.value = { client: null, customChannelId: 'ch', sendMessage: connected ? sendMessage : undefined };
}

function wrap(node: ReactNode, opts: { locale?: Locale; tooltip?: string } = {}): ReactNode {
  return (
    <AsgardTemplateContextProvider locale={opts.locale} disabledActionTooltip={opts.tooltip} {...hosts}>
      {node}
    </AsgardTemplateContextProvider>
  );
}

function renderChip(
  defaultAction: ButtonAction,
  downloadAction?: ButtonAction,
  opts?: { locale?: Locale; tooltip?: string },
): HTMLElement {
  const view = render(
    wrap(
      <AttachmentChip
        title="draft.docx"
        text="a file"
        defaultAction={defaultAction}
        downloadAction={downloadAction}
        raw=""
      />,
      opts,
    ),
  );

  return view.container.firstElementChild as HTMLElement;
}

function press(el: HTMLElement, key: string): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });

  act(() => {
    el.dispatchEvent(event);
  });

  return event.defaultPrevented;
}

function nothingRan(): void {
  expect(hosts.onSandboxOpenBrowser).not.toHaveBeenCalled();
  expect(hosts.onSandboxOpenFile).not.toHaveBeenCalled();
  expect(hosts.onSandboxOpenFolder).not.toHaveBeenCalled();
  expect(windowOpen).not.toHaveBeenCalled();
}

beforeEach(() => {
  windowOpen = vi.spyOn(window, 'open').mockReturnValue(null);
  sendMessage = vi.fn();
  connect(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.values(hosts).forEach(fn => fn.mockReset());
});

describe('isConnectionGatedAction', () => {
  it('gates the five actions that need the channel', () => {
    for (const action of [OPEN_BROWSER, OPEN_FILE, OPEN_FOLDER, DOWNLOAD_FILE, CHANNEL_HOME]) {
      expect(isConnectionGatedAction(action)).toBe(true);
    }

    expect(isConnectionGatedAction({ type: 'URI', uri: 'channel-home://a.txt' })).toBe(true);
  });

  it('leaves plain links, MESSAGE, EMIT and nothing alone', () => {
    expect(isConnectionGatedAction(PLAIN_LINK)).toBe(false);
    expect(isConnectionGatedAction({ type: 'uri', uri: 'mailto:a@example.com' })).toBe(false);
    expect(isConnectionGatedAction({ type: 'uri', uri: 'tel:+886212345678' })).toBe(false);
    expect(isConnectionGatedAction(MESSAGE)).toBe(false);
    expect(isConnectionGatedAction({ type: 'emit', eventName: 'download_file', payload: {} })).toBe(false);
    expect(isConnectionGatedAction(undefined)).toBe(false);
  });
});

describe('attachment chip — preview mode', () => {
  const cases: [string, ButtonAction, ButtonAction | undefined][] = [
    ['open-browser', OPEN_BROWSER, undefined],
    ['open-file', OPEN_FILE, undefined],
    ['open-folder', OPEN_FOLDER, undefined],
    // The backend puts the same channel-home uri on both actions; the download button owns the card.
    ['channel-home', CHANNEL_HOME, CHANNEL_HOME],
  ];

  it.each(cases)('%s: still rendered, focusable, aria-disabled, described by the tooltip', (_, action, download) => {
    const chip = renderChip(action, download);

    expect(within(chip).getByText('draft.docx')).toBeTruthy();
    expect(chip.getAttribute('role')).toBe('button');
    expect(chip.getAttribute('tabindex')).toBe('0');
    expect(chip.getAttribute('aria-disabled')).toBe('true');

    const tooltip = within(chip).getByRole('tooltip');

    expect(tooltip.textContent).toBe(UNAVAILABLE['en-US']);
    expect(chip.getAttribute('aria-describedby')).toBe(tooltip.id);
    // The download button gives way to the lock.
    expect(within(chip).queryByRole('button', { name: 'Download' })).toBeNull();
  });

  it.each(cases)('%s: click, Enter and Space do nothing (and Space does not scroll)', (_, action, download) => {
    const chip = renderChip(action, download);

    fireEvent.click(chip);
    expect(press(chip, 'Enter')).toBe(true);
    expect(press(chip, ' ')).toBe(true);
    nothingRan();
  });

  it('takes the locale for the default tooltip', () => {
    for (const locale of ['zh-TW', 'en-US', 'ja-JP'] as Locale[]) {
      const chip = renderChip(OPEN_FILE, undefined, { locale });

      expect(within(chip).getByRole('tooltip').textContent).toBe(UNAVAILABLE[locale]);
      expect(t(locale, 'sandboxCard.unavailable')).toBe(UNAVAILABLE[locale]);
      cleanup();
    }
  });

  it("uses the host's sentence as-is, whatever the locale", () => {
    const sentence = '分享的對話無法開啟這個項目';

    for (const locale of ['zh-TW', 'en-US', 'ja-JP'] as Locale[]) {
      const chip = renderChip(OPEN_BROWSER, undefined, { locale, tooltip: sentence });

      expect(within(chip).getByRole('tooltip').textContent).toBe(sentence);
      cleanup();
    }
  });

  it('keeps a plain link working', () => {
    const chip = renderChip(PLAIN_LINK);

    expect(chip.hasAttribute('aria-disabled')).toBe(false);
    expect(within(chip).queryByRole('tooltip')).toBeNull();

    fireEvent.click(chip);
    expect(windowOpen).toHaveBeenCalledWith('https://example.com/pricing', '_blank', undefined);
  });
});

describe('attachment chip — connected (unchanged)', () => {
  beforeEach(() => connect(true));

  it('runs the open-* handlers and keeps the download button, with no tooltip', () => {
    fireEvent.click(renderChip(OPEN_FILE));
    expect(hosts.onSandboxOpenFile).toHaveBeenCalledWith('sb-1', '/work/a.md');

    const browser = renderChip(OPEN_BROWSER);
    press(browser, 'Enter');
    expect(hosts.onSandboxOpenBrowser).toHaveBeenCalledWith('sb-1');

    const home = renderChip(CHANNEL_HOME, CHANNEL_HOME);

    expect(home.hasAttribute('aria-disabled')).toBe(false);
    expect(within(home).getByRole('button', { name: 'Download' })).toBeTruthy();
    expect(within(home).queryByRole('tooltip')).toBeNull();
  });
});

const TEMPLATE = {
  type: 'BUTTON',
  title: 'Quotes',
  text: 'Comparison and sources',
  buttons: [
    { label: 'Open the sheet', action: OPEN_FILE },
    { label: 'Public price list', action: PLAIN_LINK },
    { label: 'Ask again', action: MESSAGE },
  ],
} as unknown as ButtonMessageTemplate;

function renderCard(): void {
  render(wrap(<Card template={TEMPLATE} raw="" />));
}

const button = (name: string): HTMLElement => screen.getByRole('button', { name: new RegExp(name) });

describe('button card — preview mode', () => {
  it('locks only the button whose uri needs the channel', () => {
    renderCard();

    const gated = button('Open the sheet');
    const tooltip = within(gated).getByRole('tooltip');

    expect(gated.getAttribute('aria-disabled')).toBe('true');
    expect(gated.hasAttribute('disabled')).toBe(false);
    expect(gated.getAttribute('aria-describedby')).toBe(tooltip.id);
    expect(tooltip.textContent).toBe(UNAVAILABLE['en-US']);

    fireEvent.click(gated);
    nothingRan();

    for (const name of ['Public price list', 'Ask again']) {
      expect(button(name).hasAttribute('aria-disabled')).toBe(false);
      expect(within(button(name)).queryByRole('tooltip')).toBeNull();
    }

    fireEvent.click(button('Public price list'));
    expect(windowOpen).toHaveBeenCalledTimes(1);
  });
});

describe('button card — connected (unchanged)', () => {
  beforeEach(() => connect(true));

  it('runs every button as before', () => {
    renderCard();

    expect(button('Open the sheet').hasAttribute('aria-disabled')).toBe(false);
    fireEvent.click(button('Open the sheet'));
    expect(hosts.onSandboxOpenFile).toHaveBeenCalledWith('sb-1', '/work/a.md');

    fireEvent.click(button('Ask again'));
    expect(sendMessage).toHaveBeenCalledWith({ text: 'hi' });
  });
});
