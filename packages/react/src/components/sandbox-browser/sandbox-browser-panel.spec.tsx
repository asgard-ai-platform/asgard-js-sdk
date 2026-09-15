// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LaunchedSandbox, SandboxBrowserSession, SandboxBrowserTransportHandlers } from '@asgard-js/core';

/**
 * F-035 — the panel's input forwarding (spec §7).
 *
 * Every case here stands for a failure that raises nothing: the remote simply does nothing, or does the
 * wrong thing, seconds or minutes after the mistake. None of them can be caught by reading the code, and
 * none of them show up in a browser until somebody notices the symptom and cannot explain it.
 *
 * jsdom cannot play video, so `videoWidth` / `videoHeight` are stubbed — which is fine, because what is
 * under test is the arithmetic and the gating, not the codec.
 */

// --- the vendored keyboard, captured so the binding count is observable -------------------------------

interface FakeKeyboard {
  modifiers: { shift: boolean; ctrl: boolean; alt: boolean; meta: boolean; hyper: boolean };
  onkeydown?: (keysym: number) => boolean;
  onkeyup?: (keysym: number) => void;
  press: (keysym: number) => boolean;
  release: (keysym: number) => void;
  type: (text: string) => void;
  reset: () => void;
  listenTo: (element: Element | Document) => void;
}

const keyboards = vi.hoisted(() => ({ list: [] as unknown[], listenToCalls: 0, resetCalls: 0 }));

vi.mock('../../vendor', () => ({
  createGuacamoleKeyboard: (): FakeKeyboard => {
    const keyboard: FakeKeyboard = {
      modifiers: { shift: false, ctrl: false, alt: false, meta: false, hyper: false },
      press: () => true,
      release: vi.fn(),
      type: vi.fn(),
      reset: vi.fn(() => {
        keyboards.resetCalls += 1;
      }),
      listenTo: vi.fn(() => {
        keyboards.listenToCalls += 1;
      }),
    };
    keyboards.list.push(keyboard);

    return keyboard;
  },
}));

const { SandboxBrowserPanel } = await import('./sandbox-browser-panel');
const { useSandboxBrowserController } = await import('../../hooks/use-sandbox-browser-controller');

// --- harness -----------------------------------------------------------------------------------------

const SANDBOXES: LaunchedSandbox[] = [
  {
    sandboxName: 'sbx-1',
    sandboxBlueprintName: 'demo',
    workingDirectory: '/work',
    editorServerEnabled: false,
    browserEnabled: true,
  },
];

type Sent = { kind: 'pointer' | 'key' | 'clipboard' | 'paste' | 'control'; payload: unknown };

const sent: Sent[] = [];
let handlers: SandboxBrowserTransportHandlers | null = null;

function makeSession(): SandboxBrowserSession {
  return {
    requestControl: () => sent.push({ kind: 'control', payload: 'request' }),
    releaseControl: () => sent.push({ kind: 'control', payload: 'release' }),
    sendPointer: event => sent.push({ kind: 'pointer', payload: event }),
    sendKey: event => sent.push({ kind: 'key', payload: event }),
    setClipboard: text => sent.push({ kind: 'clipboard', payload: text }),
    paste: text => sent.push({ kind: 'paste', payload: text }),
    close: vi.fn(),
  };
}

function Harness(): React.ReactNode {
  const controller = useSandboxBrowserController({ open: true, activeSandboxName: 'sbx-1' });

  return (
    <SandboxBrowserPanel
      sandboxes={SANDBOXES}
      controller={controller}
      transport={{
        connect: async (_name, h) => {
          handlers = h;

          return makeSession();
        },
      }}
    />
  );
}

/** The frame is what carries the pointer handlers; the video under it supplies the geometry. */
function frame(): HTMLElement {
  return screen.getByTestId('sandbox-browser-frame');
}

/**
 * Dispatch a pointer event that actually carries coordinates.
 *
 * `fireEvent.pointerDown(el, { clientX })` does not work here: jsdom has no `PointerEvent`, so
 * testing-library falls back to a plain `Event` and the coordinates are silently dropped — every handler
 * then reads `undefined`. A `MouseEvent` named `pointerdown` reaches React's `onPointerDown` all the same
 * and does carry them.
 */
