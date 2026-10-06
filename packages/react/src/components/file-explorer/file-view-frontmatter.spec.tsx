// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EditorView } from '@uiw/react-codemirror';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../i18n';
import { FileView } from './file-view';
import { FsEntry, FsSaveFile } from './types';

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

function renderView(name: string, content: string, onSaveFile: FsSaveFile = vi.fn()): HTMLElement {
  const { container } = render(
    <FileView
      sandboxName="sbx"
      file={file(name)}
      readFile={async (): Promise<string> => content}
      onSaveFile={onSaveFile}
      onBack={vi.fn()}
    />,
  );

  return container;
}

async function renderedMarkdown(container: HTMLElement): Promise<HTMLElement> {
  // The first render in a run waits on the markdown renderer's lazy chunk; 1 s was flaky on a cold start.
  await waitFor(() => expect(container.querySelector('p')).toBeTruthy(), { timeout: 3000 });

  return container;
}

/** The field list's entries as `[key, value]`, or `null` when there is no list. */
function fields(container: HTMLElement): [string, string][] | null {
  const list = container.querySelector('dl');

  if (!list) return null;

  return Array.from(list.querySelectorAll('dt')).map(dt => [
    dt.textContent ?? '',
    dt.nextElementSibling?.textContent ?? '',
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

  it('saves the full source, frontmatter included, after an edit', async () => {
    const save = vi.fn();
    const container = renderView('article.md', ARTICLE, save);

    fireEvent.click(await screen.findByLabelText(t('en-US', 'fileExplorer.switchToEdit')));
    await waitFor(() => expect(container.querySelector('.cm-editor')).toBeTruthy());
    const view = EditorView.findFromDOM(container.querySelector('.cm-editor') as HTMLElement);
    view?.dispatch({ changes: { from: view.state.doc.length, insert: 'Edited.\n' } });

    await waitFor(() => expect(save).toHaveBeenCalled(), { timeout: 2000 });
    expect(save).toHaveBeenLastCalledWith('sbx', '/work/article.md', `${ARTICLE}Edited.\n`);
  });

  it('renders a document that opens with a thematic break and a blank line as before', async () => {
    const deck = '---\n\n# Title\n\nText\n\n---\n\nMore.\n';
    const container = await renderedMarkdown(renderView('deck.md', deck));

    expect(container.querySelector('pre')).toBeNull();
    expect(fields(container)).toBeNull();
    expect(Array.from(container.querySelectorAll('h1')).map(h => h.textContent)).toEqual(['Title']);
    expect(container.querySelectorAll('hr')).toHaveLength(2);
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

  it('shows no list for an empty block', async () => {
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
  it('leaves out a title equal to the first # heading, and the list with it when nothing else is left', async () => {
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

  it('ignores closing #s on the heading', async () => {
    const closed = '---\ntitle: Metro line opens\n---\n\n# Metro line opens ##\n\nBody text.\n';
    const container = await renderedMarkdown(renderView('article.md', closed));

    expect(fields(container)).toBeNull();
  });

  it('does not take a # line inside a code fence as the heading', async () => {
    const fenced = '---\ntitle: Real\n---\n\n```sh\n# Real\n```\n\n# Other\n\nBody text.\n';
    const container = await renderedMarkdown(renderView('article.md', fenced));

    expect(fields(container)).toEqual([['title', 'Real']]);
  });

  it('does not take a # line inside an HTML comment as the heading', async () => {
    const commented = '---\ntitle: Real\n---\n\n<!--\n# Real\n-->\n\n# Other\n\nBody text.\n';
    const container = await renderedMarkdown(renderView('article.md', commented));

    expect(fields(container)).toEqual([['title', 'Real']]);
  });

  it('finds the heading after a closed code fence', async () => {
    const after = '---\ntitle: Real\n---\n\n```\ncode\n```\n\n# Real\n\nBody text.\n';
    const container = await renderedMarkdown(renderView('article.md', after));

    expect(fields(container)).toBeNull();
  });

  it('only counts a level-1 heading', async () => {
    const subheading = '---\ntitle: Metro line opens\n---\n\n## Metro line opens\n\nBody text.\n';
    const container = await renderedMarkdown(renderView('article.md', subheading));

    expect(fields(container)).toEqual([['title', 'Metro line opens']]);
  });
});

describe('#375 review — a heading padded with spaces stays cheap', () => {
  // The old heading regex backtracked quadratically on this shape: 20k spaces took ~1.5 s.
  const padded = `# Metro${' '.repeat(50_000)}x\n\nBody text.\n`;

  it('renders such a file without frontmatter quickly', async () => {
    const started = performance.now();
    await renderedMarkdown(renderView('notes.md', padded));

    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('renders it quickly with a title to compare, too', async () => {
    const started = performance.now();
    await renderedMarkdown(renderView('article.md', `---\ntitle: Metro\n---\n\n${padded}`));

    expect(performance.now() - started).toBeLessThan(1000);
  });
});
