// F-035 — the Neko protocol client (spec §5 / §6 / §7). Framework-agnostic: one WebSocket, one
// RTCPeerConnection, one set of X11 input messages. Nothing here touches the DOM.
//
// The protocol has three properties that contradict what a WebRTC example would lead you to write, and all
// three fail silently:
//
//   1. **The server is the offerer.** We receive `signal/provide` and answer it. Most examples are the
//      other way round.
//   2. **`signal/candidate` arrives before `signal/provide`.** Candidates that show up before the peer
//      connection exists must be buffered and flushed after `setRemoteDescription`. This is not an
//      optimization — drop them and the connection never establishes, with no error anywhere.
//   3. **A refused `control/request` produces no reply.** The server writes its own log and says nothing
//      to us. So the caller has to time out on its own, and must never send a control message it does not
//      already believe it is entitled to send — every one of those is rejected and floods the server log.
//
// Reference: the prototype's lab transport, asgard-core `dev/webrtc-probe/client.html`, and neko upstream
// `server/pkg/types/event/events.go`.
import type {
  BrowserHost,
  RemoteKeyEvent,
  RemotePointerEvent,
  SandboxBrowserSession,
  SandboxBrowserSessionCredentials,
  SandboxBrowserTransport,
  SandboxBrowserTransportHandlers,
} from '../types/sandbox-browser';
import { charToKeysym } from './keysym';

/** How often to tell the server we are still here. Upstream's interval. */
const HEARTBEAT_INTERVAL_MS = 10_000;

/** How long to wait for the socket to open before giving up. */
const OPEN_TIMEOUT_MS = 8_000;

/**
 * Cursor position opcode on the binary data channel
 * (neko `server/internal/webrtc/payload/send.go`).
 */
const OP_CURSOR_POSITION = 0x01;

/** `[event:u8][length:u16][X:u16][Y:u16]`, big-endian — the length field counts the header, so 7. */
const CURSOR_FRAME_BYTES = 7;

/** Volume-only exclusion: `control/move` would drown out every other line in a diagnostic log. */
const WIRE_LOG_EXCLUDED = new Set(['control/move']);

/** One `{event, payload}` frame as it travels the socket. */
interface NekoMessage {
  event: string;
  payload?: Record<string, unknown>;
}

/**
 * Decode one data-channel frame into a cursor position, or `null` if it is not one.
 *
 * Exported for its own unit test: the frame layout is three big-endian reads at fixed offsets, and getting
 * one offset wrong puts the remote cursor somewhere plausible but wrong — which looks like a rendering bug,
 * not a decoding one.
 */
export function decodeCursorFrame(data: ArrayBuffer): { x: number; y: number } | null {
  if (data.byteLength < CURSOR_FRAME_BYTES) return null;

  const view = new DataView(data);
  if (view.getUint8(0) !== OP_CURSOR_POSITION) return null;

  return { x: view.getUint16(3), y: view.getUint16(5) };
}

/** How the transport obtains `{ wsUrl, token }`. Injected so the lab can swap in a direct Neko login. */
export type SandboxBrowserCredentialSource = (sandboxName: string) => Promise<SandboxBrowserSessionCredentials>;

export interface SandboxBrowserTransportOptions {
  /** Mints connection credentials — normally `client.createSandboxBrowserSession.bind(client)`. */
  createSession: SandboxBrowserCredentialSource;
  /** Display name announced in `signal/answer`. Cosmetic; shows up in Neko's member list. */
  displayName?: string;
}

/**
 * Build a transport over the Neko protocol.
 *
 * Credentials are fetched per `connect()` call rather than cached, which is what makes reconnection
 * correct: the token has no TTL but lives in the server's memory, so a pod restart invalidates it, and
 * retrying with the old one fails in a way that looks like a network problem (spec §7.10).
 */