function firePointer(
  type: 'pointerdown' | 'pointerup' | 'pointermove',
  init: { clientX?: number; clientY?: number; button?: number } = {},
): void {
  fireEvent(frame(), new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
}

/**
 * Make React's `onPointerLeave` fire.
 *
 * It is not a real listener: React synthesizes enter/leave from `pointerout` / `pointerover` and decides
 * from `relatedTarget` whether the pointer actually left the subtree. Dispatching a literal `pointerleave`
 * event — which is what `fireEvent.pointerLeave` does — reaches nothing at all.
 */
function firePointerLeave(): void {
  fireEvent(frame(), new MouseEvent('pointerout', { bubbles: true, cancelable: true, relatedTarget: document.body }));
}

/** Same problem for the wheel: jsdom's WheelEvent carries the deltas, a plain Event does not. */
function fireWheel(init: {
  clientX: number;
  clientY: number;
  deltaX: number;
  deltaY: number;
  deltaMode?: number;
}): void {
  fireEvent(frame(), new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init }));
}

/** Let a `queueMicrotask` callback run — the panel releases keys on one, to avoid recursing in the handler. */
async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/** Give the video real dimensions and a box, the way a live stream would. */
function makePictureReady(width = 1280, height = 720): void {
  const video = screen.getByTestId('sandbox-browser-video') as HTMLVideoElement;
  Object.defineProperty(video, 'videoWidth', { value: width, configurable: true });
  Object.defineProperty(video, 'videoHeight', { value: height, configurable: true });
  video.getBoundingClientRect = (): DOMRect => ({
    left: 0,
    top: 0,
    width,
    height,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: (): object => ({}),
  });
  fireEvent.loadedMetadata(video);
}

/** Connect, go live, and take control — the state most cases are about. */
async function goLiveAndControl(): Promise<void> {
  await waitFor(() => expect(handlers).not.toBeNull());
  act(() => {
    handlers?.onStatus('live');
    handlers?.onHostChange('me');
  });
  act(() => makePictureReady());
  await waitFor(() => expect(screen.queryByText(/Take over|Stop controlling/)).not.toBeNull());
}

function pointerEvents(): Array<Record<string, unknown>> {
  return sent.filter(s => s.kind === 'pointer').map(s => s.payload as Record<string, unknown>);
}

function keyEvents(): Array<Record<string, unknown>> {
  return sent.filter(s => s.kind === 'key').map(s => s.payload as Record<string, unknown>);
}

