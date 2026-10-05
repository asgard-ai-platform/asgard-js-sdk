// F-020 / F-034 / F-038 — the typed intent a `sandbox://` custom URI resolves to. The host runs the side effect
// from this (open-browser → one-time browser URL; open-file → File Explorer preview; open-folder → expand that
// directory on the tree; download-file → save the file to the user's machine); it is never a browsable URL.
//
// `open-file` and `open-folder` are two separate actions rather than one action with a flag, because their
// destinations are not interchangeable: a file goes into the viewer (read + watch), a folder only unfolds the tree.
// The backend's fs API refuses both calls for a directory (`fs/file` → 500 `path is a directory`, `fs/watch` → a
// dead connection), so a file card pointing at a directory cannot succeed — which is exactly what an agent holding
// only `open_sandbox_file` used to do after unzipping an archive.
export type SandboxUriIntent =
  | { kind: 'open-browser'; sandboxName: string }
  | { kind: 'open-file'; sandboxName: string; absolutePath: string }
  | { kind: 'open-folder'; sandboxName: string; absolutePath: string }
  // F-038 — `absolutePath` may be any readable file in the sandbox (working directory, Channel Home, a SourceSet
  // mount): a download never enters the File Explorer tree, so it is not limited to its root.
  | { kind: 'download-file'; sandboxName: string; absolutePath: string };

/** The actions that carry an `absolute_path` — parsed by one shared rule so they can never drift apart. */
const PATH_ACTIONS = ['open-file', 'open-folder', 'download-file'] as const;

type PathAction = (typeof PATH_ACTIONS)[number];

function isPathAction(action: string): action is PathAction {
  return (PATH_ACTIONS as readonly string[]).includes(action);
}

/**
 * Parse `sandbox://<name>/<action>?<query>` into a typed {@link SandboxUriIntent} (F-020 / F-034 / F-038, UC-036).
 * Returns `null` for an unknown action, a missing `absolute_path`, or a non-`sandbox://` / malformed URI —
 * the host must then treat it as a plain card and never `window.open()` the raw scheme.
 *
 * A hand-written regex (not `new URL()`) is used deliberately: absolute paths carry many `/`, and a
 * non-special scheme's host casing is unreliable under the WHATWG URL parser; the query is still handed to
 * `URLSearchParams` (which decodes).
 */
export function resolveSandboxUri(uri: string): SandboxUriIntent | null {
  const match = /^sandbox:\/\/([^/]+)\/([^?#]+)(?:\?([^#]*))?/.exec(uri.trim());
  if (!match) return null;

  const sandboxName = decodeURIComponent(match[1]);
  const action = match[2];
  const params = new URLSearchParams(match[3] ?? '');

  if (action === 'open-browser') return { kind: 'open-browser', sandboxName };

  if (isPathAction(action)) {
    const absolutePath = params.get('absolute_path'); // URLSearchParams already decodes
    if (!absolutePath) return null;

    return { kind: action, sandboxName, absolutePath };
  }

  return null; // unknown action: do not guess, hand back to the host
}
