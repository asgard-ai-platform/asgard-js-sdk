// BUG-025 — what a `file:` link in a bot message shows and copies.
//
// Browsers refuse to navigate from an http(s) page to `file://`, so these links can never be opened by a
// click; the message shows the path instead and lets the user copy it. A link with a host points at a
// network share, which on Windows (where the customers' SMB drives live) is opened by pasting the UNC
// form into File Explorer, so that is what the user gets. A host-less link is copied as the URL itself.

const FILE_PROTOCOL = /^file:/i;

export function isFileHref(href: unknown): href is string {
  return typeof href === 'string' && FILE_PROTOCOL.test(href);
}

/**
 * The path to display and copy for a `file:` href.
 *
 * - `file://192.168.0.10/share/a.pdf` → `\\192.168.0.10\share\a.pdf`
 * - `file:///tmp/a.txt` and `file://localhost/tmp/a.txt` → the URL itself
 *
 * Markdown percent-encodes non-ASCII characters in link destinations, so the result is decoded; a
 * malformed escape leaves the text as it was rather than throwing.
 */
export function toFileLinkPath(href: string): string {
  let url: URL;

  try {
    url = new URL(href);
  } catch {
    return safeDecode(href);
  }

  if (url.protocol !== 'file:' || url.hostname === '' || url.hostname === 'localhost') {
    return safeDecode(href);
  }

  return `\\\\${url.hostname}${safeDecode(url.pathname).replace(/\//g, '\\')}`;
}

function safeDecode(value: string): string {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}
