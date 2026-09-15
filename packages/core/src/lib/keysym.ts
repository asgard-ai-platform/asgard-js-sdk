// F-035 — X11 keysym conversion and wheel normalization for the sandbox browser (spec §7.2 / §7.3 / §7.6).
//
// Everything here is pure arithmetic over numbers and plain objects, which is why it sits in core rather
// than in the panel: an iOS / Android client needs exactly the same table and the same three rules.
//
// The reason this is its own module rather than a handful of inline constants: every mistake in it is
// **silent**. A wrong keysym does not raise anything — the remote just does nothing, or types something
// else, and there is no way to work backwards from that symptom. The values below are not derived from
// documentation; they were measured against a real Neko container.

/**
 * X11 keysyms for the keys that have no arithmetic rule — function keys, navigation, modifiers.
 *
 * Printable characters are **not** in here; they follow the two rules in `charToKeysym`. F5 and F12 are
 * listed because driving a remote browser genuinely uses them.
 */
export const KEYSYM: Readonly<Record<string, number>> = {
  Backspace: 0xff08,
  Tab: 0xff09,
  Enter: 0xff0d,
  Escape: 0xff1b,
  Delete: 0xffff,
  Home: 0xff50,
  ArrowLeft: 0xff51,
  ArrowUp: 0xff52,
  ArrowRight: 0xff53,
  ArrowDown: 0xff54,
  PageUp: 0xff55,
  PageDown: 0xff56,
  End: 0xff57,
  Insert: 0xff63,
  F1: 0xffbe,
  F2: 0xffbf,
  F3: 0xffc0,
  F4: 0xffc1,
  F5: 0xffc2,
  F6: 0xffc3,
  F7: 0xffc4,
  F8: 0xffc5,
  F9: 0xffc6,
  F10: 0xffc7,
  F11: 0xffc8,
  F12: 0xffc9,
  Shift: 0xffe1,
  Control: 0xffe3,
  CapsLock: 0xffe5,
  Alt: 0xffe9,
  Meta: 0xffeb,
  ContextMenu: 0xff67,
  ' ': 0x0020,
} as const;

/** The modifier keysyms the macOS remap reads and writes. Named so the mapping below is legible. */
export const XK = {
  ISO_Level3_Shift: 0xfe03,
  Shift_L: 0xffe1,
  Mode_switch: 0xff7e,
  Control_L: 0xffe3,
  Meta_L: 0xffe7,
  Alt_L: 0xffe9,
  Alt_R: 0xffea,
  Super_L: 0xffeb,
  Super_R: 0xffec,
} as const;

/** Unicode keysyms start here: a code point above 0xFF is offset into this block. */
const UNICODE_KEYSYM_OFFSET = 0x01000000;

/**
 * One character → one keysym. Two rules, no table:
 *
 * 1. At or below `0xFF`, the keysym *is* the code point (ASCII and Latin-1 line up by design).
 * 2. Above it, `codePoint | 0x01000000`.
 *
 * Rule 2 is why **the remote needs no input method installed**: its `XKey()` hands an unknown keysym to
 * `XkbAddKeyKeysym`, which allocates an empty keycode for it on the spot. Whether the character exists in
 * the remote keyboard layout is simply not a question that gets asked.
 */
export function charToKeysym(character: string): number {
  const codePoint = character.codePointAt(0) ?? 0;

  return codePoint > 0xff ? codePoint | UNICODE_KEYSYM_OFFSET : codePoint;
}

/**
 * A `KeyboardEvent.key` value → keysym, or `null` when there is no answer.
 *
 * Returning `null` rather than a fallback is deliberate: a guessed keysym is indistinguishable from a
 * correct one until the remote does the wrong thing. Callers should surface the unmapped key (the lab page
 * lists them) instead of sending something plausible.
 */
export function keyToKeysym(key: string): number | null {
  if (key in KEYSYM) return KEYSYM[key];

  // `key.length === 1` is a UTF-16 unit test, so it deliberately excludes astral characters; those arrive
  // through the IME text path, not as a single `keydown`.
  if (key.length === 1) return charToKeysym(key);

  return null;
}