export function createSandboxBrowserTransport(options: SandboxBrowserTransportOptions): SandboxBrowserTransport {
  return {
    async connect(sandboxName: string, handlers: SandboxBrowserTransportHandlers): Promise<SandboxBrowserSession> {
      handlers.onStatus('connecting');

      const { wsUrl, token } = await options.createSession(sandboxName);

      const separator = wsUrl.includes('?') ? '&' : '?';
      const socket = new WebSocket(`${wsUrl}${separator}token=${encodeURIComponent(token)}`);

      let peer: RTCPeerConnection | null = null;
      let sessionId: string | null = null;
      let host: BrowserHost = 'none';
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let closed = false;
      /** Id of the stream already handed to the caller — `ontrack` fires per track, not per stream. */
      let announcedStreamId: string | null = null;

      /** Candidates that arrived before the peer connection existed (see the header, point 2). */
      const pendingCandidates: RTCIceCandidateInit[] = [];

      const send = (event: string, payload?: Record<string, unknown>): void => {
        if (socket.readyState !== WebSocket.OPEN) return;

        socket.send(JSON.stringify({ event, payload }));
        if (!WIRE_LOG_EXCLUDED.has(event)) handlers.onWire?.('send', event, payload);
      };

      /**
       * Control-gated send. Spec §6: without control every one of these is refused *and* logged by the
       * server, so the gate belongs here rather than only in the UI — a panel bug should not be able to
       * flood somebody else's log.
       */
      const sendControlled = (event: string, payload?: Record<string, unknown>): void => {
        if (host !== 'me') return;

        send(event, payload);
      };

      const setHost = (next: BrowserHost): void => {
        if (host === next) return;

        host = next;
        handlers.onHostChange(next);
      };

      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error('Sandbox browser WebSocket connection timed out.')),
            OPEN_TIMEOUT_MS,
          );
          socket.onopen = (): void => {
            clearTimeout(timer);
            resolve();
          };

          socket.onerror = (): void => {
            clearTimeout(timer);
            reject(new Error('Sandbox browser WebSocket failed to connect.'));
          };
        });
      } catch (error) {
        // Close what we opened before giving up. `connect()` rejecting hands the caller no session, so
        // this socket has no other owner — left alone it stays pending, or connects moments later and
        // lives for the rest of the page, and the retry path stacks another one on top every attempt.
        closed = true;
        socket.close();

        throw error;
      }

      socket.onclose = (event: CloseEvent): void => {
        // A close we asked for is not a failure. Without this guard, every teardown reports an error and
        // the panel offers to reconnect to something the caller deliberately ended.
        if (closed) return;

        handlers.onStatus('error', `Sandbox browser connection closed (code ${event.code}).`);
        handlers.onWire?.('recv', 'ws/close', { code: event.code });
      };

      const handleProvide = async (payload: Record<string, unknown>): Promise<void> => {
        const connection = new RTCPeerConnection({
          // Use the server's ICE configuration verbatim. The platform injects the pod's TURN URLs and
          // time-limited credentials, and they arrive here untouched — the client never needs to know how
          // the media gateway is deployed, and must not carry its own.
          iceServers: (payload.iceservers as RTCIceServer[] | undefined) ?? [],
        });
        peer = connection;

        connection.onicecandidate = (event: RTCPeerConnectionIceEvent): void => {
          if (event.candidate) send('signal/candidate', event.candidate.toJSON() as Record<string, unknown>);
        };

        connection.oniceconnectionstatechange = (): void => {
          handlers.onWire?.('recv', 'ice/state', connection.iceConnectionState);
          if (connection.iceConnectionState === 'failed') {
            handlers.onStatus('error', 'ICE connection failed.');
          }
        };

        connection.ontrack = (event: RTCTrackEvent): void => {
          const [stream] = event.streams;
          if (!stream) return;

          // `ontrack` fires **once per track**, and the offer carries both audio and video — measured
          // against a real container, where this ran twice for one stream. Reporting twice would have the
          // panel reassign `srcObject` to a stream it is already playing, which restarts playback. Only a
          // genuinely different stream is worth announcing.
          if (announcedStreamId === stream.id) return;

          announcedStreamId = stream.id;

          handlers.onStream(stream);
          handlers.onStatus('live');
        };

        connection.ondatachannel = (event: RTCDataChannelEvent): void => {
          const channel = event.channel;
          channel.binaryType = 'arraybuffer';
          channel.onmessage = (message: MessageEvent): void => {
            if (!(message.data instanceof ArrayBuffer)) return;

            const position = decodeCursorFrame(message.data);
            if (position) handlers.onRemoteCursor?.(position);
          };
        };

        await connection.setRemoteDescription({ type: 'offer', sdp: payload.sdp as string });

        // Flush only now: addIceCandidate before setRemoteDescription throws.
        for (const candidate of pendingCandidates.splice(0)) {
          await connection.addIceCandidate(candidate).catch(() => undefined);
        }

        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        send('signal/answer', { sdp: answer.sdp, displayname: options.displayName ?? 'asgard-js-sdk' });
      };

      socket.onmessage = (event: MessageEvent): void => {
        let message: NekoMessage;
        try {
          message = JSON.parse(String(event.data)) as NekoMessage;
        } catch {
          return; // A frame we cannot parse is not a frame we can act on.
        }

        const payload = message.payload ?? {};
        if (message.event !== 'signal/candidate') handlers.onWire?.('recv', message.event, payload);

        switch (message.event) {
          case 'system/init': {
            sessionId = (payload.session_id as string | undefined) ?? null;
            // `system/init` already states who holds control, so the initial value comes from here rather
            // than waiting for a `control/host` that may not arrive until somebody changes it.
            const initialHost = (payload.control_host as Record<string, unknown> | undefined) ?? undefined;
            const initialHostId = (initialHost?.id as string | undefined) ?? undefined;
            if (initialHostId !== undefined) {
              setHost(!initialHostId ? 'none' : initialHostId === sessionId ? 'me' : 'agent');
            }

            return;
          }

          case 'control/host': {
            const hostId = (payload.host_id as string | undefined) ?? null;
            setHost(!hostId ? 'none' : hostId === sessionId ? 'me' : 'agent');

            return;
          }

          case 'clipboard/updated': {
            handlers.onClipboardChange?.((payload.text as string | undefined) ?? '');

            return;
          }

          case 'signal/provide':
          case 'signal/offer': {
            // The server can renegotiate on its own, so `signal/offer` runs the same path.
            void handleProvide(payload).catch((error: unknown) => {
              handlers.onStatus('error', error instanceof Error ? error.message : String(error));
            });

            return;
          }

          case 'signal/candidate': {
            const candidate = payload as RTCIceCandidateInit;
            if (peer?.remoteDescription) void peer.addIceCandidate(candidate).catch(() => undefined);
            else pendingCandidates.push(candidate);

            return;
          }

          default:
            return;
        }
      };

      send('signal/request', { video: {}, audio: {} });
      heartbeat = setInterval(() => send('client/heartbeat', {}), HEARTBEAT_INTERVAL_MS);

      return {
        requestControl(): void {
          // Not control-gated: this is the message you send *because* you do not have control.
          send('control/request', {});
        },
        releaseControl(): void {
          sendControlled('control/release', {});
        },
        sendPointer(event: RemotePointerEvent): void {
          const x = Math.round(event.x);
          const y = Math.round(event.y);

          if (event.type === 'move') {
            sendControlled('control/move', { x, y });

            return;
          }

          if (event.type === 'scroll') {
            sendControlled('control/scroll', {
              delta_x: Math.round(event.deltaX ?? 0),
              delta_y: Math.round(event.deltaY ?? 0),
              control_key: false,
            });

            return;
          }

          sendControlled(event.type === 'down' ? 'control/buttondown' : 'control/buttonup', {
            x,
            y,
            code: event.button ?? 1,
          });
        },
        sendKey(event: RemoteKeyEvent): void {
          if (event.type === 'text') {
            // `for...of` iterates code points, so an astral character stays one keysym instead of becoming
            // two meaningless surrogate halves.
            for (const character of event.text ?? '') {
              const keysym = charToKeysym(character);
              sendControlled('control/keydown', { keysym });
              sendControlled('control/keyup', { keysym });
            }

            return;
          }

          // The keysym is the caller's: turning a KeyboardEvent into one is the panel's job (see the
          // module header of `types/sandbox-browser.ts`).
          if (typeof event.keysym !== 'number') return;

          sendControlled(event.type === 'down' ? 'control/keydown' : 'control/keyup', { keysym: event.keysym });
        },
        setClipboard(text: string): void {
          // The server requires both `CanAccessClipboard` and that the caller is the host; failing either
          // is silent, so the gate matters more here than it looks.
          sendControlled('clipboard/set', { text });
        },
        paste(text: string): void {
          sendControlled('control/paste', { text });
        },
        close(): void {
          closed = true;
          if (heartbeat) clearInterval(heartbeat);

          heartbeat = undefined;
          peer?.close();
          peer = null;
          socket.close();
        },
      };
    },
  };
}
