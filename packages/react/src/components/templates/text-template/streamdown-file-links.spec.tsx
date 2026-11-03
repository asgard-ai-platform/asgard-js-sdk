// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AsgardTemplateContextProvider } from '../../../context/asgard-template-context';
import { StreamdownClient } from './streamdown-client';

// BUG-025 — the sample from the ticket: two file:// links and an https control, through the real
// Streamdown pipeline (sanitize → harden included).
const SAMPLE = [
  '- [test.txt](file:///tmp/test.txt)',
  '- [規格書.pdf](file://192.168.0.10/share/規格書.pdf)',
  '- [對照組 example](https://example.com)',
  '- [evil](javascript:alert(1))',
  '- [inline html](data:text/html,hi)',
  '- [mail us](mailto:hi@example.com)',
].join('\n');

async function renderSample(markdown = SAMPLE): Promise<HTMLElement> {
  const { container } = render(<StreamdownClient>{markdown}</StreamdownClient>);

  await waitFor(() => expect(container.querySelector('[data-streamdown="unordered-list"]')).not.toBeNull());

  return container;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('StreamdownClient file:// links (BUG-025)', () => {
  it('shows file:// links as text + path instead of [blocked]', async () => {
    const container = await renderSample();

    const fileLinks = container.querySelectorAll('[data-streamdown="file-link"]');
    expect(fileLinks).toHaveLength(2);
    fileLinks.forEach(fileLink => expect(fileLink.closest('li')?.textContent).not.toContain('[blocked]'));
    expect(fileLinks[0].textContent).toContain('test.txt');
    expect(fileLinks[0].querySelector('code')?.textContent).toBe('file:///tmp/test.txt');
    expect(fileLinks[1].textContent).toContain('規格書.pdf');
    expect(fileLinks[1].querySelector('code')?.textContent).toBe('\\\\192.168.0.10\\share\\規格書.pdf');
    expect(container.querySelector('a[href^="file:"]')).toBeNull();
  });

  it('leaves https and mailto links as before and still blocks javascript: and data: links', async () => {
    const container = await renderSample();

    const https = screen.getByText('對照組 example').closest('a');
    expect(https?.getAttribute('href')).toBe('https://example.com/');
    expect(https?.getAttribute('target')).toBe('_blank');
    expect(https?.getAttribute('rel')).toContain('noreferrer');

    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    const items = Array.from(container.querySelectorAll('li')).map(li => li.textContent);
    expect(items).toContain('evil [blocked]');
    expect(items).toContain('inline html [blocked]');
    expect(container.querySelector('a[href^="data:"]')).toBeNull();

    expect(screen.getByText('mail us').closest('a')?.getAttribute('href')).toBe('mailto:hi@example.com');
  });

  it('shows an autolinked path once', async () => {
    const container = await renderSample('- <file:///tmp/test.txt>');

    const fileLink = container.querySelector('[data-streamdown="file-link"]');
    expect(fileLink?.textContent).toBe('file:///tmp/test.txt');
  });

  it('copies the path and shows a localized copied state that reverts', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    const { container } = render(
      <AsgardTemplateContextProvider locale="zh-TW">
        <StreamdownClient>{'[規格書.pdf](file://192.168.0.10/share/規格書.pdf)'}</StreamdownClient>
      </AsgardTemplateContextProvider>,
    );
    const button = await waitFor(() => {
      const found = container.querySelector<HTMLButtonElement>('[data-streamdown="file-link"] button');
      expect(found).not.toBeNull();

      return found as HTMLButtonElement;
    });

    expect(button.getAttribute('aria-label')).toBe('複製路徑');

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(button);
    });

    expect(writeText).toHaveBeenCalledWith('\\\\192.168.0.10\\share\\規格書.pdf');
    expect(button.getAttribute('aria-label')).toBe('已複製');

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(button.getAttribute('aria-label')).toBe('複製路徑');
  });
});
