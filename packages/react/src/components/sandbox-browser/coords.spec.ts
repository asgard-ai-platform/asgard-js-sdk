import { describe, expect, it } from 'vitest';
import { fromRemoteCoords, toRemoteCoords, type VideoGeometry } from './coords';

// F-035 — spec §7.1. Coordinate conversion is the single highest-value thing to unit-test in this panel:
// every way of getting it wrong produces clicks that land somewhere plausible but wrong, with no error.

/** A 1280×720 stream shown in `width`×`height`, positioned at `left`/`top`. */
function video(width: number, height: number, left = 0, top = 0, vw = 1280, vh = 720): VideoGeometry {
  return {
    videoWidth: vw,
    videoHeight: vh,
    getBoundingClientRect: () => ({ left, top, width, height }),
  };
}

describe('toRemoteCoords', () => {
  it('maps a point one-to-one when the element matches the stream exactly', () => {
    expect(toRemoteCoords(video(1280, 720), 100, 200)).toEqual({ x: 100, y: 200 });
  });

  it('scales when the element is smaller but the same aspect ratio', () => {
    // 640×360 is exactly half of 1280×720.
    expect(toRemoteCoords(video(640, 360), 100, 100)).toEqual({ x: 200, y: 200 });
  });

  it('accounts for the element being offset in the page', () => {
    expect(toRemoteCoords(video(1280, 720, 50, 30), 150, 130)).toEqual({ x: 100, y: 100 });
  });

  // The whole point of the module. A container taller than 16:9 puts bars top and bottom; converting
  // against the element's height instead of the letterboxed picture shifts everything down.
  it('subtracts the vertical letterbox offset when the container is too tall', () => {
    // 1280×900 container: scale 1, picture 1280×720 centred → 90px bar top and bottom.
    const el = video(1280, 900);

    expect(toRemoteCoords(el, 0, 90)).toEqual({ x: 0, y: 0 });
    expect(toRemoteCoords(el, 640, 450)).toEqual({ x: 640, y: 360 });
    expect(toRemoteCoords(el, 1280, 810)).toEqual({ x: 1280, y: 720 });
  });

  it('subtracts the horizontal letterbox offset when the container is too wide', () => {
    // 1600×720 container: scale 1, picture 1280 wide centred → 160px bar each side.
    const el = video(1600, 720);

    expect(toRemoteCoords(el, 160, 0)).toEqual({ x: 0, y: 0 });
    expect(toRemoteCoords(el, 1440, 720)).toEqual({ x: 1280, y: 720 });
  });

  // A click on a black bar is not a click on the remote screen; forwarding it would put the pointer
  // somewhere the user did not aim.
  it.each([
    ['above the picture', 640, 10],
    ['below the picture', 640, 890],
    ['left of a pillarboxed picture', 10, 360],
  ])('returns null for a point %s', (_label, x, y) => {
    const tall = video(1280, 900);
    const wide = video(1600, 720);
    const el = _label.includes('pillarboxed') ? wide : tall;

    expect(toRemoteCoords(el, x, y)).toBeNull();
  });

  // The extreme values inside the picture are real positions and must survive — clamping them away would
  // make the last row and column of the remote screen unreachable.
  it('keeps the exact corners of the picture rather than clamping them out', () => {
    const el = video(1280, 900);

    expect(toRemoteCoords(el, 0, 90)).toEqual({ x: 0, y: 0 });
    expect(toRemoteCoords(el, 1280, 810)).toEqual({ x: 1280, y: 720 });
  });

  // `live` precedes non-zero dimensions by about a second, measured against a real container. Converting
  // during that window is how the first click after takeover gets silently dropped.
  it('returns null while the picture has no dimensions yet, instead of inventing a coordinate', () => {
    expect(toRemoteCoords(video(1280, 720, 0, 0, 0, 0), 100, 100)).toBeNull();
  });

  // Every comparison against NaN is false, so the range check alone lets it straight through — and the
  // remote reads the resulting `null` as the origin, moving the pointer to the top-left corner.
  it.each([
    ['clientX', Number.NaN, 100],
    ['clientY', 100, Number.NaN],
    ['both', Number.NaN, Number.NaN],
  ])('returns null when %s is not a number', (_label, x, y) => {
    expect(toRemoteCoords(video(1280, 720), x, y)).toBeNull();
  });

  it('returns null for an infinite coordinate', () => {
    expect(toRemoteCoords(video(1280, 720), Number.POSITIVE_INFINITY, 100)).toBeNull();
  });

  it('returns null when the element itself has not been laid out', () => {
    expect(toRemoteCoords(video(0, 0), 100, 100)).toBeNull();
  });

  it('rounds to whole pixels — X11 has no sub-pixel pointer', () => {
    // 1281 wide for a 1280 stream: scale 1280/1281, so 100 maps just off a whole number.
    const result = toRemoteCoords(video(1281, 721), 100, 100);

    expect(Number.isInteger(result?.x)).toBe(true);
    expect(Number.isInteger(result?.y)).toBe(true);
  });
});

describe('fromRemoteCoords', () => {
  it('is the inverse of toRemoteCoords, offsets included', () => {
    const el = video(1280, 900, 50, 30);
    const remote = toRemoteCoords(el, 150, 200);
    const back = fromRemoteCoords(el, remote?.x ?? 0, remote?.y ?? 0);

    // toRemoteCoords works in client space, fromRemoteCoords in element space — so the element's own
    // left/top is the difference between the two.
    expect(back).toEqual({ left: 150 - 50, top: 200 - 30 });
  });

  it('places the remote origin at the top-left of the picture, not of the element', () => {
    expect(fromRemoteCoords(video(1280, 900), 0, 0)).toEqual({ left: 0, top: 90 });
    expect(fromRemoteCoords(video(1600, 720), 0, 0)).toEqual({ left: 160, top: 0 });
  });

  it('returns null while the picture has no dimensions', () => {
    expect(fromRemoteCoords(video(1280, 720, 0, 0, 0, 0), 10, 10)).toBeNull();
  });

  // If the two directions ever disagreed, the drawn remote cursor would sit somewhere other than where a
  // click at the same point lands — and nothing would report an error.
  it('round-trips every corner of the picture', () => {
    const el = video(640, 480); // scale 0.5, 60px bars top and bottom

    for (const [x, y] of [
      [0, 0],
      [1280, 0],
      [0, 720],
      [1280, 720],
      [640, 360],
    ]) {
      const at = fromRemoteCoords(el, x, y);
      const back = toRemoteCoords(el, (at?.left ?? 0) + 0, (at?.top ?? 0) + 0);

      expect(back).toEqual({ x, y });
    }
  });
});
