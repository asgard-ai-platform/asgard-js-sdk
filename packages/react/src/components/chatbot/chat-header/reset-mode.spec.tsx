// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResetMode } from '@asgard-js/core';
import { Locale, t } from '../../../i18n';

/**
 * F-039 — one header reset button, two meanings. The host picks `resetMode` ('delete' deletes the channel
 * and its files, 'clear' resets the conversation and keeps the files); the end user only ever sees one
 * button with one icon, and the label is what tells the two apart. `showResetButton` hides it without
 * touching the programmatic `resetChannel()`.
 */

const resetChannel = vi.fn();
const context = { isResetting: false };

vi.mock('../../../context/asgard-service-context', () => ({
  useAsgardContext: (): Record<string, unknown> => ({
    avatar: undefined,
    channelTitle: null,
    isResetting: context.isResetting,
    resetChannel,
    closeChannel: vi.fn(),
    messages: null,
    customChannelId: 'ch',
  }),
}));

const { ChatHeaderHost } = await import('./chat-header-host');
const { useFileExplorerController } = await import('../../../hooks/use-file-explorer-controller');
const { useSandboxBrowserController } = await import('../../../hooks/use-sandbox-browser-controller');

function Host(props: { resetMode?: ResetMode; showResetButton?: boolean; locale?: Locale }): ReactNode {
  const controller = useFileExplorerController();
  const browserController = useSandboxBrowserController();

  return (
    <ChatHeaderHost
      title="Demo Bot"
      fileExplorerController={controller}
      builtinFileExplorer={false}
      sandboxBrowserController={browserController}
      builtinSandboxBrowser={false}
      {...props}
    />
  );
}

afterEach(() => {
  cleanup();
  resetChannel.mockClear();
  context.isResetting = false;
});

describe('F-039 reset button label follows resetMode', () => {
  it("R4: no resetMode keeps today's label (header.reset)", () => {
    render(<Host locale="zh-TW" />);

    expect(screen.getByRole('button', { name: '重設對話' })).toBeTruthy();
  });

  it.each<[Locale, string]>([
    ['zh-TW', '清除對話（保留檔案）'],
    ['en-US', 'Clear conversation (keep files)'],
    ['ja-JP', '会話をクリア（ファイルは保持）'],
  ])("R6: 'clear' labels the button with header.clear in %s", (locale, label) => {
    expect(t(locale, 'header.clear')).toBe(label);

    render(<Host resetMode="clear" locale={locale} />);

    const button = screen.getByRole('button', { name: label });
    // The label is both the accessible name and the hover tooltip.
    expect(button.getAttribute('title')).toBe(label);
  });

  it('R6: both modes render the same icon — only the words differ', () => {
    render(<Host resetMode="delete" locale="en-US" />);
    const deleteIcon = screen.getByRole('button', { name: 'Reset conversation' }).innerHTML;
    cleanup();

    render(<Host resetMode="clear" locale="en-US" />);
    const clearIcon = screen.getByRole('button', { name: 'Clear conversation (keep files)' }).innerHTML;

    expect(clearIcon).toBe(deleteIcon);
  });
});

describe('F-039 showResetButton', () => {
  it('R5: false drops the reset action and nothing else', () => {
    render(<Host showResetButton={false} locale="en-US" />);

    expect(screen.queryByRole('button', { name: 'Reset conversation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear conversation (keep files)' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it("R5: false hides the 'clear' button too", () => {
    render(<Host resetMode="clear" showResetButton={false} locale="en-US" />);

    expect(screen.queryByRole('button', { name: 'Clear conversation (keep files)' })).toBeNull();
  });
});

describe('F-039 clicking the button', () => {
  it("R7: under 'clear' the button calls resetChannel — the mode is applied inside it, with no confirm step", () => {
    render(<Host resetMode="clear" locale="en-US" />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear conversation (keep files)' }));

    expect(resetChannel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('R7: a busy reset ignores further clicks', () => {
    context.isResetting = true;
    render(<Host resetMode="clear" locale="en-US" />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear conversation (keep files)' }));

    expect(resetChannel).not.toHaveBeenCalled();
  });
});

/**
 * Mounting the authenticated `<Chatbot>` needs a live `AsgardServiceClient`, so — as in
 * `chatbot-locale-scope.spec.tsx` — the prop plumbing is pinned on the source: `resetMode` must reach the
 * service provider (which hands it to `useChannel`, where `resetChannel()` applies it) and both props must
 * reach every header host. A call site that forgets one would silently fall back to delete / visible.
 */
describe('F-039 Chatbot forwards resetMode and showResetButton', () => {
  const CHATBOT_SRC = readFileSync(join(__dirname, '..', 'chatbot.tsx'), 'utf-8');
  const PROVIDER_SRC = readFileSync(
    join(__dirname, '..', '..', '..', 'context', 'asgard-service-context.tsx'),
    'utf-8',
  );

  it('hands resetMode to the service provider, and the provider to useChannel', () => {
    const provider = CHATBOT_SRC.slice(
      CHATBOT_SRC.indexOf('<AsgardServiceContextProvider'),
      CHATBOT_SRC.indexOf('</AsgardServiceContextProvider>'),
    );

    expect(provider).toContain('resetMode={resetMode}');
    expect(PROVIDER_SRC.slice(PROVIDER_SRC.indexOf('useChannel({'))).toMatch(/useChannel\(\{[^}]*\bresetMode\b/);
  });

  it('hands both props to every ChatHeaderHost call site', () => {
    const hosts = CHATBOT_SRC.match(/<ChatHeaderHost\b/g) ?? [];

    expect(hosts.length).toBeGreaterThanOrEqual(2);
    expect(CHATBOT_SRC.match(/resetMode=\{resetMode\}/g)?.length ?? 0).toBe(hosts.length + 1);
    expect(CHATBOT_SRC.match(/showResetButton=\{showResetButton\}/g) ?? []).toHaveLength(hosts.length);
  });
});
