import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSandboxBrowserTransport, decodeCursorFrame } from './sandbox-browser-transport';
import type {
  BrowserHost,
  BrowserStatus,
  SandboxBrowserSession,
  SandboxBrowserTransportHandlers,
} from '../types/sandbox-browser';

// F-035 — spec §5 / §6 / §7. This suite exists because the Neko handshake has three properties that
// contradict the obvious implementation and fail *silently* when you get them wrong: the server is the
// offerer, candidates arrive before the offer, and a refused control request is answered with nothing.
// A mock cannot catch those in a browser — but it can pin the wire behavior, which is what is done here.

interface SentFrame {
  event: string;
  payload?: Record<string, unknown>;
}

/** Minimal stand-in for the socket, with the hooks a test needs to play the server's side. */
class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readyState = 1;
  url: string;
  sent: SentFrame[] = [];
  closeCalls = 0;

  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
    // Open on a microtask so `connect()`'s await actually suspends, the way a real socket does.
    queueMicrotask(() => this.onopen?.());
  }

  send(raw: string): void {
    this.sent.push(JSON.parse(raw) as SentFrame);
  }

  close(): void {
    this.closeCalls += 1;
    this.readyState = 3;
  }

  /** Play a server frame. */
  emit(event: string, payload?: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify({ event, payload }) });
  }

  /** Every frame the client sent for one event name. */
  sentOf(event: string): SentFrame[] {
    return this.sent.filter(frame => frame.event === event);
  }
}

class FakeDataChannel {
  binaryType = '';
  onmessage: ((event: { data: unknown }) => void) | null = null;
}

class FakePeerConnection {
  static instances: FakePeerConnection[] = [];

  config: RTCConfiguration;
  remoteDescription: { type: string; sdp: string } | null = null;
  localDescription: { type: string; sdp: string } | null = null;
  iceConnectionState = 'new';
  addedCandidates: RTCIceCandidateInit[] = [];
  closeCalls = 0;

  onicecandidate: ((event: { candidate: { toJSON: () => Record<string, unknown> } | null }) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  ontrack: ((event: { streams: unknown[] }) => void) | null = null;
  ondatachannel: ((event: { channel: FakeDataChannel }) => void) | null = null;

  constructor(config: RTCConfiguration) {
    this.config = config;
    FakePeerConnection.instances.push(this);
  }

  async setRemoteDescription(description: { type: string; sdp: string }): Promise<void> {
    this.remoteDescription = description;
  }

  async createAnswer(): Promise<{ type: string; sdp: string }> {
    return { type: 'answer', sdp: 'ANSWER_SDP' };
  }

  async setLocalDescription(description: { type: string; sdp: string }): Promise<void> {
    this.localDescription = description;
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.remoteDescription) throw new Error('remote description not set');

    this.addedCandidates.push(candidate);
  }

  close(): void {
    this.closeCalls += 1;
  }
}

interface Harness {
  session: SandboxBrowserSession;
  socket: FakeWebSocket;
  peer: () => FakePeerConnection;
  hosts: BrowserHost[];
  statuses: Array<{ status: BrowserStatus; detail?: string }>;
  streams: unknown[];
  cursors: Array<{ x: number; y: number } | null>;
  clipboards: string[];
  wire: Array<{ direction: string; event: string }>;
}

const OFFER = { sdp: 'OFFER_SDP', iceservers: [{ urls: 'turn:turn.example.com' }] };

/**
 * Connect, optionally completing the handshake and taking control, and hand back everything a test needs
 * to assert on. Defaults match the common case so each test states only what it is actually about.
 */
