import { ReactNode, useCallback, useMemo, useState } from 'react';
import type { LaunchedSandbox } from '@asgard-js/core';
import { SandboxBrowserPanel, useSandboxBrowserController } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import { createNekoLabTransport } from './neko-transport';
import { CHECKS, CHECK_GROUPS } from './checklist';
import styles from './neko-lab.module.scss';

// F-035 — the input lab. **Only runs against a container on your own machine, and that is deliberate.**
//
// Everything else in this demo app is mocked, on purpose. This page is the exception, because the whole
// class of bug it exists for — wrong keysym, latched modifier, half-composed IME output, drifting
// coordinates — is invisible without a real X11 server on the other end. A mock is green for all of it.
//
// Two details in here are worth copying rather than reinventing:
//
//  1. It renders the **same** `<SandboxBrowserPanel>` the product does, with only the transport's
//     credential source swapped. That is simultaneously the point of the lab and a check on the seam.
//  2. The "still held on the remote" panel is computed from the **wire messages we sent** (keydown adds,
//     keyup removes), not from browser events. A stuck key *is* "we sent down and never sent up", so
//     deriving it from our own intentions could never show one.

const LAB_SANDBOX: LaunchedSandbox[] = [
  {
    sandboxName: 'neko-local',
    sandboxBlueprintName: 'lab',
    workingDirectory: '/home/neko',
    editorServerEnabled: false,
    browserEnabled: true,
  },
];

const DOCKER_COMMAND = `docker run -d --name neko-lab --shm-size 2g \\
  -p 18090:8080 -p 52000:52000/tcp -p 52000:52000/udp \\
  -e NEKO_WEBRTC_UDPMUX=52000 \\
  -e NEKO_WEBRTC_TCPMUX=52000 \\
  -e NEKO_WEBRTC_NAT1TO1=127.0.0.1 \\
  -e NEKO_DESKTOP_SCREEN=1280x720@30 \\
  -e NEKO_MEMBER_MULTIUSER_USER_PASSWORD=neko \\
  -e NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD=admin \\
  -e NEKO_SERVER_CORS='*' \\
  ghcr.io/m1k1o/neko/chromium:3.1.4

# 收工
docker rm -f neko-lab`;

interface WireLine {
  n: number;
  direction: 'send' | 'recv';
  event: string;
}

/** A readable name for a keysym, so the held-key panel is legible. */
function keysymName(keysym: number): string {
  const NAMES: Record<number, string> = {
    0xff08: 'Backspace',
    0xff09: 'Tab',
    0xff0d: 'Enter',
    0xff1b: 'Esc',
    0xff51: '←',
    0xff52: '↑',
    0xff53: '→',
    0xff54: '↓',
    0xffe1: 'Shift',
    0xffe3: 'Control',
    0xffe9: 'Alt',
    0xffeb: 'Super',
    0xffe7: 'Meta',
  };
  if (NAMES[keysym]) return NAMES[keysym];

  if (keysym >= 0x20 && keysym <= 0x7e) return `'${String.fromCharCode(keysym)}'`;

  if (keysym >= 0x01000000) return String.fromCodePoint(keysym - 0x01000000);

  return `0x${keysym.toString(16)}`;
}

