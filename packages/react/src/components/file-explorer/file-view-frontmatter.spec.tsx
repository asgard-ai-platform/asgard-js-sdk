// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../i18n';
import { FileView } from './file-view';
import { FsEntry } from './types';

/**
 * asgard-heimdall-pm#375（BUG-032）：agent 寫的 article.md 以 YAML frontmatter 開頭。frontmatter 是檔案的中繼資料，
 * 不該當成 markdown 內文渲染；它改以欄位表顯示在正文上方（Sindri 的 SKILL.md 靠它的 name／description）。原始碼模式仍是
 * 完整原文，否則存檔會把它抹掉。
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

/** The field table's rows as `[key, value]`, or `null` when there is no table. */
function fields(container: HTMLElement): [string, string][] | null {
  const table = container.querySelector('table');

  if (!table) return null;

  return Array.from(table.querySelectorAll('tr')).map(tr => [
    tr.querySelector('th')?.textContent ?? '',
    tr.querySelector('td')?.textContent ?? '',
  ]);
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

  it('skips an empty block without reaching for a later thematic break', async () => {
    const container = await renderedMarkdown(
      renderView('notes.md', '---\n---\n\n# Notes\n\nBefore.\n\n---\n\nAfter.\n'),
    );

    expect(Array.from(container.querySelectorAll('h1')).map(h => h.textContent)).toEqual(['Notes']);
    expect(container.querySelectorAll('hr')).toHaveLength(1);
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

describe('#375 — the frontmatter shows as fields above the body', () => {
  it('lists each top-level key once, in file order', async () => {
    const draft = '---\ntitle: Draft title\nauthor: Jo\n---\n\n# Metro line opens\n\nBody text.\n';
    const container = await renderedMarkdown(renderView('article.md', draft));

    expect(fields(container)).toEqual([
      ['title', 'Draft title'],
      ['author', 'Jo'],
    ]);
  });

  it('reads a folded value as one paragraph and a string list comma-joined', async () => {
    const skill =
      '---\nname: open-pr\ndescription: >-\n  First line\n  second line.\ntags:\n  - git\n  - pr\n---\n\nBody.\n';
    const container = await renderedMarkdown(renderView('SKILL.md', skill));

    expect(fields(container)).toEqual([
      ['name', 'open-pr'],
      ['description', 'First line second line.'],
      ['tags', 'git, pr'],
    ]);
  });

  it('keeps the line breaks of a literal block', async () => {
    const container = await renderedMarkdown(renderView('notes.md', '---\nnotes: |\n  a\n  b\n---\n\nBody.\n'));

    expect(fields(container)).toEqual([['notes', 'a\nb']]);
  });

  it('shows a nested value as YAML text', async () => {
    const nested = '---\nmeta:\n  author: Jo\n  draft: yes\n---\n\nBody.\n';
    const container = await renderedMarkdown(renderView('notes.md', nested));

    expect(fields(container)).toEqual([['meta', 'author: Jo\ndraft: yes']]);
  });

  it('shows values as written, without turning them into numbers, dates or booleans', async () => {
    const typed = '---\nversion: 1.0\ndate: 2026-10-05\ndraft: yes\n---\n\nBody.\n';
    const container = await renderedMarkdown(renderView('notes.md', typed));

    expect(fields(container)).toEqual([
      ['version', '1.0'],
      ['date', '2026-10-05'],
      ['draft', 'yes'],
    ]);
  });

  it('shows no table for an empty block', async () => {
    const container = await renderedMarkdown(renderView('notes.md', '---\n---\n\nBody.\n'));

    expect(fields(container)).toBeNull();
    expect(container.querySelector('pre')).toBeNull();
  });

  it('falls back to the raw block when it does not parse', async () => {
    const broken = '---\ntitle: "never closed\n---\n\nBody.\n';
    const container = await renderedMarkdown(renderView('notes.md', broken));

    expect(fields(container)).toBeNull();
    expect(container.querySelector('pre')?.textContent).toBe('title: "never closed');
  });

  it('shows an empty top-level value as an empty field', async () => {
    const container = await renderedMarkdown(renderView('notes.md', '---\ntitle: Notes\ntags:\n---\n\nBody.\n'));

    expect(fields(container)).toEqual([
      ['title', 'Notes'],
      ['tags', ''],
    ]);
  });

  it('falls back to the raw block when a nested value cannot be shown as text', async () => {
    const container = await renderedMarkdown(renderView('notes.md', '---\nmeta:\n  author:\n---\n\nBody.\n'));

    expect(fields(container)).toBeNull();
    expect(container.querySelector('pre')?.textContent).toBe('meta:\n  author:');
  });

  it('falls back to the raw block when it is not a mapping', async () => {
    const container = await renderedMarkdown(renderView('notes.md', '---\n- one\n- two\n---\n\nBody.\n'));

    expect(fields(container)).toBeNull();
    expect(container.querySelector('pre')?.textContent).toBe('- one\n- two');
  });
});

describe('#375 Expected ¶2 — the title is shown only once', () => {
  it('leaves out a title equal to the first # heading, and the table with it when nothing else is left', async () => {
    const container = await renderedMarkdown(renderView('article.md', ARTICLE));

    expect(fields(container)).toBeNull();
    expect(container.querySelector('pre')).toBeNull();
    expect(Array.from(container.querySelectorAll('h1')).map(h => h.textContent)).toEqual(['Metro line opens']);
  });

  it('keeps the other fields when it leaves out the title', async () => {
    const withAuthor = '---\ntitle: Metro line opens\nauthor: Jo\n---\n\n# Metro line opens\n\nBody text.\n';
    const container = await renderedMarkdown(renderView('article.md', withAuthor));

    expect(fields(container)).toEqual([['author', 'Jo']]);
  });

  it('compares the title trimmed', async () => {
    const padded = '---\ntitle: "  Metro line opens "\n---\n\n#   Metro line opens  \n\nBody text.\n';
    const container = await renderedMarkdown(renderView('article.md', padded));

    expect(fields(container)).toBeNull();
  });

  it('keeps a title that differs from the heading', async () => {
    const renamed = '---\ntitle: Old title\n---\n\n# Metro line opens\n\nBody text.\n';
    const container = await renderedMarkdown(renderView('article.md', renamed));

    expect(fields(container)).toEqual([['title', 'Old title']]);
  });

  it('only does this for the title key', async () => {
    const skill = '---\nname: Open PR\n---\n\n# Open PR\n\nBody text.\n';
    const container = await renderedMarkdown(renderView('SKILL.md', skill));

    expect(fields(container)).toEqual([['name', 'Open PR']]);
  });

  it('only counts a level-1 heading', async () => {
    const subheading = '---\ntitle: Metro line opens\n---\n\n## Metro line opens\n\nBody text.\n';
    const container = await renderedMarkdown(renderView('article.md', subheading));

    expect(fields(container)).toEqual([['title', 'Metro line opens']]);
  });
});