beforeEach(() => {
  sent.length = 0;
  handlers = null;
  keyboards.list = [];
  keyboards.listenToCalls = 0;
  keyboards.resetCalls = 0;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// --- cases -------------------------------------------------------------------------------------------

describe('keyboard binding (spec §7.2)', () => {
  // Guacamole has `listenTo` and no unbind, so binding twice sends every keystroke twice with no error.
  // Written as an effect keyed on status it bound three times (idle → connecting → live): three keydowns
  // reached the remote against one keyup, Control latched, and every later key arrived as a Ctrl chord.
  it('binds exactly once across the whole connect → live → control sequence', async () => {
    render(<Harness />);
    await goLiveAndControl();

    act(() => handlers?.onHostChange('agent'));
    act(() => handlers?.onHostChange('me'));

    expect(keyboards.listenToCalls).toBe(1);
    expect(keyboards.list).toHaveLength(1);
  });
});

describe('pointer forwarding (spec §7.1)', () => {
  it('sends nothing while somebody else is in control', async () => {
    render(<Harness />);
    await waitFor(() => expect(handlers).not.toBeNull());
    act(() => {
      handlers?.onStatus('live');
      handlers?.onHostChange('agent');
    });
    act(() => makePictureReady());

    firePointer('pointerdown', { clientX: 100, clientY: 100, button: 0 });
    firePointer('pointermove', { clientX: 120, clientY: 120 });

    expect(pointerEvents()).toEqual([]);
  });

  it('converts and sends a click once in control', async () => {
    render(<Harness />);
    await goLiveAndControl();

    firePointer('pointerdown', { clientX: 100, clientY: 200, button: 0 });
    firePointer('pointerup', { clientX: 100, clientY: 200, button: 0 });

    expect(pointerEvents()).toEqual([
      { type: 'down', x: 100, y: 200, button: 1 },
      { type: 'up', x: 100, y: 200, button: 1 },
    ]);
  });

  it('maps the right mouse button to X11 code 3', async () => {
    render(<Harness />);
    await goLiveAndControl();

    firePointer('pointerdown', { clientX: 10, clientY: 10, button: 2 });

    expect(pointerEvents()[0]).toMatchObject({ button: 3 });
  });

  // Two separate guards protect this window, and they are worth testing separately because only one of
  // them is visible to the user.
  //
  // `live` is set at `ontrack`, but `videoWidth` stays 0 for about a second afterwards. During that second
  // the coordinate conversion refuses to produce a point, so nothing is sent...
  it('sends nothing while the picture has no dimensions, even though the stream is live', async () => {
    render(<Harness />);
    await waitFor(() => expect(handlers).not.toBeNull());
    act(() => {
      handlers?.onStatus('live');
      handlers?.onHostChange('me');
    });
    // deliberately no makePictureReady()

    firePointer('pointerdown', { clientX: 100, clientY: 100, button: 0 });

    expect(pointerEvents()).toEqual([]);
  });

  // ...but silently dropping clicks is exactly the symptom to avoid: the user clicks, nothing happens, and
  // they conclude it is broken. So the panel must not *invite* the click either — the control bar stays
  // away until the picture is real. This is what the `videoReady` half of the gate is for; the assertion
  // above passes on the coordinate guard alone and would not notice if the gate were dropped.
  it('does not offer the controls until the picture actually has dimensions', async () => {
    render(<Harness />);
    await waitFor(() => expect(handlers).not.toBeNull());
    act(() => {
      handlers?.onStatus('live');
      handlers?.onHostChange('agent');
    });

    expect(screen.queryByText('Take over')).toBeNull();

    act(() => makePictureReady());

    expect(screen.queryByText('Take over')).not.toBeNull();
  });

  it('drops a click on the letterbox bar', async () => {
    render(<Harness />);
    await waitFor(() => expect(handlers).not.toBeNull());
    act(() => {
      handlers?.onStatus('live');
      handlers?.onHostChange('me');
    });
    // 1280×900 box for a 1280×720 stream → 90px bars top and bottom.
    act(() => {
      const video = screen.getByTestId('sandbox-browser-video') as HTMLVideoElement;
      Object.defineProperty(video, 'videoWidth', { value: 1280, configurable: true });
      Object.defineProperty(video, 'videoHeight', { value: 720, configurable: true });
      video.getBoundingClientRect = (): DOMRect => ({
        left: 0,
        top: 0,
        width: 1280,
        height: 900,
        right: 1280,
        bottom: 900,
        x: 0,
        y: 0,
        toJSON: (): object => ({}),
      });
      fireEvent.loadedMetadata(video);
    });

    firePointer('pointerdown', { clientX: 640, clientY: 10, button: 0 });
    expect(pointerEvents()).toEqual([]);

    firePointer('pointerdown', { clientX: 640, clientY: 450, button: 0 });
    expect(pointerEvents()).toHaveLength(1);
  });
});

describe('scroll (spec §7.6)', () => {
  it('inverts the delta and throttles to one message per window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Harness />);
    await goLiveAndControl();

    fireWheel({ clientX: 100, clientY: 100, deltaX: 0, deltaY: 100, deltaMode: 0 });
    fireWheel({ clientX: 100, clientY: 100, deltaX: 0, deltaY: 100, deltaMode: 0 });
    fireWheel({ clientX: 100, clientY: 100, deltaX: 0, deltaY: 100, deltaMode: 0 });

    const scrolls = pointerEvents().filter(e => e.type === 'scroll');
    // Inverted and clamped: the browser's +100 becomes the remote's -10, not 100 XTest events.
    expect(scrolls).toEqual([{ type: 'scroll', x: 100, y: 100, deltaX: 0, deltaY: -10 }]);

    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    fireWheel({ clientX: 100, clientY: 100, deltaX: 0, deltaY: 100, deltaMode: 0 });

    expect(pointerEvents().filter(e => e.type === 'scroll')).toHaveLength(2);
  });
});

describe('stuck keys (spec §7.5)', () => {
  // A buttonup at (0, 0) reads to the remote as a drag from where the button went down to the top-left
  // corner: the page ends up fully selected and the click stops counting as a click. Measured symptom —
  // clicking the address bar selected the whole page and typing then went nowhere near it.
  it('releases a held button at the last known position, never at the origin', async () => {
    render(<Harness />);
    await goLiveAndControl();

    firePointer('pointerdown', { clientX: 400, clientY: 300, button: 0 });
    sent.length = 0;

    firePointerLeave();

    const releases = pointerEvents().filter(e => e.type === 'up');
    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({ x: 400, y: 300, button: 1 });
    expect(releases[0]).not.toMatchObject({ x: 0, y: 0 });
  });

  it('releases held keys and buttons when the window loses focus', async () => {
    render(<Harness />);
    await goLiveAndControl();

    firePointer('pointerdown', { clientX: 400, clientY: 300, button: 0 });
    const resetsBefore = keyboards.resetCalls;
    sent.length = 0;

    fireEvent.blur(window);

    expect(pointerEvents().filter(e => e.type === 'up')).toHaveLength(1);
    // The keyboard's own reset is what emits the keyups, so it has to be asked.
    expect(keyboards.resetCalls).toBeGreaterThan(resetsBefore);
  });

  it('releases when the tab is hidden', async () => {
    render(<Harness />);
    await goLiveAndControl();

    firePointer('pointerdown', { clientX: 400, clientY: 300, button: 0 });
    sent.length = 0;

    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    fireEvent(document, new Event('visibilitychange'));

    expect(pointerEvents().filter(e => e.type === 'up')).toHaveLength(1);
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  });

  it('does not release the same button twice', async () => {
    render(<Harness />);
    await goLiveAndControl();

    firePointer('pointerdown', { clientX: 400, clientY: 300, button: 0 });
    firePointer('pointerup', { clientX: 400, clientY: 300, button: 0 });
    sent.length = 0;

    firePointerLeave();

    expect(pointerEvents().filter(e => e.type === 'up')).toEqual([]);
  });
});

describe('keyboard routing (spec §7.3 / §7.4)', () => {
  function keyboard(): FakeKeyboard {
    return keyboards.list[0] as FakeKeyboard;
  }

  it('lets a plain printable character through to the text path rather than sending a keysym', async () => {
    render(<Harness />);
    await goLiveAndControl();

    const allowedThrough = keyboard().onkeydown?.(0x61); // 'a'
    await flushMicrotasks();

    expect(allowedThrough).toBe(true);
    expect(keyEvents()).toEqual([]);
    // Released from the held set even though it was let through — an untracked printable key repeats, and
    // typing "example.com" arrived as "aaa".
    expect(keyboard().release).toHaveBeenCalledWith(0x61);
  });

  // With ⌘ held the browser treats the character as a command and never fires `input`, so the text path
  // loses it entirely — ⌘A / ⌘C / ⌘Z would vanish with only the modifier sent.
  it('sends a chorded printable character down the keysym path instead', async () => {
    render(<Harness />);
    await goLiveAndControl();

    keyboard().modifiers.ctrl = true;
    const allowedThrough = keyboard().onkeydown?.(0x61);
    await flushMicrotasks();

    expect(allowedThrough).toBe(false);
    expect(keyEvents()).toEqual([{ type: 'down', keysym: 0x61 }]);
    // Released immediately: Guacamole only suppresses key-repeat for modifiers, so ⌘L would otherwise
    // repeat as Ctrl+L every 50ms.
    expect(keyboard().release).toHaveBeenCalledWith(0x61);
  });

  it('treats Shift + letter as typing, not as a chord', async () => {
    render(<Harness />);
    await goLiveAndControl();

    keyboard().modifiers.shift = true;
    const allowedThrough = keyboard().onkeydown?.(0x41); // 'A'

    expect(allowedThrough).toBe(true);
    expect(keyEvents()).toEqual([]);
  });

  it('sends function and modifier keys down the keysym path', async () => {
    render(<Harness />);
    await goLiveAndControl();

    keyboard().onkeydown?.(0xff0d); // Enter
    keyboard().onkeydown?.(0xffc2); // F5

    expect(keyEvents()).toEqual([
      { type: 'down', keysym: 0xff0d },
      { type: 'down', keysym: 0xffc2 },
    ]);
  });

  // The same 'v' takes the text path alone and the keysym path with ⌘ held; the two keyups are identical,
  // so only a record of what was sent can tell them apart. Sending keyup unconditionally would also mask a
  // double-bound keyboard exactly.
  it('sends keyup only for keys it actually sent a keydown for', async () => {
    render(<Harness />);
    await goLiveAndControl();

    keyboard().onkeydown?.(0x61); // text path — no keysym sent
    keyboard().onkeyup?.(0x61);
    expect(keyEvents()).toEqual([]);

    keyboard().modifiers.ctrl = true;
    keyboard().onkeydown?.(0x62); // keysym path
    keyboard().onkeyup?.(0x62);

    expect(keyEvents()).toEqual([
      { type: 'down', keysym: 0x62 },
      { type: 'up', keysym: 0x62 },
    ]);
  });

  it('intercepts the paste chord instead of forwarding it', async () => {
    render(<Harness />);
    await goLiveAndControl();

    keyboard().modifiers.meta = true;
    const allowedThrough = keyboard().onkeydown?.(0x76); // 'v'

    expect(allowedThrough).toBe(false);
    // Forwarding the chord would paste the *remote's* clipboard, which is not what the user copied.
    expect(keyEvents()).toEqual([]);
  });

  it('sends nothing at all while not in control', async () => {
    render(<Harness />);
    await waitFor(() => expect(handlers).not.toBeNull());
    act(() => {
      handlers?.onStatus('live');
      handlers?.onHostChange('agent');
    });
    act(() => makePictureReady());

    keyboard().modifiers.ctrl = true;
    keyboard().onkeydown?.(0x61);

    expect(keyEvents()).toEqual([]);
  });
});

describe('IME composition (spec §7.4 / §7.4.1)', () => {
  it('sends the composed string on compositionend, not the intermediate keys', async () => {
    render(<Harness />);
    await goLiveAndControl();

    const sink = screen.getByTestId('sandbox-browser-ime');
    fireEvent.compositionStart(sink);
    fireEvent.compositionUpdate(sink, { data: 'ㄋㄧ' });
    fireEvent.compositionEnd(sink, { data: '你好' });

    expect(keyEvents()).toEqual([{ type: 'text', text: '你好' }]);
  });

  // The pre-edit is painted by the browser inside this element and the candidate window anchors to its
  // caret. Left invisible in a corner, the user types blind until Enter and reports "Chinese is broken".
  it('makes the sink visible while composing and hides it again afterwards', async () => {
    render(<Harness />);
    await goLiveAndControl();

    const sink = screen.getByTestId('sandbox-browser-ime');
    expect(sink.getAttribute('data-composing')).toBe('false');

    fireEvent.compositionStart(sink);
    expect(sink.getAttribute('data-composing')).toBe('true');

    fireEvent.compositionEnd(sink, { data: '你' });
    expect(sink.getAttribute('data-composing')).toBe('false');
  });

  it('ignores an empty composition rather than sending an empty string', async () => {
    render(<Harness />);
    await goLiveAndControl();

    const sink = screen.getByTestId('sandbox-browser-ime');
    fireEvent.compositionStart(sink);
    fireEvent.compositionEnd(sink, { data: '' });

    expect(keyEvents()).toEqual([]);
  });

  it('sends plain typed text through the same path and clears the sink', async () => {
    render(<Harness />);
    await goLiveAndControl();

    const sink = screen.getByTestId('sandbox-browser-ime') as HTMLTextAreaElement;
    sink.value = 'hello';
    fireEvent.input(sink);

    expect(keyEvents()).toEqual([{ type: 'text', text: 'hello' }]);
    // Cleared, or the value accumulates and every keystroke resends the whole buffer.
    expect(sink.value).toBe('');
  });
});

describe('control ownership (spec §6)', () => {
  it('asks for control and reports a timeout when the server says nothing back', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Harness />);
    await waitFor(() => expect(handlers).not.toBeNull());
    act(() => {
      handlers?.onStatus('live');
      handlers?.onHostChange('agent');
    });
    act(() => makePictureReady());

    fireEvent.click(screen.getByText('Take over'));
    expect(sent.filter(s => s.kind === 'control')).toEqual([{ kind: 'control', payload: 'request' }]);

    // A refused request draws no reply at all, so silence has to become a message on its own.
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    expect(screen.queryByTestId('sandbox-browser-control-timeout')).not.toBeNull();
  });

  it('clears the pending state as soon as control is granted', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Harness />);
    await waitFor(() => expect(handlers).not.toBeNull());
    act(() => {
      handlers?.onStatus('live');
      handlers?.onHostChange('agent');
    });
    act(() => makePictureReady());

    fireEvent.click(screen.getByText('Take over'));
    act(() => handlers?.onHostChange('me'));

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    expect(screen.queryByTestId('sandbox-browser-control-timeout')).toBeNull();
  });

  it('releases held input before handing control back', async () => {
    render(<Harness />);
    await goLiveAndControl();

    firePointer('pointerdown', { clientX: 400, clientY: 300, button: 0 });
    sent.length = 0;

    fireEvent.click(screen.getByText('Stop controlling'));

    expect(pointerEvents().filter(e => e.type === 'up')).toHaveLength(1);
    expect(sent.filter(s => s.kind === 'control')).toEqual([{ kind: 'control', payload: 'release' }]);
  });
});