async function connect({
  negotiate = true,
  control = false,
}: { negotiate?: boolean; control?: boolean } = {}): Promise<Harness> {
  const hosts: BrowserHost[] = [];
  const statuses: Array<{ status: BrowserStatus; detail?: string }> = [];
  const streams: unknown[] = [];
  const cursors: Array<{ x: number; y: number } | null> = [];
  const clipboards: string[] = [];
  const wire: Array<{ direction: string; event: string }> = [];

  const handlers: SandboxBrowserTransportHandlers = {
    onStream: stream => streams.push(stream),
    onHostChange: host => hosts.push(host),
    onStatus: (status, detail) => statuses.push({ status, detail }),
    onRemoteCursor: position => cursors.push(position),
    onClipboardChange: text => clipboards.push(text),
    onWire: (direction, event) => wire.push({ direction, event }),
  };

  const transport = createSandboxBrowserTransport({
    createSession: async () => ({ wsUrl: 'wss://neko.example.com/api/ws', token: 'tok 1' }),
  });

  const session = await transport.connect('sbx-1', handlers);
  const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

  if (negotiate) {
    socket.emit('system/init', { session_id: 'me-1' });
    socket.emit('signal/provide', OFFER);
    await vi.waitFor(() => expect(FakePeerConnection.instances.length).toBeGreaterThan(0));
    await vi.waitFor(() => expect(socket.sentOf('signal/answer').length).toBe(1));
  }

  if (control) {
    socket.emit('control/host', { host_id: 'me-1' });
  }

  return {
    session,
    socket,
    peer: () => FakePeerConnection.instances[FakePeerConnection.instances.length - 1],
    hosts,
    statuses,
    streams,
    cursors,
    clipboards,
    wire,
  };
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  FakePeerConnection.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('connection and handshake (spec §5)', () => {
  it('appends the token to the socket url as a query parameter, url-encoded', async () => {
    const { socket } = await connect({ negotiate: false });

    // Browsers cannot set headers on a WebSocket, so the query string is the only channel there is.
    expect(socket.url).toBe('wss://neko.example.com/api/ws?token=tok%201');
  });

  it('joins with & when the endpoint already carries a query string', async () => {
    const transport = createSandboxBrowserTransport({
      createSession: async () => ({ wsUrl: 'wss://neko.example.com/api/ws?x=1', token: 't' }),
    });
    await transport.connect('sbx-1', {
      onStream: () => undefined,
      onHostChange: () => undefined,
      onStatus: () => undefined,
    });

    expect(FakeWebSocket.instances[0].url).toBe('wss://neko.example.com/api/ws?x=1&token=t');
  });

  it('requests media and starts a heartbeat once open', async () => {
    vi.useFakeTimers();
    const { socket } = await connect({ negotiate: false });

    expect(socket.sentOf('signal/request')[0].payload).toEqual({ video: {}, audio: {} });

    expect(socket.sentOf('client/heartbeat')).toHaveLength(0);
    vi.advanceTimersByTime(10_000);
    expect(socket.sentOf('client/heartbeat')).toHaveLength(1);
    vi.advanceTimersByTime(20_000);
    expect(socket.sentOf('client/heartbeat')).toHaveLength(3);
  });

  // The server offers and we answer — the reverse of most WebRTC examples.
  it('answers the server offer rather than creating one', async () => {
    const { socket, peer } = await connect();

    expect(peer().remoteDescription).toEqual({ type: 'offer', sdp: 'OFFER_SDP' });
    expect(socket.sentOf('signal/answer')[0].payload).toMatchObject({ sdp: 'ANSWER_SDP' });
  });

  // The platform injects the pod's TURN URLs and time-limited credentials; carrying our own would ignore them.
  it('uses the ICE servers the offer carries rather than any of its own', async () => {
    const { peer } = await connect();

    expect(peer().config.iceServers).toEqual([{ urls: 'turn:turn.example.com' }]);
  });

  it('handles a later signal/offer as a renegotiation', async () => {
    const { socket } = await connect();

    socket.emit('signal/offer', { sdp: 'OFFER_SDP_2', iceservers: [] });
    await vi.waitFor(() => expect(socket.sentOf('signal/answer').length).toBe(2));
  });

  it('reports the stream and goes live on ontrack', async () => {
    const { peer, streams, statuses } = await connect();
    const stream = { id: 'media' };

    peer().ontrack?.({ streams: [stream] });

    expect(streams).toEqual([stream]);
    expect(statuses.map(s => s.status)).toContain('live');
  });

  // Measured against a real container: the offer carries audio and video, so ontrack runs twice for one
  // stream. Announcing twice makes the panel reassign srcObject to the stream it is already playing.
  it('announces one stream once, however many tracks arrive on it', async () => {
    const { peer, streams, statuses } = await connect();
    const stream = { id: 'media' };

    peer().ontrack?.({ streams: [stream] });
    peer().ontrack?.({ streams: [stream] });

    expect(streams).toEqual([stream]);
    expect(statuses.filter(s => s.status === 'live')).toHaveLength(1);
  });

  it('still announces a genuinely different stream after a renegotiation', async () => {
    const { peer, streams } = await connect();

    peer().ontrack?.({ streams: [{ id: 'media-1' }] });
    peer().ontrack?.({ streams: [{ id: 'media-2' }] });

    expect(streams.map(s => (s as { id: string }).id)).toEqual(['media-1', 'media-2']);
  });

  it('forwards locally gathered candidates to the server', async () => {
    const { socket, peer } = await connect();

    peer().onicecandidate?.({ candidate: { toJSON: () => ({ candidate: 'a=x' }) } });

    expect(socket.sentOf('signal/candidate')[0].payload).toEqual({ candidate: 'a=x' });
  });

  it('reports an error when ICE fails', async () => {
    const { peer, statuses } = await connect();

    peer().iceConnectionState = 'failed';
    peer().oniceconnectionstatechange?.();

    expect(statuses.some(s => s.status === 'error')).toBe(true);
  });

  it('rejects rather than hanging when the socket errors before opening', async () => {
    // A socket that only ever errors. Subclassing FakeWebSocket would not work: its constructor queues
    // `onopen`, which still wins the race once the transport has assigned its handler.
    class ErroringSocket {
      readyState = 0;
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: ((event: { code: number }) => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;

      constructor() {
        queueMicrotask(() => this.onerror?.());
      }

      send(): void {
        // never reached
      }

      close(): void {
        // never reached
      }
    }
    vi.stubGlobal('WebSocket', ErroringSocket);

    const transport = createSandboxBrowserTransport({
      createSession: async () => ({ wsUrl: 'wss://neko.example.com/api/ws', token: 't' }),
    });

    await expect(
      transport.connect('sbx-1', {
        onStream: () => undefined,
        onHostChange: () => undefined,
        onStatus: () => undefined,
      }),
    ).rejects.toThrow(/failed to connect/);
  });

  // §1.5 — connect() rejecting leaves the caller with no session, so nothing else can ever close this
  // socket. Without an explicit close it stays pending (or connects later) for the life of the page, and
  // the retry path opens another one on top of it every time.
  it('closes the socket it opened when the connection fails, leaving nothing dangling', async () => {
    const closeCalls: number[] = [];
    vi.stubGlobal(
      'WebSocket',
      class {
        onopen: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onclose: ((event: { code: number }) => void) | null = null;
        onmessage: ((event: { data: string }) => void) | null = null;
        constructor() {
          queueMicrotask(() => this.onerror?.());
        }
        send(): void {
          // never reached
        }
        close(): void {
          closeCalls.push(1);
        }
      },
    );

    const transport = createSandboxBrowserTransport({
      createSession: async () => ({ wsUrl: 'wss://neko.example.com/api/ws', token: 't' }),
    });

    await expect(
      transport.connect('sbx-1', {
        onStream: () => undefined,
        onHostChange: () => undefined,
        onStatus: () => undefined,
      }),
    ).rejects.toThrow();

    expect(closeCalls).toHaveLength(1);
  });

  it('closes the socket when the open times out, too', async () => {
    vi.useFakeTimers();
    const closeCalls: number[] = [];
    vi.stubGlobal(
      'WebSocket',
      class {
        onopen: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onclose: ((event: { code: number }) => void) | null = null;
        onmessage: ((event: { data: string }) => void) | null = null;
        send(): void {
          // never reached
        }
        close(): void {
          closeCalls.push(1);
        }
      },
    );

    const transport = createSandboxBrowserTransport({
      createSession: async () => ({ wsUrl: 'wss://neko.example.com/api/ws', token: 't' }),
    });
    const pending = transport.connect('sbx-1', {
      onStream: () => undefined,
      onHostChange: () => undefined,
      onStatus: () => undefined,
    });
    const assertion = expect(pending).rejects.toThrow(/timed out/);

    await vi.advanceTimersByTimeAsync(8_000);
    await assertion;

    expect(closeCalls).toHaveLength(1);
  });

  it('rejects when the socket never opens at all, instead of hanging forever', async () => {
    vi.useFakeTimers();
    // A socket that does nothing: no open, no error. Without the timeout this await never settles.
    vi.stubGlobal(
      'WebSocket',
      class {
        onopen: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onclose: ((event: { code: number }) => void) | null = null;
        onmessage: ((event: { data: string }) => void) | null = null;
        send(): void {
          // never reached
        }
        close(): void {
          // never reached
        }
      },
    );

    const transport = createSandboxBrowserTransport({
      createSession: async () => ({ wsUrl: 'wss://neko.example.com/api/ws', token: 't' }),
    });
    const pending = transport.connect('sbx-1', {
      onStream: () => undefined,
      onHostChange: () => undefined,
      onStatus: () => undefined,
    });
    const assertion = expect(pending).rejects.toThrow(/timed out/);

    await vi.advanceTimersByTimeAsync(8_000);
    await assertion;
  });
});

// This is the one that costs a whole afternoon if it is wrong: the candidates genuinely arrive first, and
// addIceCandidate before setRemoteDescription throws. Dropping them produces no error at all — only a
// connection that never establishes.
describe('ICE candidate buffering (spec §5)', () => {
  it('buffers candidates that arrive before the offer and flushes them after setRemoteDescription', async () => {
    const { socket, peer } = await connect({ negotiate: false });

    socket.emit('system/init', { session_id: 'me-1' });
    socket.emit('signal/candidate', { candidate: 'early-1', sdpMid: '0' });
    socket.emit('signal/candidate', { candidate: 'early-2', sdpMid: '0' });

    expect(FakePeerConnection.instances).toHaveLength(0);

    socket.emit('signal/provide', OFFER);
    await vi.waitFor(() => expect(socket.sentOf('signal/answer').length).toBe(1));

    expect(peer().addedCandidates.map(c => c.candidate)).toEqual(['early-1', 'early-2']);
  });

  it('adds a candidate arriving after the offer immediately, preserving order overall', async () => {
    const { socket, peer } = await connect({ negotiate: false });

    socket.emit('signal/candidate', { candidate: 'early-1' });
    socket.emit('signal/provide', OFFER);
    await vi.waitFor(() => expect(socket.sentOf('signal/answer').length).toBe(1));

    socket.emit('signal/candidate', { candidate: 'late-1' });
    await vi.waitFor(() => expect(peer().addedCandidates).toHaveLength(2));

    expect(peer().addedCandidates.map(c => c.candidate)).toEqual(['early-1', 'late-1']);
  });

  it('keeps candidates out of the wire log, which move-level volume would drown', async () => {
    const { socket, wire } = await connect();

    socket.emit('signal/candidate', { candidate: 'x' });

    expect(wire.filter(line => line.event === 'signal/candidate' && line.direction === 'recv')).toHaveLength(0);
  });
});

describe('control ownership (spec §6)', () => {
  it('reads control/host against its own session id', async () => {
    const { socket, hosts } = await connect();

    socket.emit('control/host', { host_id: 'me-1' });
    socket.emit('control/host', { host_id: 'someone-else' });
    socket.emit('control/host', { host_id: '' });

    expect(hosts).toEqual(['me', 'agent', 'none']);
  });

  it('takes the initial owner from system/init rather than waiting for a change', async () => {
    const { socket, hosts } = await connect({ negotiate: false });

    socket.emit('system/init', { session_id: 'me-1', control_host: { id: 'someone-else' } });

    expect(hosts).toEqual(['agent']);
  });

  it('reports each change once, not on every repeated announcement', async () => {
    const { socket, hosts } = await connect();

    socket.emit('control/host', { host_id: 'me-1' });
    socket.emit('control/host', { host_id: 'me-1' });

    expect(hosts).toEqual(['me']);
  });

  // requestControl is the exception to the gate: it is precisely the message sent without control.
  it('sends control/request without holding control', async () => {
    const { session, socket } = await connect();

    session.requestControl();

    expect(socket.sentOf('control/request')).toHaveLength(1);
  });

  // Every refused control message is rejected *and* logged by the server, so the gate lives here and not
  // only in the UI — a panel bug must not be able to flood somebody else's log.
  it('sends no control or clipboard traffic while not the host', async () => {
    const { session, socket } = await connect();

    session.sendPointer({ type: 'move', x: 5, y: 6 });
    session.sendPointer({ type: 'down', x: 5, y: 6, button: 1 });
    session.sendPointer({ type: 'scroll', x: 5, y: 6, deltaX: 0, deltaY: -3 });
    session.sendKey({ type: 'down', keysym: 0xff0d });
    session.sendKey({ type: 'text', text: 'hi' });
    session.setClipboard('local text');
    session.paste('local text');
    session.releaseControl();

    const control = socket.sent.filter(
      frame => frame.event.startsWith('control/') || frame.event.startsWith('clipboard/'),
    );
    expect(control).toEqual([]);
  });

  it('starts sending once the server grants control, and stops again when it is taken away', async () => {
    const { session, socket } = await connect({ control: true });

    session.sendPointer({ type: 'move', x: 5, y: 6 });
    expect(socket.sentOf('control/move')).toHaveLength(1);

    socket.emit('control/host', { host_id: 'someone-else' });
    session.sendPointer({ type: 'move', x: 7, y: 8 });
    expect(socket.sentOf('control/move')).toHaveLength(1);
  });
});

describe('input forwarding (spec §7)', () => {
  it('rounds pointer coordinates and maps buttons to X11 codes', async () => {
    const { session, socket } = await connect({ control: true });

    session.sendPointer({ type: 'move', x: 10.4, y: 20.6 });
    session.sendPointer({ type: 'down', x: 10.4, y: 20.6, button: 1 });
    session.sendPointer({ type: 'up', x: 10.4, y: 20.6, button: 3 });

    expect(socket.sentOf('control/move')[0].payload).toEqual({ x: 10, y: 21 });
    expect(socket.sentOf('control/buttondown')[0].payload).toEqual({ x: 10, y: 21, code: 1 });
    expect(socket.sentOf('control/buttonup')[0].payload).toEqual({ x: 10, y: 21, code: 3 });
  });

  it('sends scroll deltas in the server field names', async () => {
    const { session, socket } = await connect({ control: true });

    session.sendPointer({ type: 'scroll', x: 1, y: 2, deltaX: 0, deltaY: -10 });

    expect(socket.sentOf('control/scroll')[0].payload).toEqual({ delta_x: 0, delta_y: -10, control_key: false });
  });

  it('passes a caller-computed keysym through untouched', async () => {
    const { session, socket } = await connect({ control: true });

    session.sendKey({ type: 'down', keysym: 0xffe3 });
    session.sendKey({ type: 'up', keysym: 0xffe3 });

    expect(socket.sentOf('control/keydown')[0].payload).toEqual({ keysym: 0xffe3 });
    expect(socket.sentOf('control/keyup')[0].payload).toEqual({ keysym: 0xffe3 });
  });

  it('ignores a down/up with no keysym instead of sending a bogus one', async () => {
    const { session, socket } = await connect({ control: true });

    session.sendKey({ type: 'down' });

    expect(socket.sentOf('control/keydown')).toHaveLength(0);
  });

  // The text path is how CJK reaches a remote with no input method: each composed character becomes a
  // Unicode keysym the remote allocates a keycode for on the spot.
  it('sends one keydown/keyup pair per code point for composed text', async () => {
    const { session, socket } = await connect({ control: true });

    session.sendKey({ type: 'text', text: '你好' });

    expect(socket.sentOf('control/keydown').map(f => f.payload)).toEqual([
      { keysym: 0x01000000 | 0x4f60 },
      { keysym: 0x01000000 | 0x597d },
    ]);
    expect(socket.sentOf('control/keyup')).toHaveLength(2);
  });

  // charCodeAt would split this into two meaningless keysyms.
  it('keeps an astral character as a single keysym', async () => {
    const { session, socket } = await connect({ control: true });

    session.sendKey({ type: 'text', text: '😀' });

    expect(socket.sentOf('control/keydown').map(f => f.payload)).toEqual([{ keysym: 0x01000000 | 0x1f600 }]);
  });

  it('sends clipboard/set and control/paste as distinct operations', async () => {
    const { session, socket } = await connect({ control: true });

    session.setClipboard('copied');
    session.paste('pasted');

    // clipboard/set only writes the remote clipboard; control/paste has the server synthesize Ctrl+V too.
    expect(socket.sentOf('clipboard/set')[0].payload).toEqual({ text: 'copied' });
    expect(socket.sentOf('control/paste')[0].payload).toEqual({ text: 'pasted' });
  });

  it('reports clipboard/updated to the handler', async () => {
    const { socket, clipboards } = await connect({ control: true });

    socket.emit('clipboard/updated', { text: 'from remote' });

    expect(clipboards).toEqual(['from remote']);
  });
});

describe('remote cursor data channel (spec §7.8)', () => {
  function cursorFrame(opcode: number, x: number, y: number): ArrayBuffer {
    const buffer = new ArrayBuffer(7);
    const view = new DataView(buffer);
    view.setUint8(0, opcode);
    view.setUint16(1, 7);
    view.setUint16(3, x);
    view.setUint16(5, y);

    return buffer;
  }

  it('decodes a big-endian cursor frame', () => {
    expect(decodeCursorFrame(cursorFrame(0x01, 640, 360))).toEqual({ x: 640, y: 360 });
  });

  it.each([
    ['another opcode', cursorFrame(0x02, 1, 2)],
    ['a short frame', new ArrayBuffer(4)],
  ])('ignores %s without throwing', (_label, frame) => {
    expect(decodeCursorFrame(frame)).toBeNull();
  });

  it('reports positions arriving on the channel and ignores non-binary frames', async () => {
    const { peer, cursors } = await connect();
    const channel = new FakeDataChannel();

    peer().ondatachannel?.({ channel });
    expect(channel.binaryType).toBe('arraybuffer');

    channel.onmessage?.({ data: cursorFrame(0x01, 100, 200) });
    channel.onmessage?.({ data: 'not binary' });

    expect(cursors).toEqual([{ x: 100, y: 200 }]);
  });
});

describe('teardown (§1.5)', () => {
  it('clears the heartbeat, closes the peer connection and closes the socket', async () => {
    vi.useFakeTimers();
    const { session, socket, peer } = await connect();
    const connection = peer();

    session.close();

    expect(connection.closeCalls).toBe(1);
    expect(socket.closeCalls).toBe(1);

    const heartbeatsAtClose = socket.sentOf('client/heartbeat').length;
    vi.advanceTimersByTime(60_000);
    expect(socket.sentOf('client/heartbeat')).toHaveLength(heartbeatsAtClose);
  });

  // Without this, every deliberate teardown reports a connection error and the panel offers to reconnect
  // to something the caller just ended on purpose.
  it('does not report an error for the close it was asked to perform', async () => {
    const { session, socket, statuses } = await connect();

    session.close();
    socket.onclose?.({ code: 1000 });

    expect(statuses.filter(s => s.status === 'error')).toEqual([]);
  });

  it('does report an error for a close it did not ask for', async () => {
    const { socket, statuses } = await connect();

    socket.onclose?.({ code: 1006 });

    expect(statuses.some(s => s.status === 'error')).toBe(true);
  });

  it('sends nothing after close, even if the caller keeps calling', async () => {
    const { session, socket } = await connect({ control: true });
    const sentAtClose = socket.sent.length;

    session.close();
    session.sendPointer({ type: 'move', x: 1, y: 1 });
    session.sendKey({ type: 'text', text: 'hi' });

    expect(socket.sent).toHaveLength(sentAtClose);
  });
});

describe('robustness', () => {
  it('ignores a frame that is not valid JSON rather than throwing into the socket handler', async () => {
    const { socket } = await connect();

    expect(() => socket.onmessage?.({ data: 'not json' })).not.toThrow();
  });

  it('ignores an unknown event', async () => {
    const { socket, statuses } = await connect();
    const before = statuses.length;

    socket.emit('some/future-event', { a: 1 });

    expect(statuses).toHaveLength(before);
  });

  // The credentials call is re-made per connect, so a pod restart that invalidated the old token cannot be
  // retried with it (spec §7.10).
  it('mints fresh credentials on every connect rather than caching them', async () => {
    const createSession = vi.fn().mockResolvedValue({ wsUrl: 'wss://neko.example.com/api/ws', token: 't' });
    const transport = createSandboxBrowserTransport({ createSession });
    const handlers: SandboxBrowserTransportHandlers = {
      onStream: () => undefined,
      onHostChange: () => undefined,
      onStatus: () => undefined,
    };

    await transport.connect('sbx-1', handlers);
    await transport.connect('sbx-1', handlers);

    expect(createSession).toHaveBeenCalledTimes(2);
  });

  it('propagates a credentials failure instead of opening a socket', async () => {
    const transport = createSandboxBrowserTransport({
      createSession: async () => {
        throw new Error('403 forbidden');
      },
    });

    await expect(
      transport.connect('sbx-1', {
        onStream: () => undefined,
        onHostChange: () => undefined,
        onStatus: () => undefined,
      }),
    ).rejects.toThrow('403 forbidden');
    expect(FakeWebSocket.instances).toHaveLength(0);
  });
});
