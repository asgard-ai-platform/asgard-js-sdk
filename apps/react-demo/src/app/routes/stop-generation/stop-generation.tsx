import { ReactNode, useState } from 'react';
import { Chatbot } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import styles from './stop-generation.module.scss';

// F-023 — stop generation must actually stop the background run.
//
// Runs execute on the server, so cutting the SSE connection only stops *watching*: the old behaviour
// left the agent running, burning tokens and writing the transcript, while the UI claimed it had
// stopped. Stop now calls `POST /message/suspend` and waits for the stream's terminal event — the same
// event a normal run ends with — before reopening the input.
//
// Each scenario below drives one branch of that lifecycle against a mock that keeps streaming until the
// suspend endpoint is called, so whatever ends the run is visibly the stop.
const config = {
  botProviderEndpoint: `${typeof window !== 'undefined' ? window.location.origin : ''}/mock-asgard`,
};

interface Scenario {
  key: string;
  label: string;
  customChannelId: string;
  autoResetChannel?: boolean;
  placeholder: string;
  steps: string[];
  note: string;
}

const SCENARIOS: Scenario[] = [
  {
    key: 'accepted',
    label: '① 正常停止 → 等終止事件才放行',
    customChannelId: 'stop-generation-demo',
    autoResetChannel: false,
    placeholder: '送一則訊息，回覆串流中再按停止…',
    steps: [
      '送出任意訊息，回覆會慢慢串流（約 60 秒才會自己結束）',
      '按下停止鈕 → 進入 stopping：鈕變灰不可再按，且「尚未」回到「等待輸入」',
      '約 1.2 秒後串流送出 run.done → 此時才切回等待輸入，已收到的內容保留',
    ],
    note: 'AC1／AC2／AC3。停止呼叫 POST /message/suspend?custom_channel_id=…&request_id=…；端點只回 204「已受理」，SSE 連線全程保持不斷。真正解除 stopping 的是串流上的終止事件，不是那個回應。',
  },
  {
    key: 'blocked-send',
    label: '② stopping 期間送出入口全部停用',
    customChannelId: 'stop-generation-demo',
    autoResetChannel: false,
    placeholder: '停止後試著立刻改口重打…',
    steps: [
      '送出訊息 → 串流中按停止',
      'stopping 期間在輸入框打字（可以打）、按 Enter 或點送出鈕（送不出去）',
      '草稿不會被清空；終止事件抵達後才恢復可送',
    ],
    note: 'AC5／AC6（UC-045）。舊 run 還沒真的停下前送新訊息，同一 channel 會有兩個 run 並行、對話紀錄錯亂。除了 UI 擋，core 的 sendMessage() 也會以 ChannelBusyError reject 作為防線，且在推出樂觀 user bubble 之前就拒絕 —— 被擋下的訊息不會在對話裡留下痕跡。',
  },
  {
    key: 'fail',
    label: '③ 停止端點失敗 → 不可卡在 stopping',
    customChannelId: 'stop-generation-fail-demo',
    autoResetChannel: false,
    placeholder: '這個頻道的 suspend 端點固定回 500…',
    steps: [
      '送出訊息 → 串流中按停止',
      'suspend 回 500 → UI「立刻離開 stopping」，停止鈕恢復可按',
      '可以再按一次重試（仍會失敗，但重點是沒卡死、也沒被迫接受）',
    ],
    note: 'AC4。端點失敗時 stopPhase 回滾成 idle 並把錯誤往外拋（stopGeneration() 會 reject）。內建 footer 的按鈕處理器吸收該 rejection —— 使用者看到的回復行為就是「鈕又能按了」；自行 await 的消費端則可自己呈現錯誤。',
  },
  {
    key: 'force',
    label: '④ 逾時 10 秒 → 轉為強制停止',
    customChannelId: 'stop-generation-timeout-demo',
    autoResetChannel: false,
    placeholder: '這個頻道的 agent 會無視第一次停止…',
    steps: [
      '送出訊息 → 串流中按停止（端點回 204 受理，但這個 agent 不理會）',
      '等約 10 秒 → 停止鈕「恢復可按」，aria-label 變成「強制停止」',
      '再按一次 → 以 force=true 重呼端點，這次 run 真的收尾',
    ],
    note: 'AC7（UC-044）。給沒有回應的 agent 的退路，正常情況不該走到。逾時期間仍維持 stopping（送出入口照樣停用），只是把控制權還給使用者。',
  },
  {
    key: 'welcome',
    label: '⑤ 歡迎訊息不可停（非使用者 run）',
    customChannelId: 'stop-generation-welcome-demo',
    placeholder: '開場串流中 —— 注意右下角沒有停止鈕…',
    steps: [
      '本情境 autoResetChannel 維持預設 true → mount 就以 action=NONE 開場',
      '開場回覆串流期間，右下角「只有停用的送出鈕，沒有停止鈕」',
      '開場結束後送自己的訊息 → 這時才會出現停止鈕',
    ],
    note: 'AC8。isConnecting 一詞四義（使用者 run／開場歡迎訊息／transcript 重播／隱形 nudge），只有第一種可停。core 用 RunStatus.kind 區分，對歡迎訊息呼叫停止是 no-op、也不會發出任何 suspend 請求。',
  },
];

export function StopGenerationRoute(): ReactNode {
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]);

  return (
    <DemoWrapper
      title="停止生成改為真正中止背景 run (F-023)"
      description="停止鈕過去只呼叫 AbortController.abort() 切斷本地連線，沒有任何請求送到後端 —— 但 run 是在伺服器端獨立執行的，前端斷線只代表「停止觀看」，agent 其實還在跑。現在停止改為呼叫後端 suspend 端點，並等既有 SSE 串流走到終止事件之後才切回「等待輸入」。切換情境會重掛 Chatbot。"
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

        <ol className={styles.steps}>
          {scenario.steps.map(step => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className={styles.note}>{scenario.note}</p>
      </div>

      <div className={styles.chatbotContainer}>
        <Chatbot
          key={scenario.key}
          title="Stop Generation Demo"
          config={config}
          customChannelId={scenario.customChannelId}
          autoResetChannel={scenario.autoResetChannel}
          inputPlaceholder={scenario.placeholder}
        />
      </div>
    </DemoWrapper>
  );
}