/**
 * Whether a keysym denotes something that turns into text.
 *
 * The distinction drives routing, not display: printable characters must travel the IME text path (it is
 * the only one that can handle composition), while the keysym path carries modifiers and function keys.
 */
export function isPrintableKeysym(keysym: number): boolean {
  return (keysym >= 0x20 && keysym <= 0x7e) || keysym >= UNICODE_KEYSYM_OFFSET;
}

/** Whether this platform's keyboard needs the macOS modifier remap. Read lazily so core stays SSR-safe. */
function isMacOSKeyboard(): boolean {
  if (typeof navigator === 'undefined') return false;

  // `navigator.platform` is deprecated but remains the only reliable signal here: `userAgentData.platform`
  // is not available in Safari or Firefox, which is exactly where this has to be right.
  const platform = navigator.platform || '';

  return /(Mac|iPhone|iPod|iPad)/i.test(platform);
}

/**
 * Remap a modifier keysym for the remote's X11 expectations. Identity on every non-macOS platform.
 *
 * The one that matters is **⌘ (`Meta_L`) → `Control_L`**: without it, ⌘A and ⌘C do nothing at all on the
 * remote, because the Chromium over there is waiting for Ctrl. The full table is copied from the upstream
 * neko client, which in turn credits noVNC / RealVNC / TigerVNC — it is what this class of client does, not
 * a preference.
 */
export function mapModifierKeysym(keysym: number, macOS: boolean = isMacOSKeyboard()): number {
  if (!macOS) return keysym;

  switch (keysym) {
    case XK.Meta_L:
      return XK.Control_L;
    case XK.Super_L:
      return XK.Alt_L;
    case XK.Super_R:
      return XK.Super_L;
    case XK.Alt_L:
      return XK.Mode_switch;
    case XK.Alt_R:
      return XK.ISO_Level3_Shift;
    default:
      return keysym;
  }
}

/**
 * Firefox reports the wheel in lines (`deltaMode === 1`) where Chrome reports pixels. The same flick is
 * `100` in one and `3` in the other — a factor of thirty. 19 px per line is the upstream neko value.
 */
const WHEEL_LINE_HEIGHT = 19;

/**
 * Ceiling on how many X11 scroll clicks one wheel event may become.
 *
 * **Not a sensitivity tuning knob.** The server loops `for (i < abs(delta))` and emits one XTest event per
 * iteration, so forwarding Chrome's `deltaY = 100` verbatim tells the remote to scroll one hundred times.
 * 10 is the upstream default.
 */
export const WHEEL_MAX = 10;

/** Upstream's wheel throttle window, in milliseconds. Exported so the panel throttles to the same figure. */
export const WHEEL_THROTTLE_MS = 100;

/** The parts of a `WheelEvent` this conversion needs. Structural, so core never names a DOM type. */
export interface WheelDelta {
  deltaX: number;
  deltaY: number;
  /** 0 = pixels, 1 = lines, 2 = pages. */
  deltaMode: number;
}

/**
 * Browser wheel deltas → remote scroll deltas.
 *
 * **The sign flips.** A browser's `deltaY > 0` means "content moves down"; X11's positive direction is
 * button 4, which is *up*. The two conventions are opposites. Upstream neko exposes this as a
 * `scroll_invert` *setting*, which makes it look like taste — but its default is `true`, i.e. everybody is
 * running the inverted value, because the un-inverted one is simply wrong.
 */
export function normalizeWheel(event: WheelDelta): { x: number; y: number } {
  const scale = event.deltaMode === 0 ? 1 : WHEEL_LINE_HEIGHT;
  // `|| 0` collapses the `-0` that negating a zero delta produces. It makes no difference on the wire
  // (JSON renders both as `0`), but it keeps the output canonical so equality checks mean what they look like.
  const clamp = (value: number): number => Math.max(-WHEEL_MAX, Math.min(WHEEL_MAX, -value * scale)) || 0;

  return { x: clamp(event.deltaX), y: clamp(event.deltaY) };
}
