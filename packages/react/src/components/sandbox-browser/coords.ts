// F-035 — letterbox coordinate conversion between the client's pointer and the remote desktop (spec §7.1).
//
// This lives in `@asgard-js/react` rather than in core because it reads `HTMLVideoElement.videoWidth` and
// `getBoundingClientRect()`; core stays DOM-free (FRONTEND_RULE_COMMON §1.6).
//
// **The intrinsic size is the basis, never the displayed size.** `object-fit: contain` leaves black bars
// whenever the stream's aspect ratio differs from the container's, and those bars are not part of the
// remote picture. Converting against the element's rendered box shifts every coordinate, by an amount that
// changes as the container resizes — the symptom is "clicks land close but always a bit off", which almost
// nobody traces back to coordinate conversion.

/** A point on the remote desktop. */
export interface RemotePoint {
  x: number;
  y: number;
}

/** A position inside the video element's own box, for drawing overlays on top of it. */
export interface ElementPoint {
  left: number;
  top: number;
}

/** The parts of a video element this module reads. Structural, so tests need no real DOM element. */
export interface VideoGeometry {
  videoWidth: number;
  videoHeight: number;
  getBoundingClientRect: () => { left: number; top: number; width: number; height: number };
}

/** Shared letterbox solution — both directions must use the same numbers or the two disagree. */
function letterbox(
  video: VideoGeometry,
): { scale: number; offsetX: number; offsetY: number; rect: { left: number; top: number } } | null {
  const { videoWidth, videoHeight } = video;
  // Zero until roughly a second after the stream goes live. Returning null here is what stops that first
  // second of clicks from being converted into nonsense — see `toRemoteCoords`.
  if (!videoWidth || !videoHeight) return null;

  const rect = video.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  // `contain` picks the smaller ratio; whatever is left over is black bar.
  const scale = Math.min(rect.width / videoWidth, rect.height / videoHeight);

  return {
    scale,
    offsetX: (rect.width - videoWidth * scale) / 2,
    offsetY: (rect.height - videoHeight * scale) / 2,
    rect,
  };
}

/**
 * Client coordinates → remote desktop coordinates.
 *
 * Returns `null` when the point should produce no event at all — either the picture has no dimensions yet,
 * or the pointer is over a black bar, which is outside the remote screen.
 *
 * The null-on-no-dimensions case is worth being explicit about: the stream reports `live` at `ontrack`, but
 * `videoWidth` stays 0 for about a second after that (measured against a real container). Every click in
 * that window converts to `null` and is dropped with no error and no log line — long enough that a user
 * clicks, decides it is broken, and clicks again. The panel's fix is to gate interactivity on dimensions
 * rather than on `live`; this function's job is simply never to invent a coordinate it cannot compute.
 */
export function toRemoteCoords(video: VideoGeometry, clientX: number, clientY: number): RemotePoint | null {
  const box = letterbox(video);
  if (!box) return null;

  const x = (clientX - box.rect.left - box.offsetX) / box.scale;
  const y = (clientY - box.rect.top - box.offsetY) / box.scale;

  // NaN has to be rejected explicitly, because the range check below cannot do it: every comparison against
  // NaN is false, so a NaN coordinate passes "inside the picture" and is forwarded. It then reaches the
  // remote as `Math.round(NaN)` → NaN → `null` in JSON, and the server moves the pointer to the origin.
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  // Outside the picture — a black bar, or past an edge. Sending this would be a click the remote never got.
  if (x < 0 || y < 0 || x > video.videoWidth || y > video.videoHeight) return null;

  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * The inverse: remote desktop coordinates → a position inside the element, for drawing the remote cursor
 * and for placing the IME composition box.
 *
 * Deliberately paired with {@link toRemoteCoords} in one file sharing one `letterbox()`: if the two ever
 * computed the offset differently, the drawn cursor would sit somewhere other than where a click lands, and
 * nothing would report an error.
 */
export function fromRemoteCoords(video: VideoGeometry, x: number, y: number): ElementPoint | null {
  const box = letterbox(video);
  if (!box) return null;

  return { left: box.offsetX + x * box.scale, top: box.offsetY + y * box.scale };
}
