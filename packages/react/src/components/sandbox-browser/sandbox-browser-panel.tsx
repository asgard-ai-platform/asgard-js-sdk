import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  isPrintableKeysym,
  mapModifierKeysym,
  normalizeWheel,
  WHEEL_THROTTLE_MS,
  type BrowserHost,
  type BrowserStatus,
  type LaunchedSandbox,
  type RemotePointerEvent,
  type SandboxBrowserSession,
  type SandboxBrowserTransport,
} from '@asgard-js/core';

import { t, type Locale } from '../../i18n';
import { createGuacamoleKeyboard, type GuacamoleKeyboardInterface } from '../../vendor';
import { ClipboardPasteIcon, EyeIcon, CircleAlertIcon, RefreshIcon, XIcon } from '../file-explorer/icons';
import { GlobeIcon, LoaderIcon, MaximizeIcon, MousePointerIcon, RemoteCursorGlyph } from './icons';
import { fromRemoteCoords, toRemoteCoords } from './coords';
import type { SandboxBrowserController } from '../../hooks/use-sandbox-browser-controller';
import styles from './sandbox-browser-panel.module.scss';

// F-035 — watch the agent drive a browser, and take it over when it gets stuck (login, 2FA, captcha).
//
// Almost everything hard about this component is input forwarding, and per spec §7 hardly any of its
// failure modes raise an error — they just make the remote do nothing, or the wrong thing, in a way that is
// very difficult to reason backwards from. Each one is commented at the line that prevents it, with the
// symptom it produces. The spec's §7.9 table indexes them by symptom.
//
// Control ownership lives here rather than in the controller on purpose: it is connection state, and the
// server is its only authority (see the header of `use-sandbox-browser-controller.ts`).

/** How long to wait for `control/host` after asking, before telling the user nothing came back. */
const CONTROL_REQUEST_TIMEOUT_MS = 4_000;

/** Inner padding + caret room added to the measured pre-edit width. */
const PREEDIT_PADDING_PX = 22;

export interface SandboxBrowserPanelProps {
  /** Live sandboxes (from `useLaunchedSandboxes`); only `browserEnabled` ones can be shown. */
  sandboxes: LaunchedSandbox[];
  controller: SandboxBrowserController;
  /** Where the picture and the protocol come from. See `SandboxBrowserTransport` in `@asgard-js/core`. */
  transport: SandboxBrowserTransport;
  /** Given, a close button appears (the built-in aside passes `controller.closeBrowser`). */
  onClose?: () => void;
  /** `card` = standalone, placed by the consumer; `flush` = the aside split into the chat view. */
  chrome?: 'card' | 'flush';
  locale?: Locale;
  /** Diagnostics hook — the neko lab renders these as a log. Never required for the panel to work. */
  onLog?: (line: string) => void;
}

/** The pointer fields both a React synthetic event and a native one carry. */
interface PointerLike {
  clientX: number;
  clientY: number;
}

/** Same, plus the wheel fields. Structural so the native listener and the React handler share one path. */
interface WheelLike extends PointerLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
}

/** Is a printable character being typed as part of a command rather than as text? Shift does not count. */
function isChord(modifiers: GuacamoleKeyboardInterface['modifiers']): boolean {
  return modifiers.ctrl || modifiers.alt || modifiers.meta || modifiers.hyper;
}

/** ⌘V / Ctrl+V. 0x76 = 'v', 0x56 = 'V' (Shift held). */
function isPasteChord(keysym: number, modifiers: GuacamoleKeyboardInterface['modifiers']): boolean {
  return (modifiers.ctrl || modifiers.meta) && (keysym === 0x76 || keysym === 0x56);
}

/** Can the page plausibly read the local clipboard? A definite no is cheap; the real answer is to try. */
function clipboardReadPlausible(): boolean {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return false;

  if (typeof navigator.clipboard.readText !== 'function') return false;

  if (typeof window !== 'undefined' && !window.isSecureContext) return false;

  return true;
}

function clipboardWritePlausible(): boolean {
  return (
    typeof navigator !== 'undefined' && !!navigator.clipboard && typeof navigator.clipboard.writeText === 'function'
  );
}

/**
 * Where to put the composition box, and how wide.
 *
 * The width is **measured**, never counted in characters. `1ch` is the width of a zero, while bopomofo and
 * Han glyphs are full-width — roughly double — so a `${length}ch` box comes out about half the size it
 * needs and `overflow: hidden` clips the text, which is no better than not showing it at all.
 */
