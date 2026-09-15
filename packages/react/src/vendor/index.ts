// F-035 — the typed entry point to the vendored Guacamole keyboard.
//
// Why vendored rather than an npm dependency: the react build externalizes only four modules
// (`react`, `react-dom`, `react/jsx-runtime`, `@asgard-js/core`, `streamdown`), so anything else is
// bundled into `dist`. `guacamole-common-js` is a namespace-style bundle carrying the whole Guacamole
// client — Client, Tunnel, Display, Audio, InputStream — and tree-shaking does not reliably take it apart.
// Shipping all of that so one consumer can translate keystrokes is not a trade worth making; the official
// neko client vendors the same file for the same reason.
//
// Why not write our own: turning a browser `KeyboardEvent` into an X11 keysym is notoriously hard —
// cross-browser differences, keyboard layouts, modifier chords — and every mistake is silent (spec §7.2).
// The upstream file also gives us `reset()`, which is precisely the stuck-key remedy §7.5 needs.
//
// The `.js` beside this file is upstream Apache-2.0 source, carried verbatim and exempted from lint and
// prettier so it can still be diffed against upstream. Its types are hand-written in the sibling `.d.ts`.
import GuacamoleKeyboard from './guacamole-keyboard.js';
import type { GuacamoleKeyboardInterface } from './guacamole-keyboard.js';

export type { GuacamoleKeyboardInterface, GuacamoleModifierState } from './guacamole-keyboard.js';

/**
 * Build a keyboard instance.
 *
 * Upstream's export is written to be invoked with a `this` to populate, so it is bound to a fresh object
 * rather than called plainly.
 */
export function createGuacamoleKeyboard(element?: Element): GuacamoleKeyboardInterface {
  const keyboard = {};

  GuacamoleKeyboard.bind(keyboard, element)();

  return keyboard as GuacamoleKeyboardInterface;
}
