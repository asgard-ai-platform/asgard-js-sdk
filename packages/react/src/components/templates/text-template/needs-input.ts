// F-041 — the `[NEEDS_INPUT]:` line. The agent ends a turn with it when it is blocked on the user
// (asgard-core teaches it in the system prompt), and the backend reads the same line to set the
// conversation's NEEDS_INPUT status light. It is a signal for the screen, not text for the reader, so the
// bot message renders it as a callout instead of printing it (sdk-pm spec `needs-input-callout.md`).
//
// **The recognition rule must match the backend exactly** (asgard-core `internal/shared/needsinput`
// `markerLine`, spec §2). If the two disagree, the status light says "waiting on you" while the message
// shows no callout, or the other way round. One addition is screen-only: a marker inside a fenced code
// block does not count — the backend only pays one extra status light for it, the screen would draw a code
// sample as a callout.

const MARKER_LINE = /^[ \t]*(?:\[NEEDS_INPUT\][ \t]*[:：]|needs input[ \t]*[:：—–-])[ \t]*/i;
const FENCE = /^[ \t]*(`{3,}|~{3,})/;

/** Lowercased whole markers a streaming last line may still be growing into (spec §4). */
const MARKER_PREFIXES = ['[needs_input]:', 'needs input:'];

export type NeedsInputSegment = { kind: 'markdown'; text: string } | { kind: 'needs-input'; text: string };

export interface SplitNeedsInputOptions {
  /** The text is still streaming: hold back a last line that could still turn into a marker (spec §4). */
  streaming?: boolean;
}

/**
 * Whether a line, as streamed so far, could still become a marker once more characters arrive — e.g.
 * `[`, `[NEEDS_`, `need`, or `[NEEDS_INPUT]` plus spaces (a space is allowed before the colon).
 */
export function mayBecomeNeedsInputMarker(line: string): boolean {
  const s = line.replace(/^[ \t]+/, '').toLowerCase();

  if (s === '') return false;

  if (/^\[needs_input\][ \t]*$/.test(s) || /^needs input[ \t]*$/.test(s)) return true;

  return MARKER_PREFIXES.some(prefix => prefix.startsWith(s));
}

/**
 * Tracks fenced code blocks line by line. A fence closes only on the same character, at least as long as
 * the one that opened it (CommonMark), so a `~~~` line inside a ``` block does not end it.
 */
function createFenceTracker(): (line: string) => boolean {
  let open: string | null = null;

  return (line: string): boolean => {
    const fence = FENCE.exec(line)?.[1];

    if (fence) {
      if (open === null) open = fence;
      else if (fence[0] === open[0] && fence.length >= open.length) open = null;

      return true;
    }

    return open !== null;
  };
}

/**
 * While streaming, drop a last line that could still become a marker; it reappears once the next
 * characters settle it either way. A last line inside an open code fence is never a marker, so it is kept.
 */
export function holdBackPendingMarker(text: string): string {
  const lines = text.split('\n');
  const last = lines[lines.length - 1];

  if (!mayBecomeNeedsInputMarker(last)) return text;

  const inFence = createFenceTracker();
  let lastInFence = false;

  for (const line of lines) lastInFence = inFence(line);

  if (lastInFence) return text;

  return lines.slice(0, -1).join('\n');
}

/**
 * Splits bot text into ordinary markdown and needs-input lines, in their original order (spec §2–§4).
 *
 * - The marker and the whitespace after it are removed; a needs-input segment keeps only what follows,
 *   which may be empty when the model wrote the marker alone.
 * - Consecutive needs-input lines merge into one segment, one paragraph per line (joined by a blank line
 *   so markdown does not run them together).
 * - Markdown segments that are only whitespace are dropped.
 */
export function splitNeedsInput(text: string, options: SplitNeedsInputOptions = {}): NeedsInputSegment[] {
  const source = options.streaming ? holdBackPendingMarker(text) : text;
  const inFence = createFenceTracker();
  const segments: NeedsInputSegment[] = [];
  let markdown: string[] = [];

  const flushMarkdown = (): void => {
    const body = markdown.join('\n');

    if (body.trim() !== '') segments.push({ kind: 'markdown', text: body });

    markdown = [];
  };

  for (const line of source.split('\n')) {
    const marker = inFence(line) ? null : MARKER_LINE.exec(line);

    if (!marker) {
      markdown.push(line);
      continue;
    }

    flushMarkdown();

    const said = line.slice(marker[0].length).trim();
    const previous = segments[segments.length - 1];

    if (previous?.kind === 'needs-input') {
      previous.text = [previous.text, said].filter(Boolean).join('\n\n');
    } else {
      segments.push({ kind: 'needs-input', text: said });
    }
  }

  flushMarkdown();

  return segments;
}