function preeditBox(at: { left: number; top: number }, textWidth: number, frameWidth: number): CSSProperties {
  const width = Math.ceil(textWidth) + PREEDIT_PADDING_PX;
  // Pull it back inside rather than letting it hang off the right edge.
  const maxLeft = frameWidth ? Math.max(4, frameWidth - width - 4) : Number.POSITIVE_INFINITY;

  return { left: Math.min(Math.max(4, at.left), maxLeft), top: Math.max(4, at.top + 6), width };
}

export function SandboxBrowserPanel({
  sandboxes,
  controller,
  transport,
  onClose,
  chrome = 'card',
  locale = 'en-US',
  onLog,
}: SandboxBrowserPanelProps): ReactNode {
  const browsable = sandboxes.filter(sandbox => sandbox.browserEnabled);
  const active =
    browsable.find(sandbox => sandbox.sandboxName === controller.activeSandboxName) ?? browsable[0] ?? null;

  const [status, setStatus] = useState<BrowserStatus>('idle');
  const [detail, setDetail] = useState<string | undefined>();
  const [host, setHost] = useState<BrowserHost>('none');
  const [remoteCursor, setRemoteCursor] = useState<{ x: number; y: number } | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [awaitingControl, setAwaitingControl] = useState(false);
  const [controlTimedOut, setControlTimedOut] = useState(false);

  // `status === 'live'` is not the same as "you can click on it". `live` is set at `ontrack`, but
  // `videoWidth` stays 0 for about a second after that (measured against a real container) and every
  // coordinate conversion returns null until it is not — so clicks in that window are dropped with no
  // error and no log line. Long enough that a user clicks, concludes it is broken, and clicks again.
  const [videoReady, setVideoReady] = useState(false);

  // onLog goes through a ref and must never appear in a dependency array. Consumers routinely pass a
  // function rebuilt on every render (the lab writes into state), which would rebuild `releaseAll`, which
  // would re-run the effect below, whose cleanup sends releases — so a `buttondown` would be cancelled by
  // its own cleanup microseconds later. The symptom is "mouse clicks are not sent", with nothing in error.
  const onLogRef = useRef(onLog);
  useEffect(() => {
    onLogRef.current = onLog;
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const imeRef = useRef<HTMLTextAreaElement | null>(null);
  const sessionRef = useRef<SandboxBrowserSession | null>(null);

  const [pasteFallbackOpen, setPasteFallbackOpen] = useState(false);
  const pasteFallbackRef = useRef<HTMLTextAreaElement | null>(null);
  // The last content both sides agree on. Written by both directions, and its job is to break the feedback
  // loop: without it, a remote update written to the local clipboard is read back on the next sync and
  // pushed to the remote again, forever.
  const lastSyncedClipboard = useRef<string | null>(null);

  const selectSandbox = controller.selectSandbox;
  const activeName = active?.sandboxName ?? null;

  // Write the fallback choice back so the controller and the panel agree on what is being shown.
  useEffect(() => {
    if (!controller.activeSandboxName && activeName) selectSandbox(activeName);
  }, [controller.activeSandboxName, activeName, selectSandbox]);

  // --- connection lifecycle ---
  const requestedNonce = controller.requestedBrowser?.nonce ?? 0;
  useEffect(() => {
    if (!activeName) return;

    let disposed = false;

    setStatus('connecting');
    setDetail(undefined);
    setHost('none');
    setVideoReady(false);
    setAwaitingControl(false);
    setControlTimedOut(false);

    transport
      .connect(activeName, {
        onStream: stream => {
          if (disposed) return;

          if (videoRef.current) videoRef.current.srcObject = stream;
        },
        onHostChange: next => {
          if (disposed) return;

          setHost(next);
          setAwaitingControl(false);
          setControlTimedOut(false);
        },
        onRemoteCursor: position => !disposed && setRemoteCursor(position),
        onClipboardChange: text => {
          if (disposed) return;

          // Record before writing: even a failed write means the remote already holds this text, so it
          // must not be pushed back on the next sync.
          lastSyncedClipboard.current = text;
          if (!clipboardWritePlausible()) return;

          void navigator.clipboard.writeText(text).then(
            () => onLogRef.current?.(`clipboard/updated → wrote ${text.length} chars to the local clipboard`),
            (error: unknown) =>
              onLogRef.current?.(
                `clipboard/updated → local write failed: ${error instanceof Error ? error.message : String(error)}`,
              ),
          );
        },
        onStatus: (next, nextDetail) => {
          if (disposed) return;

          setStatus(next);
          setDetail(nextDetail);
        },
        onWire: (direction, event) => onLogRef.current?.(`${direction} ${event}`),
      })
      .then(session => {
        if (disposed) {
          session.close();

          return;
        }

        sessionRef.current = session;
      })
      .catch((error: unknown) => {
        if (disposed) return;

        setStatus('error');
        setDetail(error instanceof Error ? error.message : String(error));
      });

    return (): void => {
      disposed = true;
      sessionRef.current?.close();
      sessionRef.current = null;
    };
  }, [activeName, requestedNonce, retryNonce, transport]);

  // Interactivity is gated on this, never on `status` alone — see `videoReady` above.
  const live = status === 'live' && videoReady;
  const controlling = host === 'me';

  // Guacamole's handlers are registered once and cannot close over `controlling`, or they would read its
  // first value forever.
  const controllingRef = useRef(false);
  useEffect(() => {
    controllingRef.current = controlling;
  }, [controlling]);

  const keyboardRef = useRef<GuacamoleKeyboardInterface | null>(null);
  const pressedButtons = useRef<Set<number>>(new Set());
  // The keysyms we have actually sent `down` for. Only these get a `keyup`.
  //
  // It cannot be derived from `isPrintableKeysym` instead: the same 'v' takes the text path alone and the
  // keysym path with ⌘ held, and the two `keyup` events are indistinguishable. Recording what we sent is
  // the only way to tell them apart — and it is also what makes a double-bound keyboard visible, since
  // unconditional keyups cancel out the duplication exactly.
  const sentKeys = useRef<Set<number>>(new Set());
  // Coordinates for a synthesized release. **Never (0, 0)** — see `releaseAll`.
  const lastPointer = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastWheelAt = useRef(0);
  const composing = useRef(false);

  const [imeAt, setImeAt] = useState<{ left: number; top: number } | null>(null);
  const [imeWidth, setImeWidth] = useState(0);

  /**
   * Release everything we are holding on the remote.
   *
   * Keys and mouse buttons are down/up pairs whose state lives in the remote X11 server, so a missed `up`
   * leaves it held indefinitely and every later input behaves strangely. The ways to miss one are all
   * ordinary: switching tabs, ⌘Tab, dragging past the edge of the picture — and on macOS, **holding ⌘
   * suppresses `keyup` for every other key**, which is the most common of all.
   */
  const releaseAll = useCallback((reason: string): void => {
    const session = sessionRef.current;
    if (!session) return;

    let released = 0;

    // Guacamole tracks what it is holding, and `reset()` fires `onkeyup` for each — so the keyups go out
    // through the normal path rather than needing a second implementation here.
    if (keyboardRef.current) {
      keyboardRef.current.reset();
      released += 1;
    }

    for (const button of pressedButtons.current) {
      // The **last known position**, not (0, 0). A buttonup at the origin reads to the remote as a drag
      // from wherever the button went down all the way to the top-left corner: the page ends up fully
      // selected and that click no longer counts as a click. Measured symptom — clicking the address bar
      // selected the whole page, after which typing went nowhere near the address bar.
      session.sendPointer({ type: 'up', x: lastPointer.current.x, y: lastPointer.current.y, button });
      released += 1;
    }

    pressedButtons.current.clear();
    if (released) onLogRef.current?.(`releaseAll(${reason}) → sent ${released} release(s)`);
  }, []);

  // --- clipboard ---
  // The local OS clipboard and the remote desktop's are two independent clipboards that never sync. ⌘V
  // only tells the remote to paste *its own* clipboard, which has nothing to do with what the user just
  // copied here. That is the single most common thing to be reported as "paste is broken".

  /** Read the local clipboard, or `null` when the browser will not allow it — which is common, not rare. */
  const readLocalClipboard = useCallback(async (): Promise<string | null> => {
    if (!clipboardReadPlausible()) return null;

    // A background tab is refused outright in Chrome and hangs in Firefox.
    if (typeof document !== 'undefined' && !document.hasFocus()) return null;

    try {
      return await navigator.clipboard.readText();
    } catch {
      return null;
    }
  }, []);

  /**
   * Push the local clipboard to the remote without pasting. Done on takeover and on pointer entry, so the
   * remote page's *own* paste affordances — its context menu, its JavaScript — have something to read,
   * rather than only the one chord we can intercept.
   */
  const syncClipboard = useCallback(async (): Promise<void> => {
    const session = sessionRef.current;
    if (!session || !controllingRef.current) return;

    const text = await readLocalClipboard();
    if (text == null || text === lastSyncedClipboard.current) return;

    lastSyncedClipboard.current = text;
    session.setClipboard(text);
    onLogRef.current?.(`clipboard/set → pushed ${text.length} chars to the remote clipboard`);
  }, [readLocalClipboard]);

  /** Paste: read locally, then have the **server** set its clipboard and synthesize Ctrl+V. */
  const doPaste = useCallback(async (): Promise<void> => {
    const session = sessionRef.current;
    if (!session || !controllingRef.current) return;

    const text = await readLocalClipboard();
    if (text == null) {
      // Not an error — it is what this environment does. Ask the user to paste it in by hand instead.
      setPasteFallbackOpen(true);
      onLogRef.current?.('clipboard unreadable → showing the manual paste field');

      return;
    }

    lastSyncedClipboard.current = text;
    session.paste(text);
    onLogRef.current?.(`control/paste → ${text.length} chars`);
  }, [readLocalClipboard]);

  const submitPasteFallback = useCallback((): void => {
    const text = pasteFallbackRef.current?.value ?? '';
    setPasteFallbackOpen(false);
    if (!text) return;

    lastSyncedClipboard.current = text;
    sessionRef.current?.paste(text);
    onLogRef.current?.(`control/paste → ${text.length} chars (manual field)`);
    imeRef.current?.focus({ preventScroll: true });
  }, []);

  // These two are called from effects and handlers with deliberately narrow dependency lists; naming them
  // directly would widen those lists and rebuild the very things that must not be rebuilt.
  const syncClipboardRef = useRef(syncClipboard);
  const doPasteRef = useRef(doPaste);
  useEffect(() => {
    syncClipboardRef.current = syncClipboard;
    doPasteRef.current = doPaste;
  });

  // Losing focus, hiding the tab, or unmounting all mean we will not see the matching `up`.
  useEffect(() => {
    if (!controlling) return;

    const onBlur = (): void => releaseAll('blur');
    const onVisibility = (): void => {
      if (document.hidden) releaseAll('visibilitychange');
    };

    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);

    return (): void => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      releaseAll('effect cleanup');
    };
  }, [controlling, releaseAll]);

  // Taking control focuses the sink and pushes the clipboard; losing it clears local held-key state, which
  // is meaningless once somebody else is driving.
  useEffect(() => {
    if (controlling) {
      imeRef.current?.focus({ preventScroll: true });
      void syncClipboardRef.current();

      return;
    }

    keyboardRef.current?.reset();
    pressedButtons.current.clear();
    sentKeys.current.clear();
  }, [controlling]);

  // The server does not answer a refused `control/request` at all — it logs on its own side and says
  // nothing (spec §6). Silence is therefore indistinguishable from "still thinking", so the only way the
  // user learns anything is a timeout here.
  useEffect(() => {
    if (!awaitingControl) return;

    const timer = setTimeout(() => {
      setAwaitingControl(false);
      setControlTimedOut(true);
    }, CONTROL_REQUEST_TIMEOUT_MS);

    return (): void => clearTimeout(timer);
  }, [awaitingControl]);

  // --- pointer ---
  const pointer = useCallback(
    (type: RemotePointerEvent['type'], event: PointerLike | WheelLike, button?: number): void => {
      const session = sessionRef.current;
      const video = videoRef.current;
      if (!session || !video || !controlling) return;

      const at = toRemoteCoords(video, event.clientX, event.clientY);
      if (!at) return; // a letterbox bar, or the picture has no size yet

      lastPointer.current = at;

      if (type === 'scroll') {
        // Throttled the way upstream does it. A trackpad emits hundreds of wheel events a second, and each
        // becomes up to WHEEL_MAX XTest events on the remote.
        const now = Date.now();
        if (now - lastWheelAt.current < WHEEL_THROTTLE_MS) return;

        lastWheelAt.current = now;
        const delta = normalizeWheel(event as WheelLike);
        session.sendPointer({ type, x: at.x, y: at.y, deltaX: delta.x, deltaY: delta.y });

        return;
      }

      session.sendPointer({ type, x: at.x, y: at.y, button });
    },
    [controlling],
  );

  /**
   * Claim the wheel while controlling — as a **native, non-passive listener**, not React's `onWheel`.
   *
   * React registers wheel at the root passively, so `preventDefault()` from a synthetic handler does
   * nothing. And not claiming it has a worse consequence than an unwanted page scroll: the browser treats
   * the gesture as unowned, latches it to the nearest scroll container and **stops delivering wheel events
   * to this element**, so scrolling the remote dies after a notch or two. Measured against a real
   * container — two notches through, then silence. Inside the built-in aside, which scrolls, the same
   * gesture would move the aside rather than the remote.
   *
   * While watching, the wheel is deliberately left alone: the surrounding page should scroll as usual.
   */
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !controlling) return;

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      pointer('scroll', event);
    };

    frame.addEventListener('wheel', onWheel, { passive: false });

    return (): void => frame.removeEventListener('wheel', onWheel);
  }, [controlling, pointer]);

  /**
   * Bind Guacamole to the sink. **A callback ref, never an effect.**
   *
   * Guacamole has `listenTo` and no unbind — upstream says so itself ("Guacamole Keyboard does not provide
   * destroy functions"). So listening to one element twice stacks two sets of listeners and sends every
   * keystroke twice, with nothing reported. Written as `useEffect(..., [status])` it bound three times, as
   * status walked idle → connecting → live: the remote received three `keydown`s and one `keyup`, Control
   * latched on, and from then on every key arrived as a Ctrl chord.
   *
   * A callback ref runs only when the node appears or disappears, so the number of bindings is the number
   * of nodes by construction.
   */
  const attachKeyboard = useCallback((sink: HTMLTextAreaElement | null): void => {
    imeRef.current = sink;

    if (!sink) {
      keyboardRef.current?.reset();
      keyboardRef.current = null;

      return;
    }

    if (keyboardRef.current) return;

    const keyboard = createGuacamoleKeyboard();
    keyboardRef.current = keyboard;

    keyboard.onkeydown = (keysym: number): boolean => {
      const session = sessionRef.current;
      if (!session || !controllingRef.current) return true;

      if (composing.current) return true; // mid-composition: the IME owns these

      const modifiers = keyboard.modifiers;

      // ⌘V / Ctrl+V is handled rather than forwarded: forwarding pastes the *remote's* clipboard, which is
      // not what the user copied. `control/paste` has the server do it from text we supply.
      if (isPasteChord(keysym, modifiers)) {
        queueMicrotask(() => keyboardRef.current?.release(keysym));
        void doPasteRef.current();

        return false;
      }

      if (isPrintableKeysym(keysym) && isChord(modifiers)) {
        // A printable character with Ctrl / Alt / ⌘ held **must** take the keysym path: the browser treats
        // it as a command and swallows it, so the sink's `input` event never fires and the whole chord —
        // ⌘A, ⌘C, ⌘X, ⌘Z — would vanish silently.
        //
        // Release it immediately afterwards. Guacamole suppresses key-repeat for modifiers only, so a held
        // ⌘L would otherwise repeat as Ctrl+L every 50ms.
        sentKeys.current.add(keysym);
        session.sendKey({ type: 'down', keysym: mapModifierKeysym(keysym) });
        queueMicrotask(() => keyboardRef.current?.release(keysym));

        return false;
      }

      if (isPrintableKeysym(keysym)) {
        // Let the browser deliver it to the sink so it takes the text path, which is the only one that can
        // handle composition. It still has to be released from Guacamole's held set: letting it through is
        // not the same as it no longer being tracked, and an untracked printable repeats. Measured symptom
        // — typing "example.com" arrived as "aaa" while flooding the log.
        queueMicrotask(() => keyboardRef.current?.release(keysym));

        return true;
      }

      // What is left is modifiers and function keys, which have no text form.
      sentKeys.current.add(keysym);
      session.sendKey({ type: 'down', keysym: mapModifierKeysym(keysym) });

      return false;
    };

    keyboard.onkeyup = (keysym: number): void => {
      const session = sessionRef.current;
      if (!session || !controllingRef.current) return;

      // Only keys we actually sent down for (`delete` returns false when it was not there).
      if (!sentKeys.current.delete(keysym)) return;

      session.sendKey({ type: 'up', keysym: mapModifierKeysym(keysym) });
    };

    keyboard.listenTo(sink);
  }, []);

  /** Measure the pre-edit in real pixels. See `preeditBox` for why characters do not work. */
  const measureCanvas = useRef<HTMLCanvasElement | null>(null);
  const measurePreedit = useCallback((text: string): number => {
    const sink = imeRef.current;
    if (!sink || !text) return 0;

    const canvas = (measureCanvas.current ??= document.createElement('canvas'));
    const context = canvas.getContext('2d');
    if (!context) return 0;

    const computed = getComputedStyle(sink);
    // Assembled piece by piece: Chrome returns an empty string for the `font` shorthand.
    context.font = `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;

    return context.measureText(text).width;
  }, []);

  const onCompositionStart = useCallback((): void => {
    composing.current = true;
    // During composition the physical keys are half-formed (`key === 'Process'`); clear Guacamole's state
    // so nothing is left held when composition ends.
    keyboardRef.current?.reset();

    // Move the sink to where the user last clicked before revealing it. That click is where they focused
    // the remote input field, and it is the best approximation available — the remote never reports its
    // own caret position.
    const video = videoRef.current;
    const at = video ? fromRemoteCoords(video, lastPointer.current.x, lastPointer.current.y) : null;
    setImeAt(at ?? { left: 12, top: 12 });
    setImeWidth(0);
  }, []);

  const onCompositionUpdate = useCallback(
    (event: React.CompositionEvent): void => setImeWidth(measurePreedit(event.data ?? '')),
    [measurePreedit],
  );

  const onCompositionEnd = useCallback((event: React.CompositionEvent): void => {
    composing.current = false;
    setImeAt(null);
    setImeWidth(0);

    const text = event.data;
    if (imeRef.current) imeRef.current.value = '';

    if (!text) return;

    sessionRef.current?.sendKey({ type: 'text', text });
    onLogRef.current?.(`sendKey(text) → "${text}"`);
  }, []);

  // Plain typing takes the same route; only intermediate composition results are skipped. The sink is
  // cleared each time so its value cannot accumulate.
  const onImeInput = useCallback((event: React.FormEvent<HTMLTextAreaElement>): void => {
    const sink = event.currentTarget;
    if (composing.current) return;

    const text = sink.value;
    sink.value = '';
    if (!text) return;

    sessionRef.current?.sendKey({ type: 'text', text });
  }, []);

  const takeControl = useCallback((): void => {
    setControlTimedOut(false);
    setAwaitingControl(true);
    sessionRef.current?.requestControl();
    onLogRef.current?.('control/request');
    imeRef.current?.focus({ preventScroll: true });
  }, []);

  const dropControl = useCallback((): void => {
    releaseAll('releaseControl');
    sessionRef.current?.releaseControl();
    onLogRef.current?.('control/release');
  }, [releaseAll]);

  const rootClass = `${styles.root} ${chrome === 'flush' ? styles.flush : ''}`;

  if (!active) {
    return (
      <div className={rootClass} data-chrome={chrome} data-testid="sandbox-browser-panel">
        <div className={styles.head}>
          <span className={styles.headIcon}>
            <GlobeIcon size={15} />
          </span>
          <span className={styles.headText}>
            <span className={styles.headName}>{t(locale, 'sandboxBrowser.title')}</span>
          </span>
          {onClose && (
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.headSpacer}`}
              onClick={onClose}
              aria-label={t(locale, 'sandboxBrowser.close')}
            >
              <XIcon size={15} />
            </button>
          )}
        </div>
        <div className={styles.empty}>
          <span className={styles.emptyTitle}>{t(locale, 'sandboxBrowser.emptyTitle')}</span>
          <span className={styles.emptySub}>{t(locale, 'sandboxBrowser.emptySub')}</span>
        </div>
      </div>
    );
  }

  const hostLabel =
    host === 'me'
      ? t(locale, 'sandboxBrowser.hostMe')
      : host === 'agent'
      ? t(locale, 'sandboxBrowser.hostAgent')
      : t(locale, 'sandboxBrowser.hostNone');
  const subtitle = live
    ? hostLabel
    : status === 'error'
    ? t(locale, 'sandboxBrowser.statusError')
    : status === 'idle'
    ? t(locale, 'sandboxBrowser.statusIdle')
    : t(locale, 'sandboxBrowser.statusConnecting');
  const cursorAt =
    live && !controlling && remoteCursor && videoRef.current
      ? fromRemoteCoords(videoRef.current, remoteCursor.x, remoteCursor.y)
      : null;

  return (
    <div className={rootClass} data-chrome={chrome} data-testid="sandbox-browser-panel">
      <div className={styles.head}>
        <span className={styles.headIcon}>
          <GlobeIcon size={15} />
        </span>
        <span className={styles.headText}>
          <span className={styles.headName}>{active.sandboxName}</span>
          <span className={styles.headSub}>
            <span className={styles.dot} data-host={host} data-testid="sandbox-browser-host-dot" />
            {subtitle}
          </span>
        </span>
        <span className={styles.headSpacer} />
        {browsable.length > 1 && (
          <select
            className={styles.select}
            value={active.sandboxName}
            onChange={event => controller.selectSandbox(event.target.value)}
            aria-label={t(locale, 'sandboxBrowser.switchSandbox')}
          >
            {browsable.map(sandbox => (
              <option key={sandbox.sandboxName} value={sandbox.sandboxName}>
                {sandbox.sandboxName}
              </option>
            ))}
          </select>
        )}
        {onClose && (
          <button
            type="button"
            className={styles.iconBtn}
            onClick={onClose}
            aria-label={t(locale, 'sandboxBrowser.close')}
          >
            <XIcon size={15} />
          </button>
        )}
      </div>

      <div className={styles.stage}>
        <div
          ref={frameRef}
          className={styles.frame}
          data-host={live ? host : 'none'}
          data-controlling={controlling ? 'true' : 'false'}
          data-testid="sandbox-browser-frame"
          onPointerMove={event => pointer('move', event)}
          // `mousedown`'s default action moves focus to whatever was clicked. This layer is deliberately
          // not focusable, so focus would land on <body> and the keyboard could never reach the sink
          // again — symptom: "one click on the picture and typing stops working". The pointer event itself
          // is still sent; only the focus shift and the drag-select are cancelled.
          onMouseDown={event => controlling && event.preventDefault()}
          onPointerDown={event => {
            if (!controlling) return;

            // Send first, focus second — and `focus()` must carry `preventScroll`. The sink is a 1px
            // absolutely-positioned element inside the frame, so focusing it scrolls it into view, which
            // changes `getBoundingClientRect()` mid-handler: the conversion then produces an off-screen
            // coordinate and returns null. The `buttondown` disappears while `buttonup` (which has no
            // focus step) goes through, so the log shows only half the click.
            pressedButtons.current.add(event.button + 1);
            pointer('down', event, event.button + 1);
            imeRef.current?.focus({ preventScroll: true });
          }}
          onPointerUp={event => {
            if (!controlling) return;

            pressedButtons.current.delete(event.button + 1);
            pointer('up', event, event.button + 1);
          }}
          onPointerEnter={() => controlling && void syncClipboardRef.current()}
          onPointerLeave={() => controlling && releaseAll('pointerleave')}
          // No `onWheel` here: the wheel is handled by the non-passive listener above, which is the only
          // way to claim the gesture. Two handlers would send every notch twice.
          onContextMenu={event => controlling && event.preventDefault()}
        >
          {/*
            `onResize` is not optional: Firefox does not always have `videoWidth` by `loadedmetadata`, and
            a remote resolution change is only visible through it — and that changes the basis every
            coordinate is computed against.
          */}
          <video
            ref={videoRef}
            className={styles.video}
            autoPlay
            playsInline
            muted
            data-testid="sandbox-browser-video"
            onLoadedMetadata={event => event.currentTarget.videoWidth > 0 && setVideoReady(true)}
            onResize={event => setVideoReady(event.currentTarget.videoWidth > 0)}
          />

          {/* The remote X11 pointer, drawn only while watching. Note this shows *another person*: the
              agent drives Chromium over CDP, which never moves the X11 pointer, so it does not move while
              the agent works. What the user sees change is the page content itself. */}
          {cursorAt && (
            <RemoteCursorGlyph
              className={styles.cursor}
              // Positions come from a live stream, so they cannot be a class.
              style={{ left: cursorAt.left, top: cursorAt.top }}
            />
          )}

          {/* The keyboard / IME sink. `compositionend` and `beforeinput` only fire on editable elements,
              so binding the keyboard to the picture <div> would receive nothing — symptom: "took over,
              the cursor moves, but typing does nothing". */}
          <textarea
            ref={attachKeyboard}
            className={`${styles.ime} ${imeAt ? styles.imeComposing : ''}`}
            data-composing={imeAt ? 'true' : 'false'}
            data-testid="sandbox-browser-ime"
            style={imeAt ? preeditBox(imeAt, imeWidth, frameRef.current?.clientWidth ?? 0) : undefined}
            rows={1}
            aria-hidden
            tabIndex={-1}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onCompositionStart={onCompositionStart}
            onCompositionUpdate={onCompositionUpdate}
            onCompositionEnd={onCompositionEnd}
            onInput={onImeInput}
            onBlur={() => controlling && releaseAll('ime blur')}
          />

          {!live && status !== 'error' && status !== 'idle' && (
            <div className={styles.overlay}>
              <LoaderIcon size={20} className={styles.spin} />
              <span className={styles.overlayTitle}>{t(locale, 'sandboxBrowser.connectingTitle')}</span>
              <span className={styles.overlaySub}>{t(locale, 'sandboxBrowser.connectingSub')}</span>
            </div>
          )}

          {status === 'error' && (
            <div className={styles.overlay}>
              <CircleAlertIcon size={20} />
              <span className={styles.overlayTitle}>{t(locale, 'sandboxBrowser.errorTitle')}</span>
              <span className={styles.overlaySub}>{detail ?? t(locale, 'sandboxBrowser.errorSub')}</span>
              <button type="button" className={styles.pill} onClick={() => setRetryNonce(n => n + 1)}>
                <RefreshIcon size={14} />
                {t(locale, 'sandboxBrowser.retry')}
              </button>
            </div>
          )}
        </div>

        {pasteFallbackOpen && (
          <div className={styles.paste} data-testid="sandbox-browser-paste-fallback">
            <span className={styles.pasteTitle}>{t(locale, 'sandboxBrowser.pasteFallbackTitle')}</span>
            <p className={styles.pasteSub}>{t(locale, 'sandboxBrowser.pasteFallbackSub')}</p>
            <textarea ref={pasteFallbackRef} className={styles.pasteInput} autoFocus spellCheck={false} />
            <div className={styles.pasteActions}>
              <button type="button" className={styles.pill} onClick={() => setPasteFallbackOpen(false)}>
                {t(locale, 'sandboxBrowser.pasteFallbackCancel')}
              </button>
              <button type="button" className={`${styles.pill} ${styles.pillPrimary}`} onClick={submitPasteFallback}>
                {t(locale, 'sandboxBrowser.pasteFallbackSubmit')}
              </button>
            </div>
          </div>
        )}

        {live && (
          <div
            className={styles.bar}
            // The bar must never take focus away from the keyboard sink. Clicking a button moves focus to
            // it by default, and the sink is where Guacamole listens — so after using the paste button the
            // keyboard reached nothing until the user clicked the picture again, with no sign anything was
            // wrong. Cancelling mousedown is the usual way a toolbar acts on a surface without stealing
            // focus from it, and it covers every button in here including ones added later. Clicks still
            // fire; keyboard users can still tab to them.
            onMouseDown={event => event.preventDefault()}
          >
            {controlling ? (
              <>
                <button type="button" className={styles.pill} onClick={dropControl}>
                  <EyeIcon size={14} />
                  {t(locale, 'sandboxBrowser.releaseControl')}
                </button>
                {/* Not a fallback for ⌘V but the primary route on mobile: an iOS / Android WebView cannot
                    reliably intercept physical keys, so this button is the only one that always works. */}
                <button
                  type="button"
                  className={styles.barBtn}
                  onClick={() => void doPaste()}
                  aria-label={t(locale, 'sandboxBrowser.paste')}
                  title={t(locale, 'sandboxBrowser.paste')}
                >
                  <ClipboardPasteIcon size={14} />
                </button>
              </>
            ) : (
              <button
                type="button"
                className={`${styles.pill} ${styles.pillPrimary}`}
                onClick={takeControl}
                disabled={awaitingControl}
              >
                <MousePointerIcon size={14} />
                {awaitingControl ? t(locale, 'sandboxBrowser.requesting') : t(locale, 'sandboxBrowser.takeControl')}
              </button>
            )}
            <button
              type="button"
              className={styles.barBtn}
              onClick={() => void frameRef.current?.requestFullscreen?.()}
              aria-label={t(locale, 'sandboxBrowser.fullscreen')}
            >
              <MaximizeIcon size={14} />
            </button>
            {onClose && (
              <button
                type="button"
                className={styles.barBtn}
                onClick={onClose}
                aria-label={t(locale, 'sandboxBrowser.close')}
              >
                <XIcon size={14} />
              </button>
            )}
          </div>
        )}

        {controlTimedOut && (
          <div className={styles.overlay} role="status" data-testid="sandbox-browser-control-timeout">
            <CircleAlertIcon size={20} />
            <span className={styles.overlayTitle}>{t(locale, 'sandboxBrowser.requestTimeout')}</span>
            <button type="button" className={styles.pill} onClick={() => setControlTimedOut(false)}>
              {t(locale, 'sandboxBrowser.pasteFallbackCancel')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default SandboxBrowserPanel;