describe('states', () => {
  it('shows the empty state when no sandbox has a browser', () => {
    function Empty(): React.ReactNode {
      const controller = useSandboxBrowserController({ open: true });

      return (
        <SandboxBrowserPanel
          sandboxes={[{ ...SANDBOXES[0], browserEnabled: false }]}
          controller={controller}
          transport={{ connect: async () => makeSession() }}
        />
      );
    }

    render(<Empty />);

    expect(screen.queryByText('No browser available')).not.toBeNull();
  });

  it('shows the failure overlay with a retry when the connection errors', async () => {
    render(<Harness />);
    await waitFor(() => expect(handlers).not.toBeNull());

    act(() => handlers?.onStatus('error', 'ICE connection failed.'));

    expect(screen.queryByText('ICE connection failed.')).not.toBeNull();
    expect(screen.queryByText('Reconnect')).not.toBeNull();
  });

  it('marks who is driving on the header dot', async () => {
    render(<Harness />);
    await waitFor(() => expect(handlers).not.toBeNull());

    act(() => handlers?.onHostChange('agent'));
    expect(screen.getByTestId('sandbox-browser-host-dot').getAttribute('data-host')).toBe('agent');

    act(() => handlers?.onHostChange('me'));
    expect(screen.getByTestId('sandbox-browser-host-dot').getAttribute('data-host')).toBe('me');
  });

  it('defaults to watching — the control bar offers to take over, not to release', async () => {
    render(<Harness />);
    await waitFor(() => expect(handlers).not.toBeNull());
    act(() => {
      handlers?.onStatus('live');
      handlers?.onHostChange('agent');
    });
    act(() => makePictureReady());

    expect(screen.queryByText('Take over')).not.toBeNull();
    expect(screen.queryByText('Stop controlling')).toBeNull();
  });
});
