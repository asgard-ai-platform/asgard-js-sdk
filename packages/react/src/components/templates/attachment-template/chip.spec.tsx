import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ButtonAction } from '@asgard-js/core';
import { AttachmentChip, isDownloadAction } from './chip';

/**
 * Guards who owns the attachment chip's click.
 *
 * The backend hands the channel-home file case the *same* download intent in both `defaultAction` and
 * `downloadAction`, so clicking anywhere on the card fired a download — the card body was a second, invisible
 * download button, and a host could not give the body its own meaning (Sindri wanted it to open a Files panel).
 * Downloading is the download button's job; the body only stays inert when that button is actually there, so a
 * download-only chip keeps working. `open-browser` / `open-file` / plain links must remain clickable — that is
 * the whole point of BUILD-029's globe chip.
 */
const DOWNLOAD_URI: ButtonAction = { type: 'uri', uri: 'channel-home://report.json' };
const DOWNLOAD_EMIT: ButtonAction = { type: 'emit', eventName: 'download_file', payload: {} };
const OPEN_BROWSER: ButtonAction = { type: 'uri', uri: 'sandbox://box-1/open-browser' };
const OPEN_FILE: ButtonAction = { type: 'uri', uri: 'sandbox://box-1/open-file?path=/app/a.txt' };
const OPEN_FOLDER: ButtonAction = { type: 'uri', uri: 'sandbox://box-1/open-folder?absolute_path=/app/out' };
const PLAIN_LINK: ButtonAction = { type: 'uri', uri: 'https://example.com/' };

function markup(defaultAction: ButtonAction, downloadAction?: ButtonAction): string {
  return renderToStaticMarkup(
    <AttachmentChip
      title="report.json"
      text="a file"
      defaultAction={defaultAction}
      downloadAction={downloadAction}
      raw=""
    />,
  );
}

/** The body is interactive exactly when the outer element still carries the button role. */
function bodyIsInteractive(html: string): boolean {
  return /^<div role="button"/.test(html);
}

describe('isDownloadAction', () => {
  it('recognises both download shapes and nothing else', () => {
    expect(isDownloadAction(DOWNLOAD_URI)).toBe(true);
    expect(isDownloadAction(DOWNLOAD_EMIT)).toBe(true);
    expect(isDownloadAction({ type: 'URI', uri: 'channel-home://a.txt' })).toBe(true);
    expect(isDownloadAction({ type: 'EMIT', eventName: 'download_file', payload: {} })).toBe(true);

    expect(isDownloadAction(undefined)).toBe(false);
    expect(isDownloadAction(OPEN_BROWSER)).toBe(false);
    expect(isDownloadAction(OPEN_FILE)).toBe(false);
    expect(isDownloadAction(PLAIN_LINK)).toBe(false);
    expect(isDownloadAction({ type: 'emit', eventName: 'other_event', payload: {} })).toBe(false);
    expect(isDownloadAction({ type: 'message', text: 'hi' })).toBe(false);
  });
});

describe('AttachmentChip body click', () => {
  it('is inert when the body would only repeat the download button (the regression)', () => {
    expect(bodyIsInteractive(markup(DOWNLOAD_URI, DOWNLOAD_URI))).toBe(false);
    expect(bodyIsInteractive(markup(DOWNLOAD_EMIT, DOWNLOAD_EMIT))).toBe(false);
    expect(bodyIsInteractive(markup(DOWNLOAD_URI, DOWNLOAD_EMIT))).toBe(false);
  });

  it('stays clickable when there is no download button to fall back on', () => {
    expect(bodyIsInteractive(markup(DOWNLOAD_URI))).toBe(true);
    expect(bodyIsInteractive(markup(DOWNLOAD_EMIT))).toBe(true);
  });

  it('leaves non-download actions clickable even alongside a download button', () => {
    expect(bodyIsInteractive(markup(OPEN_BROWSER, DOWNLOAD_URI))).toBe(true);
    expect(bodyIsInteractive(markup(OPEN_FILE, DOWNLOAD_URI))).toBe(true);
    expect(bodyIsInteractive(markup(PLAIN_LINK, DOWNLOAD_URI))).toBe(true);
  });

  it('keeps rendering the download button whenever the download action qualifies', () => {
    expect(markup(DOWNLOAD_URI, DOWNLOAD_URI)).toContain('aria-label="Download"');
    expect(markup(OPEN_BROWSER, DOWNLOAD_URI)).toContain('aria-label="Download"');
    expect(markup(OPEN_BROWSER)).not.toContain('aria-label="Download"');
  });
});

/**
 * F-034 AC6 — the glyph follows the action, so the open-folder card reads as a folder while staying in the
 * same family as the open-file card: same chip, same chrome, different destination. Matched on each icon's
 * own path data, since all three render as a bare `<svg>` with no class of their own.
 */
const GLOBE = '<circle';
const FOLDER = 'm6 14 1.5-2.9';
const DOCUMENT = 'M15 2H6a2 2 0';

describe('AttachmentChip glyph (F-034 AC6)', () => {
  it('gives an open-folder card the folder icon', () => {
    const html = markup(OPEN_FOLDER);

    expect(html).toContain(FOLDER);
    expect(html).not.toContain(DOCUMENT);
    expect(html).not.toContain(GLOBE);
  });

  it('leaves the other three cards exactly as they were', () => {
    expect(markup(OPEN_BROWSER)).toContain(GLOBE);
    expect(markup(OPEN_FILE)).toContain(DOCUMENT);
    expect(markup(PLAIN_LINK)).toContain(DOCUMENT);
    expect(markup(OPEN_FILE)).not.toContain(FOLDER);
  });
});
