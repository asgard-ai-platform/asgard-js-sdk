import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Channel, SandboxWakeResult } from '@asgard-js/core';
import { Chatbot, ChatbotRef, Locale, useLaunchedSandboxes, useSandboxWakeState } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import styles from './sandbox-download.module.scss';

// F-038 — the sandbox download card and the channel's one shared wake. Everything the server does is the
// mock's (`sse-mock.ts`, `sandbox-download-` prefix): whether the sandbox is up, how long a nudge takes,
// and which fault to inject. The control panel reads and writes that state, so the cases a live backend
// will not reproduce on demand — a recycled sandbox, stale metadata, a truncated body, a failed wake — are
// one click away.
//
// The wake store panel and the "wake from elsewhere" button sit *outside* the Chatbot on purpose: they read
// and drive the same `channel.sandboxWake$` the File Explorer and the cards read, which is the whole point.

const config = {
  botProviderEndpoint: `${typeof window !== 'undefined' ? window.location.origin : ''}/mock-asgard`,
};

const CONTROL_URL = '/mock-asgard/__sandbox-download';
const SANDBOX_NAME = 'sbx-download-demo';

type Fault = 'none' | 'not-found' | 'stale-live' | 'incomplete' | 'wake-failed';

interface MockState {
  live: boolean;
  wakeMs: number;
  fault: Fault;
  nudges: number;
}

const FAULTS: { id: Fault; label: string }[] = [
  { id: 'none', label: '無' },
  { id: 'not-found', label: '404 檔案已不存在' },
  { id: 'stale-live', label: 'metadata 落後（列著它，fs 回 412）' },
  { id: 'incomplete', label: '斷流（收到 < X-Total-Bytes）' },
  { id: 'wake-failed', label: '喚醒失敗（nudge 結束但沒起來）' },
];

const WIDE_THEME = { chatbot: { width: '100%', height: '100%' } };

// zh-TW first: the card's state lines are the longest strings this feature adds, and Chinese is where Asgard's
// users read them.
const LOCALES: Locale[] = ['zh-TW', 'en-US', 'ja-JP'];

async function postState(patch: Partial<MockState>): Promise<MockState> {
  const res = await fetch(CONTROL_URL, { method: 'POST', body: JSON.stringify(patch) });

  return (await res.json()) as MockState;
}

function StorePanel({ title, channel }: { title: string; channel: Channel | null }): ReactNode {
  const { phase } = useSandboxWakeState(channel);
  // Polling off: the panel only mirrors what the shell itself already fetched.
  const live = useLaunchedSandboxes(channel, { pollMs: 0, refetchOnVisible: false });

  return (
    <div className={styles.panel}>
      <div className={styles.panel__head}>{title}</div>
      <div>
        sandboxWake$ ：<span className={styles.value}>{phase}</span>
      </div>
      <div>
        launchedSandboxes ：<span className={styles.value}>{live.map(s => s.sandboxName).join(', ') || '（無）'}</span>
      </div>
    </div>
  );
}