export function NekoLabRoute(): ReactNode {
  const [baseUrl, setBaseUrl] = useState('http://127.0.0.1:18090');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const [started, setStarted] = useState(false);
  const [wire, setWire] = useState<WireLine[]>([]);
  const [held, setHeld] = useState<number[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const controller = useSandboxBrowserController({ open: true, activeSandboxName: 'neko-local' });

  const onWire = useCallback((direction: 'send' | 'recv', event: string, payload?: unknown): void => {
    setWire(previous => [...previous.slice(-200), { n: previous.length + 1, direction, event }]);

    // Held keys, derived from what we actually put on the wire.
    if (direction !== 'send') return;

    const keysym = (payload as { keysym?: number } | undefined)?.keysym;
    if (typeof keysym !== 'number') return;

    if (event === 'control/keydown')
      setHeld(previous => (previous.includes(keysym) ? previous : [...previous, keysym]));

    if (event === 'control/keyup') setHeld(previous => previous.filter(item => item !== keysym));
  }, []);

  const transport = useMemo(
    () => (started ? createNekoLabTransport({ baseUrl, username, password }, onWire) : null),
    [started, baseUrl, username, password, onWire],
  );

  const doneCount = CHECKS.filter(check => checked[check.id]).length;

  return (
    <DemoWrapper
      title="Neko 輸入實驗室 (F-035)"
      description="接一個跑在你自己機器上的 neko 容器，逐項驗規格 §10.2 的 26 個項目。這一頁刻意只在本機跑得起來：輸入轉送的坑（keysym、修飾鍵卡住、IME 送半成品、座標偏移）在 mock 上永遠是綠的，只有真的接上去才踩得到。"
    >
      <div className={styles.stack}>
        <div className={styles.setup}>
          <div className={styles.setupTitle}>先把容器跑起來</div>
          <pre className={styles.cmd}>{DOCKER_COMMAND}</pre>
          <ul className={styles.traps}>
            <li>
              <strong>image tag 要跟 asgard-core 釘的同一個</strong>（<code>chromium:3.1.4</code>），踩到的才是真的坑。
            </li>
            <li>
              <code>UDPMUX</code> / <code>TCPMUX</code> 用<strong>單一 port</strong>：Docker Desktop for Mac 的 UDP port
              range 轉發不可靠，症狀是登入後一片黑。
            </li>
            <li>
              <code>NAT1TO1</code> 多個 IP 要用<strong>空白</strong>分隔；逗號會讓 server 完全不產生
              candidate，而容器仍然 healthy。
            </li>
            <li>
              <code>NEKO_SERVER_CORS</code> 必須設，否則連 <code>/api/login</code> 都會被 preflight 擋掉。
            </li>
            <li>
              <strong>host port 不要用 8080</strong>：本機跑 Tilt 時那是 edgeserver 的 port-forward，會拿到它的 404，
              看起來像 neko 沒有這條路由。
            </li>
          </ul>

          <div className={styles.controls}>
            <label>
              baseUrl{' '}
              <input value={baseUrl} onChange={event => setBaseUrl(event.target.value)} size={24} disabled={started} />
            </label>
            <label>
              user{' '}
              <input value={username} onChange={event => setUsername(event.target.value)} size={8} disabled={started} />
            </label>
            <label>
              pass{' '}
              <input
                value={password}
                onChange={event => setPassword(event.target.value)}
                size={8}
                type="password"
                disabled={started}
              />
            </label>
            <button type="button" onClick={(): void => setStarted(value => !value)}>
              {started ? '中斷連線' : '連線'}
            </button>
            <button
              type="button"
              onClick={(): void => {
                setWire([]);
                setHeld([]);
              }}
            >
              清空記錄
            </button>
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.panelBox}>
            {transport ? (
              <SandboxBrowserPanel
                sandboxes={LAB_SANDBOX}
                controller={controller}
                transport={transport}
                locale="zh-TW"
              />
            ) : (
              <div className={styles.card}>
                <div className={styles.cardTitle}>尚未連線</div>
                <div className={styles.cardHint}>把容器跑起來，然後按上面的「連線」。</div>
              </div>
            )}
          </div>

          <div className={styles.side}>
            <div className={styles.card}>
              <div className={styles.cardTitle}>遠端還按著的鍵</div>
              <div className={styles.cardHint}>
                從<strong>送出去的 wire 訊息</strong>推算（keydown 累加、keyup 扣除），不是從瀏覽器事件推 ——
                卡鍵的定義就是「我們送了 down 卻沒送 up」。放開所有鍵之後這裡應該是空的。
              </div>
              <div className={styles.held}>
                {held.length === 0 ? (
                  <span className={styles.heldEmpty}>（空的 —— 正常）</span>
                ) : (
                  held.map(keysym => (
                    <span key={keysym} className={styles.heldKey}>
                      {keysymName(keysym)}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardTitle}>
                驗收清單（{doneCount} / {CHECKS.length}）
              </div>
              {CHECK_GROUPS.map(group => (
                <div key={group} className={styles.checkGroup}>
                  <div className={styles.checkGroupTitle}>{group}</div>
                  {CHECKS.filter(check => check.group === group).map(check => (
                    <label key={check.id} className={styles.check}>
                      <input
                        type="checkbox"
                        checked={Boolean(checked[check.id])}
                        onChange={(): void =>
                          setChecked(previous => ({ ...previous, [check.id]: !previous[check.id] }))
                        }
                      />
                      <span>
                        {check.label}
                        <span className={styles.checkWhy}>{check.why}</span>
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </div>

            <div className={styles.card}>
              <div className={styles.cardTitle}>WebSocket 訊息（{wire.length}）</div>
              <div className={styles.cardHint}>control/move 刻意排除，否則什麼都看不到。</div>
              <div className={styles.wire}>
                {wire.length === 0 ? (
                  <div className={styles.heldEmpty}>（還沒有訊息）</div>
                ) : (
                  wire.map(line => (
                    <div key={line.n} className={line.direction === 'send' ? styles.wireSend : styles.wireRecv}>
                      {line.direction === 'send' ? '→' : '←'} {line.event}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DemoWrapper>
  );
}

export default NekoLabRoute;
