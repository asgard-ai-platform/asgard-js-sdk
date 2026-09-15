import type {
  BrowserHost,
  RemoteKeyEvent,
  RemotePointerEvent,
  SandboxBrowserSession,
  SandboxBrowserTransport,
  SandboxBrowserTransportHandlers,
} from '@asgard-js/core';

// F-035 — a mock transport that touches no network.
//
// It draws to a canvas and hands back `canvas.captureStream()` rather than showing a still image, because
// the panel consumes `<video srcObject>` and `srcObject` only accepts a `MediaStream`. A real stream means
// the panel runs exactly the code path it runs against WebRTC — `ontrack` → `srcObject` → letterbox
// conversion — so this route can exercise coordinates, stuck keys and IME. An image would only prove the
// layout.
//
// The scene is an agent stuck on a login page, because that is the situation the card exists for.
//
// **There is deliberately no agent cursor.** The agent drives Chromium over CDP, whose input is injected
// into the renderer and never reaches X11, so the real remote pointer does not move while it works. What a
// user actually sees change is the page content. Drawing a gliding arrow here would teach the wrong thing
// and send somebody hunting for a bug that does not exist.

const W = 1280;
const H = 720;
const FPS = 24;

interface Point {
  x: number;
  y: number;
}

/** The agent's script: visit these points, pausing to act. */
const SCRIPT: Array<{ at: Point; hold: number; type?: string; into?: 'email' | 'code' }> = [
  { at: { x: 640, y: 300 }, hold: 900 },
  { at: { x: 470, y: 352 }, hold: 700, type: 'ops@asgard-ai.com', into: 'email' },
  { at: { x: 470, y: 430 }, hold: 1400 },
  { at: { x: 640, y: 505 }, hold: 900 },
  { at: { x: 470, y: 430 }, hold: 2600, into: 'code' },
];

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createMockBrowserTransport(onLog?: (line: string) => void): SandboxBrowserTransport {
  return {
    async connect(sandboxName: string, handlers: SandboxBrowserTransportHandlers): Promise<SandboxBrowserSession> {
      handlers.onStatus('connecting');
      onLog?.(`POST …/sandbox/${sandboxName}/browser/session → { wsUrl, token } (mock)`);

      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('This browser has no canvas 2d context, so the mock stream cannot be produced.');

      let host: BrowserHost = 'agent';
      let cursor: Point = { x: 640, y: 300 };
      let target: Point = { x: 640, y: 300 };
      let step = 0;
      let stepStartedAt = performance.now();
      let emailText = '';
      let codeText = '';
      let clickFlash = 0;
      let remoteClipboard = '';
      let disposed = false;
      let scriptTimer: number | undefined;

      const setHost = (next: BrowserHost): void => {
        if (host === next) return;

        host = next;
        handlers.onHostChange(next);
      };

      const advance = (): void => {
        if (disposed || host !== 'agent') return;

        const current = SCRIPT[step % SCRIPT.length];
        target = current.at;
        if (current.type && current.into === 'email') emailText = current.type;

        step += 1;
        stepStartedAt = performance.now();
        scriptTimer = window.setTimeout(advance, current.hold);
      };

      const draw = (): void => {
        // The agent's pointer is not drawn (see the header) — but the page still reacts, which is the
        // only thing a viewer really sees.
        cursor = { x: cursor.x + (target.x - cursor.x) * 0.12, y: cursor.y + (target.y - cursor.y) * 0.12 };

        ctx.fillStyle = '#f1f3f4';
        ctx.fillRect(0, 0, W, H);

        // browser chrome
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, 64);
        ctx.fillStyle = '#e8eaed';
        ctx.fillRect(0, 64, W, 1);
        ctx.fillStyle = '#f1f3f4';
        roundRect(ctx, 120, 16, W - 260, 32, 16);
        ctx.fill();
        ctx.fillStyle = '#5f6368';
        ctx.font = '13px -apple-system, "PingFang TC", sans-serif';
        ctx.fillText('https://accounts.example.com/signin/challenge', 140, 37);

        // card
        ctx.fillStyle = '#ffffff';
        roundRect(ctx, 340, 140, 600, 440, 10);
        ctx.fill();
        ctx.strokeStyle = '#e8eaed';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#202124';
        ctx.font = '600 22px -apple-system, "PingFang TC", sans-serif';
        ctx.fillText('兩步驟驗證', 380, 200);
        ctx.fillStyle = '#5f6368';
        ctx.font = '13px -apple-system, "PingFang TC", sans-serif';
        ctx.fillText('請輸入寄到你信箱的 6 位數驗證碼', 380, 232);

        // email field (filled by the agent)
        ctx.fillStyle = '#ffffff';
        roundRect(ctx, 380, 330, 520, 44, 6);
        ctx.fill();
        ctx.strokeStyle = '#dadce0';
        ctx.stroke();
        ctx.fillStyle = emailText ? '#202124' : '#9aa0a6';
        ctx.font = '14px -apple-system, "PingFang TC", sans-serif';
        ctx.fillText(emailText || '電子郵件', 398, 358);

        // code field — where the agent stops, because it cannot read the mailbox
        ctx.fillStyle = '#ffffff';
        roundRect(ctx, 380, 408, 520, 44, 6);
        ctx.fill();
        ctx.strokeStyle = host === 'me' ? '#1a73e8' : '#dadce0';
        ctx.lineWidth = host === 'me' ? 2 : 1;
        ctx.stroke();
        ctx.fillStyle = codeText ? '#202124' : '#9aa0a6';
        ctx.font = '14px -apple-system, "PingFang TC", sans-serif';
        ctx.fillText(codeText || '6 位數驗證碼', 398, 436);

        if (host === 'me' && Math.floor(performance.now() / 500) % 2 === 0) {
          const width = ctx.measureText(codeText).width;
          ctx.fillStyle = '#202124';
          ctx.fillRect(399 + width, 422, 1.5, 18);
        }

        ctx.fillStyle = '#1a73e8';
        roundRect(ctx, 380, 486, 140, 40, 6);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 14px -apple-system, "PingFang TC", sans-serif';
        ctx.fillText('驗證', 428, 511);

        // A click ripple stands in for what a real page does in response to a click: focus rings, :active
        // states, navigation.
        if (clickFlash > 0) {
          ctx.beginPath();
          ctx.arc(cursor.x, cursor.y, 10 + (1 - clickFlash) * 22, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(26,115,232,${clickFlash * 0.7})`;
          ctx.lineWidth = 2;
          ctx.stroke();
          clickFlash = Math.max(0, clickFlash - 0.05);
        }

        // Elapsed time is read so the script's pacing is observable; nothing is drawn from it.
        void stepStartedAt;
      };

      const drawTimer = window.setInterval(draw, Math.round(1000 / FPS));
      draw();

      // Capture only after something has been drawn, or the first frame is blank.
      const stream = canvas.captureStream(FPS);

      await new Promise(resolve => window.setTimeout(resolve, 700));
      if (disposed) throw new Error('cancelled');

      handlers.onStream(stream);
      handlers.onStatus('live');
      handlers.onHostChange('agent');
      onLog?.('ontrack → srcObject (mock: canvas captureStream)');
      advance();

      return {
        requestControl(): void {
          // A real server answers with `control/host`, or with nothing at all if it refuses — which is why
          // the panel has its own timeout. This mock always grants.
          onLog?.('control/request → (mock: control/host in 200ms)');
          window.setTimeout(() => !disposed && setHost('me'), 200);
        },
        releaseControl(): void {
          onLog?.('control/release → the agent takes over again');
          setHost('agent');
          stepStartedAt = performance.now();
          advance();
        },
        sendPointer(event: RemotePointerEvent): void {
          if (host !== 'me') return;

          cursor = { x: event.x, y: event.y };
          if (event.type === 'down') clickFlash = 1;
        },
        sendKey(event: RemoteKeyEvent): void {
          if (host !== 'me') return;

          if (event.type === 'text' && event.text) {
            codeText = (codeText + event.text).slice(0, 24);

            return;
          }

          if (event.type === 'down' && event.keysym === 0xff08) codeText = codeText.slice(0, -1);
        },
        setClipboard(text: string): void {
          // `clipboard/set` writes the remote clipboard and pastes nothing — so the picture must not change.
          remoteClipboard = text;
          onLog?.(`clipboard/set → remote clipboard now holds ${text.length} chars (nothing should move)`);
        },
        paste(text: string): void {
          // `control/paste` has the server set the clipboard *and* synthesize Ctrl+V, so text does appear.
          if (text) remoteClipboard = text;

          if (host !== 'me') return;

          codeText = (codeText + remoteClipboard).slice(0, 24);
          onLog?.(`control/paste → remote pasted ${remoteClipboard.length} chars`);
        },
        close(): void {
          disposed = true;
          window.clearInterval(drawTimer);
          if (scriptTimer) window.clearTimeout(scriptTimer);

          stream.getTracks().forEach(track => track.stop());
          onLog?.('session.close() → stream stopped');
        },
      };
    },
  };
}