export function SandboxDownloadRoute(): ReactNode {
  const wideRef = useRef<ChatbotRef>(null);
  const narrowRef = useRef<ChatbotRef>(null);
  const [wideChannel, setWideChannel] = useState<Channel | null>(null);
  const [narrowChannel, setNarrowChannel] = useState<Channel | null>(null);
  const [mock, setMock] = useState<MockState | null>(null);
  const [lastWake, setLastWake] = useState<SandboxWakeResult | null>(null);
  const [locale, setLocale] = useState<Locale>('zh-TW');

  // The mock counts nudges server-side; poll it so "three cards = one nudge" can be read off the page.
  useEffect(() => {
    let alive = true;
    const read = (): void => {
      void fetch(CONTROL_URL)
        .then(res => res.json() as Promise<MockState>)
        .then(state => alive && setMock(state));
    };

    read();
    const id = window.setInterval(read, 1000);

    return (): void => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const update = useCallback(
    async (patch: Partial<MockState>): Promise<void> => {
      setMock(await postState(patch));
      // metadata is the authority on "who is live" — re-read it so the shells follow the switch at once.
      await Promise.all([wideChannel?.refetchMetadata(), narrowChannel?.refetchMetadata()]);
    },
    [wideChannel, narrowChannel],
  );

  const wakeFromElsewhere = useCallback(async (): Promise<void> => {
    setLastWake(null);
    setLastWake((await wideRef.current?.serviceContext?.wakeSandbox?.(SANDBOX_NAME)) ?? null);
  }, []);

  return (
    <DemoWrapper
      title="Sandbox Download Card (F-038)"
      description="下載卡 sandbox://<name>/download-file 與 channel 層唯一的喚醒。sandbox 沒在跑時，點卡片會先喚醒、醒了自動下載；檔案總管的喚醒鈕、下載卡、下方的「從別處喚醒」讀寫的是同一份 sandboxWake$ —— 任何一處發動，另外兩處立刻顯示喚醒中，且全 channel 只送一次 nudge。打開標題列的資料夾鈕看檔案總管。"
    >
      <div className={styles.stack}>
        <div className={styles.controls}>
          <label>
            <input
              type="checkbox"
              checked={mock?.live ?? false}
              onChange={(e): void => void update({ live: e.target.checked })}
            />
            sandbox 在跑
          </label>
          <label>
            喚醒耗時
            <select
              value={mock?.wakeMs ?? 4000}
              onChange={(e): void => void update({ wakeMs: Number(e.target.value) })}
            >
              {[1500, 4000, 8000].map(ms => (
                <option key={ms} value={ms}>
                  {ms / 1000}s
                </option>
              ))}
            </select>
          </label>
          <label>
            故障注入
            <select
              value={mock?.fault ?? 'none'}
              onChange={(e): void => void update({ fault: e.target.value as Fault })}
            >
              {FAULTS.map(f => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={(): void => void update({ live: false, fault: 'none', nudges: 0 })}>
            重設（回收 sandbox、清計數）
          </button>
          <button type="button" onClick={(): void => void wakeFromElsewhere()}>
            從別處喚醒（寬版 channel.wakeSandbox）
          </button>
          <label>
            語系
            <select value={locale} onChange={(e): void => setLocale(e.target.value as Locale)}>
              {LOCALES.map(l => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles.panels}>
          <div className={styles.panel}>
            <div className={styles.panel__head}>mock server</div>
            <div>
              收到的 NUDGE ：<span className={styles.value}>{mock?.nudges ?? '—'}</span>
            </div>
            <div>
              「從別處喚醒」結果 ：<span className={styles.value}>{lastWake ?? '—'}</span>
            </div>
          </div>
          <StorePanel title="寬版 channel" channel={wideChannel} />
          <StorePanel title="窄版 channel" channel={narrowChannel} />
        </div>
        <p className={styles.hint}>
          兩個 shell 是兩個 channel，各有一份喚醒狀態；但共用同一台 mock sandbox，所以一邊喚醒後另一邊下次重拉 metadata
          也會看到它活著。
        </p>

        <div className={styles.stage}>
          <div className={styles.chatbotWide}>
            <div className={styles.sizeLabel}>寬版 —— 消費端實際的掛法</div>
            <div className={styles.wideBox}>
              <Chatbot
                ref={wideRef}
                title="Agent Hub"
                config={config}
                customChannelId="sandbox-download-demo"
                locale={locale}
                theme={WIDE_THEME}
                onChannelReady={(): void => setWideChannel(wideRef.current?.serviceContext?.channel ?? null)}
              />
            </div>
          </div>

          <div className={styles.chatbotNarrow}>
            <div className={styles.sizeLabel}>窄版 375×640 —— SDK 預設 theme</div>
            <div className={styles.narrowBox}>
              <Chatbot
                ref={narrowRef}
                title="Agent Hub"
                config={config}
                customChannelId="sandbox-download-demo-narrow"
                locale={locale}
                onChannelReady={(): void => setNarrowChannel(narrowRef.current?.serviceContext?.channel ?? null)}
              />
            </div>
          </div>
        </div>
      </div>
    </DemoWrapper>
  );
}
