// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AsgardTemplateContextProvider } from '../../../context/asgard-template-context';
import type { Locale } from '../../../i18n';
import { BotMessageText, type BotMessageTextProps } from './bot-message-text';

// Streamdown loads in an effect, so static markup shows each markdown piece as its raw text — enough to
// check which pieces render, in what order, and inside which wrapper.
function render(props: BotMessageTextProps, locale: Locale = 'en-US'): HTMLElement {
  const host = document.createElement('div');

  host.innerHTML = renderToStaticMarkup(
    <AsgardTemplateContextProvider locale={locale}>
      <BotMessageText {...props} />
    </AsgardTemplateContextProvider>,
  );

  return host.firstElementChild as HTMLElement;
}

describe('BotMessageText — [NEEDS_INPUT]: callout (F-041)', () => {
  it('renders a message without a marker as one markdown piece, exactly as before', () => {
    const root = render({ children: '報告已完成。\n\n- 第一項' });

    expect(root.childNodes).toHaveLength(1);
    expect(root.textContent).toBe('報告已完成。\n\n- 第一項');
    expect(root.querySelector('[role="note"]')).toBeNull();
    expect(root.className).not.toMatch(/segmented/);
  });

  it('draws the marker line as a callout in place, with the text around it', () => {
    const root = render({ children: '查完了。\n[NEEDS_INPUT]: 需要 prod DB 的密碼\n補充說明' });
    const note = root.querySelector('[role="note"]');

    expect(
      Array.from(root.childNodes).map(node => (node instanceof Element ? node.getAttribute('role') : node.textContent)),
    ).toEqual(['查完了。', 'note', '補充說明']);
    expect(root.textContent).not.toContain('[NEEDS_INPUT]');
    expect(note?.textContent).toContain('需要 prod DB 的密碼');
    expect(root.className).toMatch(/segmented/);
  });

  it('shows the "needs your reply" state by default, named by its title', () => {
    const note = render({ children: '[NEEDS_INPUT]: 請確認' }).querySelector('[role="note"]');

    expect(note?.getAttribute('aria-label')).toBe('Needs your reply');
    expect(note?.textContent).toContain('Needs your reply');
    expect(note?.className).not.toMatch(/answered/);
  });

  it('shows the "replied" state when answered, keeping the content', () => {
    const note = render({ children: '[NEEDS_INPUT]: 請確認', answered: true }).querySelector('[role="note"]');

    expect(note?.getAttribute('aria-label')).toBe('Replied');
    expect(note?.className).toMatch(/answered/);
    expect(note?.textContent).toContain('請確認');
  });

  it.each([
    ['zh-TW', '需要你回覆', '已回覆'],
    ['ja-JP', '返信が必要です', '返信済み'],
  ] as const)('localizes the title in %s', (locale, label, answered) => {
    expect(
      render({ children: '[NEEDS_INPUT]: x' }, locale).querySelector('[role="note"]')?.getAttribute('aria-label'),
    ).toBe(label);
    expect(
      render({ children: '[NEEDS_INPUT]: x', answered: true }, locale)
        .querySelector('[role="note"]')
        ?.getAttribute('aria-label'),
    ).toBe(answered);
  });

  it('shows only the title when nothing follows the marker', () => {
    const note = render({ children: '[NEEDS_INPUT]:' }).querySelector('[role="note"]');

    expect(note?.children).toHaveLength(1);
    expect(note?.textContent).toBe('Needs your reply');
  });

  it('merges consecutive marker lines into one callout', () => {
    const root = render({ children: '[NEEDS_INPUT]: 第一件事\nneeds input: 第二件事' });

    expect(root.querySelectorAll('[role="note"]')).toHaveLength(1);
    expect(root.querySelector('[role="note"]')?.textContent).toContain('第一件事\n\n第二件事');
  });

  it('holds back a half-streamed marker instead of printing it', () => {
    const root = render({ children: '查完了。\n[NEEDS_', streaming: true });

    expect(root.textContent).toBe('查完了。');
  });

  it('does not hold anything back once the message is complete', () => {
    expect(render({ children: '查完了。\n[NEEDS_' }).textContent).toBe('查完了。\n[NEEDS_');
  });
});
