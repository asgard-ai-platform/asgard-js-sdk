// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../i18n';
import { FileView } from './file-view';
import { FsEntry } from './types';

/**
 * asgard-heimdall-pm#375（BUG-032）：agent 寫的 article.md 以 YAML frontmatter 開頭。frontmatter 是檔案的中繼資料，
 * 預覽只該呈現正文；原始碼模式仍是完整原文，否則存檔會把它抹掉。
 */

const ARTICLE = '---\ntitle: "Metro line opens"\n---\n\n# Metro line opens\n\nBody text.\n';

afterEach(() => {
  cleanup();
});

function file(name: string): FsEntry {
  return { name, path: `/work/${name}`, isDir: false, sizeBytes: 1, mtimeUnix: 0, mode: 420 };
}

function renderView(name: string, content: string): HTMLElement {
  const { container } = render(
    <FileView
      sandboxName="sbx"
      file={file(name)}
      readFile={async (): Promise<string> => content}
      onSaveFile={vi.fn()}
      onBack={vi.fn()}
    />,
  );

  return container;
}

async function renderedMarkdown(container: HTMLElement): Promise<HTMLElement> {
  await waitFor(() => expect(container.querySelector('p')).toBeTruthy());

  return container;
}

describe('#375 — markdown preview skips a leading frontmatter block', () => {
  it('renders only the body, so the title appears once', async () => {
    const container = await renderedMarkdown(renderView('article.md', ARTICLE));

    expect(container.querySelector('hr')).toBeNull();
    expect(Array.from(container.querySelectorAll('h1, h2')).map(h => h.textContent)).toEqual(['Metro line opens']);
    expect(container.textContent).not.toContain('title:');
  });

  it('treats a CRLF frontmatter block the same way', async () => {
    const container = await renderedMarkdown(renderView('article.md', ARTICLE.replace(/\n/g, '\r\n')));

    expect(container.querySelector('hr')).toBeNull();
    expect(container.textContent).not.toContain('title:');
  });

  it('skips it for the .markdown extension too', async () => {
    const container = await renderedMarkdown(renderView('article.markdown', ARTICLE));

    expect(container.textContent).not.toContain('title:');
  });

  it('keeps the frontmatter in the source shown by edit mode', async () => {
    const container = renderView('article.md', ARTICLE);

    fireEvent.click(await screen.findByLabelText(t('en-US', 'fileExplorer.switchToEdit')));

    await waitFor(() => expect(container.querySelector('.cm-content')).toBeTruthy());
    const source = container.querySelector('.cm-content')?.textContent ?? '';
    expect(source).toContain('---');
    expect(source).toContain('title: "Metro line opens"');
  });

  it('still renders a thematic break that is not at the very start', async () => {
    const container = await renderedMarkdown(renderView('notes.md', '# Notes\n\n---\n\nAfter the break.\n'));

    expect(container.querySelector('hr')).toBeTruthy();
  });

  it('renders a leading --- that is never closed as-is', async () => {
    const container = await renderedMarkdown(renderView('notes.md', '---\n\nNo closing line here.\n'));

    expect(container.querySelector('hr')).toBeTruthy();
    expect(container.textContent).toContain('No closing line here.');
  });
});
