import { describe, expect, it } from 'vitest';
import {
  charToKeysym,
  isPrintableKeysym,
  keyToKeysym,
  KEYSYM,
  mapModifierKeysym,
  normalizeWheel,
  WHEEL_MAX,
  XK,
} from './keysym';

// F-035 — spec §7.2 / §7.3 / §7.6. Every assertion here stands in for a failure that produces no error at
// all: a wrong keysym makes the remote do nothing or type something else, and an un-inverted scroll delta
// makes the page run the wrong way. None of it can be caught downstream, so it is caught here.

describe('charToKeysym (spec §7.2 rules 1 and 2)', () => {
  it.each([
    ['a', 0x61],
    ['A', 0x41],
    ['0', 0x30],
    [' ', 0x20],
    ['~', 0x7e],
  ])('maps the ASCII character %s to its own code point', (character, expected) => {
    expect(charToKeysym(character)).toBe(expected);
  });

  // ÿ is U+00FF — the last code point that stays bare. One above it the Unicode offset starts.
  it('leaves the boundary at 0xFF bare and offsets everything above it', () => {
    expect(charToKeysym('ÿ')).toBe(0xff);
    expect(charToKeysym('Ā')).toBe(0x0100 | 0x01000000);
  });

  // This is the rule that makes CJK work without any input method on the remote: its XKey() allocates a
  // keycode for an unknown keysym on the spot.
  it.each([
    ['你', 0x01000000 | 0x4f60],
    ['好', 0x01000000 | 0x597d],
    ['あ', 0x01000000 | 0x3042],
  ])('offsets the CJK character %s into the Unicode keysym block', (character, expected) => {
    expect(charToKeysym(character)).toBe(expected);
  });

  // codePointAt, not charCodeAt: an astral character must not be split into two meaningless keysyms.
  it('reads a full code point rather than a surrogate half', () => {
    expect(charToKeysym('😀')).toBe(0x01000000 | 0x1f600);
  });
});

describe('keyToKeysym', () => {
  it.each([
    ['Enter', 0xff0d],
    ['Escape', 0xff1b],
    ['Backspace', 0xff08],
    ['Tab', 0xff09],
    ['ArrowUp', 0xff52],
    ['F5', 0xffc2],
    ['F12', 0xffc9],
    [' ', 0x0020],
  ])('resolves the named key %s from the table', (key, expected) => {
    expect(keyToKeysym(key)).toBe(expected);
  });

  it('falls through to the character rule for a single printable key', () => {
    expect(keyToKeysym('k')).toBe(0x6b);
    expect(keyToKeysym('中')).toBe(0x01000000 | 0x4e2d);
  });

  // A guessed keysym is indistinguishable from a correct one until the remote misbehaves, so an unknown
  // name must come back empty and be surfaced — never approximated.
  it.each(['Unidentified', 'Process', 'BrightnessUp', 'LaunchMail'])('returns null for the unmapped key %s', key => {
    expect(keyToKeysym(key)).toBeNull();
  });
});

describe('isPrintableKeysym', () => {
  it('accepts ASCII printables and the Unicode block, and rejects the function-key range', () => {
    expect(isPrintableKeysym(0x20)).toBe(true);
    expect(isPrintableKeysym(0x7e)).toBe(true);
    expect(isPrintableKeysym(0x01000000 | 0x4f60)).toBe(true);

    expect(isPrintableKeysym(0x1f)).toBe(false);
    expect(isPrintableKeysym(0x7f)).toBe(false);
    expect(isPrintableKeysym(KEYSYM.Enter)).toBe(false);
    expect(isPrintableKeysym(KEYSYM.F5)).toBe(false);
    expect(isPrintableKeysym(XK.Control_L)).toBe(false);
  });
});

describe('mapModifierKeysym (spec §7.3)', () => {
  // Without this one line, ⌘A / ⌘C do nothing on the remote: its Chromium is waiting for Ctrl.
  it.each([
    ['Meta_L → Control_L', XK.Meta_L, XK.Control_L],
    ['Super_L → Alt_L', XK.Super_L, XK.Alt_L],
    ['Super_R → Super_L', XK.Super_R, XK.Super_L],
    ['Alt_L → Mode_switch', XK.Alt_L, XK.Mode_switch],
    ['Alt_R → ISO_Level3_Shift', XK.Alt_R, XK.ISO_Level3_Shift],
  ])('on macOS remaps %s', (_label, input, expected) => {
    expect(mapModifierKeysym(input, true)).toBe(expected);
  });

  it('leaves non-modifier keysyms alone on macOS', () => {
    expect(mapModifierKeysym(charToKeysym('a'), true)).toBe(0x61);
    expect(mapModifierKeysym(KEYSYM.Enter, true)).toBe(KEYSYM.Enter);
  });

  it('is the identity function off macOS', () => {
    for (const keysym of [XK.Meta_L, XK.Super_L, XK.Super_R, XK.Alt_L, XK.Alt_R, KEYSYM.Enter]) {
      expect(mapModifierKeysym(keysym, false)).toBe(keysym);
    }
  });
});

describe('normalizeWheel (spec §7.6)', () => {
  // The browser's positive Y is "content down"; X11's positive is button 4, which is up.
  it('inverts both axes', () => {
    expect(normalizeWheel({ deltaX: 4, deltaY: 6, deltaMode: 0 })).toEqual({ x: -4, y: -6 });
    expect(normalizeWheel({ deltaX: -4, deltaY: -6, deltaMode: 0 })).toEqual({ x: 4, y: 6 });
  });

  // The server emits one XTest event per unit, so an unclamped Chrome flick is a hundred scroll clicks.
  it('clamps to ±WHEEL_MAX so one flick is not a hundred scroll clicks', () => {
    expect(normalizeWheel({ deltaX: 0, deltaY: 100, deltaMode: 0 })).toEqual({ x: 0, y: -WHEEL_MAX });
    expect(normalizeWheel({ deltaX: 0, deltaY: -100, deltaMode: 0 })).toEqual({ x: 0, y: WHEEL_MAX });
  });

  // Firefox reports lines, Chrome reports pixels; the same gesture is 3 vs 100 without this conversion.
  it('converts line-mode deltas to pixels before clamping', () => {
    // 3 lines × 19 px = 57 px, which then clamps — the same outcome as Chrome's 100, which is the point.
    expect(normalizeWheel({ deltaX: 0, deltaY: 3, deltaMode: 1 })).toEqual({ x: 0, y: -WHEEL_MAX });
    // A small line delta still survives conversion rather than rounding away to nothing. Compared loosely
    // because 0.2 × 19 lands on 3.8000000000000003 in binary floating point.
    expect(normalizeWheel({ deltaX: 0, deltaY: 0.2, deltaMode: 1 }).y).toBeCloseTo(-3.8, 10);
  });

  it('treats page mode like line mode rather than passing it through raw', () => {
    expect(normalizeWheel({ deltaX: 0, deltaY: 1, deltaMode: 2 })).toEqual({ x: 0, y: -WHEEL_MAX });
  });

  it('passes zero through unchanged', () => {
    expect(normalizeWheel({ deltaX: 0, deltaY: 0, deltaMode: 0 })).toEqual({ x: 0, y: 0 });
  });
});
