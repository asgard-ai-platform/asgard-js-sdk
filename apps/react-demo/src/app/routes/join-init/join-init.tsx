import { ReactNode, StrictMode, useState } from 'react';
import { Chatbot } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import styles from './join-init.module.scss';

// F-015 — join-init orchestration. Every Chatbot mount now gates on `GET /channel/metadata` before doing
// anything: an EXISTING channel is always restored (title seed + history replay, never re-opened), a
// non-existent one follows `autoResetChannel`, and an indeterminate (non-404) metadata error falls back
// safely. The scoped mock ids below drive each branch; switching scenario remounts the Chatbot (via key)
// so its mount gate re-runs.
const config = {
  botProviderEndpoint: `${typeof window !== 'undefined' ? window.location.origin : ''}/mock-asgard`,
};

interface Scenario {
  key: string;
  label: string;
  customChannelId: string;
  autoResetChannel?: boolean;
  placeholder: string;
  note: string;
}

const SCENARIOS: Scenario[] = [
  {
    key: 'existing',
    label: '① 已存在頻道 → restore（不 reset）',
    customChannelId: 'join-existing-demo',
    placeholder: '還原完成後即可送新訊息…',
    note: 'metadata 回 200 → 一律 restore：標題由 metadata seed（頂端出現「庫存分析（已存在的頻道）」）、GET /message/sse 重播歷史對話、不刪不開場。重播期間輸入停用，收到 terminal 才放行。',
  },
  {
    key: 'new-autoreset',
    label: '② 不存在 + autoReset（預設）→ 開場',
    customChannelId: 'join-new-autoreset-demo',
    placeholder: '開場串流中…',
    note: 'metadata 回 404 + autoResetChannel 預設 true → 送 action=NONE 開場，串出一段歡迎回覆。房不存在就沒有東西要刪，所以這條路徑不會呼叫 deleteChannel（F-032）。',
  },
  {
    key: 'new-noreset',
    label: '③ 不存在 + 不 autoReset → 空狀態',
    customChannelId: 'join-new-noreset-demo',
    autoResetChannel: false,
    placeholder: '空狀態可輸入 → 送出後以 action=NONE 開始…',
    note: 'metadata 回 404 + autoResetChannel=false → 不發任何請求、停在空畫面、輸入可用；你送第一則訊息才以 action=NONE 正常開始。',
  },
  {
    key: 'error',
    label: '④ metadata 錯誤 → 安全 fallback',
    customChannelId: 'join-error-demo',
    placeholder: '錯誤後仍可輸入…',
    note: 'metadata 回 500（非 404）→ 不砍歷史、不卡死：停在可輸入的空狀態並上報錯誤（見 console），絕不在不確定時 auto-reset。',
  },
];

export function JoinInitRoute(): ReactNode {
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]);

  return (
    <DemoWrapper
      title="Join-Init Orchestration + metadata gate (F-015)"
      description="進房初始化改成 metadata-gated：mount 先打 GET /channel/metadata，存在→一律 restore（永不 reset、修掉「進已存在的房就砍歷史」的資料流失），不存在→依 autoResetChannel（預設以 action=NONE 開場 / 關閉則停空狀態），非 404 錯誤→安全 fallback。切換下方情境會重掛 Chatbot，重跑一次進房流程。"
    >
      <div className={styles.controls}>
        {SCENARIOS.map(s => (
          <button
            key={s.key}
            type="button"
            className={scenario.key === s.key ? styles.buttonActive : styles.button}
            onClick={() => setScenario(s)}
          >
            {s.label}
          </button>
        ))}
        <p className={styles.note}>{scenario.note}</p>
      </div>

      <div className={styles.chatbotContainer}>
        {/* Wrapped in StrictMode so this demo reproduces the mount-gate double-invoke that real consumers
            (e.g. Next.js dev, which enables StrictMode) hit — guarding F-015 join-init against it. */}
        <StrictMode>
          <Chatbot
            key={scenario.key}
            title="Join-Init Demo"
            config={config}
            customChannelId={scenario.customChannelId}
            autoResetChannel={scenario.autoResetChannel}
            inputPlaceholder={scenario.placeholder}
          />
        </StrictMode>
      </div>
    </DemoWrapper>
  );
}
