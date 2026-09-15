// F-035 — sandbox browser panel: the protocol-layer contract between the Neko transport and whatever
// draws the picture. Everything here is platform-neutral (spec §3–§7): a WebSocket, an RTCPeerConnection
// and a set of X11 input events. The React panel is one consumer; an iOS / Android client would implement
// the same contract against the same server.
//
// What is deliberately *not* here: screen-coordinate conversion and keyboard binding. Both need a DOM node
// (`HTMLVideoElement.videoWidth`, an element to `listenTo`), so they live in `@asgard-js/react` — see
// spec §8.1 and FRONTEND_RULE_COMMON §1.6.

/**
 * Connection credentials from `POST …/sandbox/{name}/browser/session`.
 *
 * The token is **Neko's** session token, not Asgard's: it grants exactly what the user could already do
 * through the older open-url flow, and it dies with the sandbox pod. It is a separate field from `wsUrl`
 * rather than pre-baked into it — partly because the caller has to append it as a query parameter anyway
 * (browsers cannot set headers on a WebSocket), partly so the credential never ends up inside a string
 * that something else might log as a URL.
 */
export interface SandboxBrowserSessionCredentials {
  /** The Neko WebSocket endpoint, e.g. `wss://…/api/ws`. Carries no token. */
  wsUrl: string;
  /** Neko session token, appended by the transport as `?token=…`. */
  token: string;
}

/**
 * Who currently holds the remote keyboard and mouse.
 *
 * The only authority is the server's `control/host` event — never a local optimistic guess. A UI that
 * believes it has control when it does not is this panel's worst failure mode: the user clicks and types
 * at a picture while the server silently discards everything (spec §6 — a refused `control/request`
 * produces no client-visible error at all).
 *
 * - `me` — this session is the host.
 * - `agent` — somebody else is (the agent, or another person who took over).
 * - `none` — nobody holds it.
 */
export type BrowserHost = 'me' | 'agent' | 'none';

/** Where the connection is. `live` means media is flowing; it does **not** mean the picture has dimensions yet. */
export type BrowserStatus = 'idle' | 'connecting' | 'live' | 'error';

/** One pointer action, already converted to remote desktop coordinates by the caller. */
export interface RemotePointerEvent {
  type: 'move' | 'down' | 'up' | 'scroll';
  x: number;
  y: number;
  /** X11 button code — 1 left, 2 middle, 3 right (= JS `button + 1`). Present for `down` / `up`. */
  button?: number;
  /** Normalized scroll delta (see `normalizeWheel`). Present for `scroll`. */
  deltaX?: number;
  deltaY?: number;
}

/**
 * One key action.
 *
 * `down` / `up` carry a keysym the **caller** already computed, because turning a browser `KeyboardEvent`
 * into an X11 keysym is notoriously hard (cross-browser differences, keyboard layouts, modifier chords)
 * and is therefore delegated to Guacamole's keyboard in the react package. Core does not guess.
 *
 * `text` carries a string the IME already composed; the transport converts it to Unicode keysyms itself,
 * which is how CJK reaches a remote desktop that has no input method installed at all.
 */
export interface RemoteKeyEvent {
  type: 'down' | 'up' | 'text';
  /** For `down` / `up`: the X11 keysym, modifier remapping already applied. */
  keysym?: number;
  /** For `text`: the composed string. */
  text?: string;
}

/** A remote desktop coordinate, used for the cursor the server streams over the data channel. */
export interface RemoteCursorPosition {
  x: number;
  y: number;
}

/** Callbacks a transport reports into. All optional ones are genuinely optional — a headless consumer can skip them. */
export interface SandboxBrowserTransportHandlers {
  /** The media stream reached `ontrack`. */
  onStream: (stream: MediaStream) => void;
  /** Control changed hands. Fires with the server's view, including the initial one from `system/init`. */
  onHostChange: (host: BrowserHost) => void;
  /** Connection status moved; `detail` carries a human-readable reason for `error`. */
  onStatus: (status: BrowserStatus, detail?: string) => void;
  /**
   * Position of the remote **X11** pointer, over the data channel — the video stream deliberately omits
   * the cursor so position updates can outpace video encoding.
   *
   * Two consequences worth stating, because both look like bugs otherwise. The server does not send this
   * to whoever holds control (that person has a zero-latency local cursor already). And the agent does not
   * move the X11 pointer at all: it drives Chromium over CDP, whose input events are injected into the
   * renderer and never reach X11. So while the agent works, this never fires — what the user sees change
   * is the page content itself. This exists so that *another person* holding control has a visible pointer.
   */
  onRemoteCursor?: (position: RemoteCursorPosition | null) => void;
  /**
   * The remote clipboard changed. **Only the control holder receives this** — the server looks up the host
   * first and skips everyone else. A viewer seeing nothing here is the design, not a fault.
   */
  onClipboardChange?: (text: string) => void;
  /**
   * Every WebSocket frame, both directions — for diagnostics harnesses (the neko lab page). `control/move`
   * is excluded by the transport because its volume drowns out everything else.
   */
  onWire?: (direction: 'send' | 'recv', event: string, payload?: unknown) => void;
}

/** An established connection. Unusable once `close()` has been called. */
export interface SandboxBrowserSession {
  /** Ask to take over. The server answers with `control/host` — or, if it refuses, with nothing at all. */
  requestControl: () => void;
  /** Give control back. */
  releaseControl: () => void;
  sendPointer: (event: RemotePointerEvent) => void;
  sendKey: (event: RemoteKeyEvent) => void;
  /**
   * Write the local clipboard into the **remote** clipboard without pasting anything. Needed so the remote
   * page's own paste affordances (its right-click menu, its JavaScript) have something to read — not just
   * the one chord we can intercept. Requires control; the server rejects it silently otherwise.
   */
  setClipboard: (text: string) => void;
  /**
   * Have the remote perform a paste: the server sets the clipboard and synthesizes Ctrl+V **itself**.
   *
   * Going through the server rather than forwarding the user's ⌘V sidesteps two separate problems at once —
   * the macOS Meta↔Control remap, and the browser swallowing a chorded character before `input` fires. It
   * is also the only route that works in an iOS / Android WebView, where physical key interception is not
   * reliable.
   */
  paste: (text: string) => void;
  /** Tear down: heartbeat timer, peer connection, socket. */
  close: () => void;
}

/**
 * The seam between "draw the picture" and "carry the protocol".
 *
 * The panel holds one of these and knows nothing below it. The production implementation fetches session
 * credentials and negotiates WebRTC; a demo implementation can hand back a canvas `captureStream()`; the
 * neko lab swaps in a direct-login variant. Same component above all three, which is the check that this
 * line was drawn in the right place.
 */
export interface SandboxBrowserTransport {
  connect: (sandboxName: string, handlers: SandboxBrowserTransportHandlers) => Promise<SandboxBrowserSession>;
}
