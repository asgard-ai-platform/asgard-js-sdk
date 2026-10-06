import { Fragment, ReactNode } from 'react';
import { dump, FAILSAFE_SCHEMA, load } from 'js-yaml';
import styles from './frontmatter.module.scss';

// A leading YAML frontmatter block: `---` on the first line, through the next line that is exactly `---`. The body is
// optional and tried empty first (`??`), so an empty block closes on its own `---` rather than on a later thematic break.
// A blank line right after the opening `---` means the file opens with a thematic break, not with frontmatter.
const FRONTMATTER = /^---\r?\n(?![ \t]*\r?\n)((?:[\s\S]*?\r?\n)??)---(?:\r?\n|$)/;

/**
 * Frontmatter is the file's metadata, not its body: rendered as markdown its fences become `<hr>` and its last line a
 * setext heading (asgard-heimdall-pm#375). The preview shows it as fields above the body instead — the source and what
 * gets saved keep it as written.
 */
export function splitFrontmatter(markdown: string): { frontmatter: string; body: string } {
  const match = FRONTMATTER.exec(markdown);

  if (!match) return { frontmatter: '', body: markdown };

  return { frontmatter: match[1].replace(/\r?\n$/, ''), body: markdown.slice(match[0].length) };
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const ATX_H1 = /^ {0,3}#[ \t]+(.*)$/;

// `# Title ##` → `Title`; the closing run only counts when it stands apart (`# C#` keeps its `#`).
function withoutClosingHashes(text: string): string {
  const trimmed = text.trim();
  let end = trimmed.length;

  while (end > 0 && trimmed[end - 1] === '#') end--;

  if (end === 0) return '';

  return end < trimmed.length && /[ \t]/.test(trimmed[end - 1]) ? trimmed.slice(0, end).trimEnd() : trimmed;
}

/**
 * The body's first level-1 ATX heading. A line scan rather than one regex over the body, so it stays linear on a
 * heading padded with thousands of spaces; `# ` lines inside fenced code or an HTML comment are not headings.
 */
function firstHeading(body: string): string | null {
  let fence = '';
  let inComment = false;

  for (const line of body.split(/\r?\n/)) {
    if (fence) {
      const close = FENCE.exec(line);

      if (close && close[1][0] === fence[0] && close[1].length >= fence.length && !line.slice(close[0].length).trim()) {
        fence = '';
      }

      continue;
    }

    if (inComment) {
      inComment = !line.includes('-->');
      continue;
    }

    const open = FENCE.exec(line);

    if (open) {
      fence = open[1];
      continue;
    }

    if (/^ {0,3}<!--/.test(line)) {
      inComment = !line.includes('-->', line.indexOf('<!--') + 4);
      continue;
    }

    const heading = ATX_H1.exec(line);

    if (heading) return withoutClosingHashes(heading[1]);
  }

  return null;
}

// FAILSAFE keeps every scalar a string, so `1.0`, `2026-10-05` and `yes` read as written.
const YAML_TEXT = { schema: FAILSAFE_SCHEMA, noCompatMode: true, lineWidth: -1 };

function fieldText(value: unknown): string {
  if (value === null) return '';

  if (typeof value === 'string') return value.trimEnd();

  if (Array.isArray(value) && value.every(v => typeof v === 'string')) return value.join(', ');

  return dump(value, YAML_TEXT).trimEnd();
}

/**
 * A key / value list of the block's top-level keys; the raw block when it does not read as one (nothing is dropped). A `title`
 * that repeats the body's first `# ` heading is left out, so the title shows once (asgard-heimdall-pm#375).
 */
export function MarkdownFrontmatter({ text, body }: { text: string; body: string }): ReactNode {
  if (!text.trim()) return null;

  let rows: [string, string][] | null = null;

  try {
    const doc = load(text, YAML_TEXT);

    if (doc !== null && typeof doc === 'object' && !Array.isArray(doc)) {
      const entries = Object.entries(doc);
      const title = entries.find(([key]) => key === 'title')?.[1];
      // Only looked up when there is a title to compare, so a file without one never scans its body.
      const heading = typeof title === 'string' ? firstHeading(body) : null;

      rows = entries
        .filter(([key, value]) => !(key === 'title' && typeof value === 'string' && value.trim() === heading))
        .map(([key, value]) => [key, fieldText(value)]);
    }
  } catch {
    // Not valid YAML, or a nested value `dump` cannot write back out: shown raw below.
  }

  if (!rows) return <pre className={styles.frontmatterRaw}>{text}</pre>;

  if (rows.length === 0) return null;

  return (
    <dl className={styles.frontmatter}>
      {rows.map(([key, value]) => (
        <Fragment key={key}>
          <dt>{key}</dt>
          <dd>{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
