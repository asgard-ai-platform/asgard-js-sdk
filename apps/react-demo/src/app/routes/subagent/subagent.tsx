import { ReactNode } from 'react';
import { Chatbot, useSubagents, useTaskList } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import styles from './subagent.module.scss';

// F-012 smoke demo: a live connection to the dev mock SSE stream. Sending any message replays the
// full pipeline (thinking → tool calls → tasks → subagent → answer). Watch the Subagent panel stack
// above the Task list — it runs while the subagent works (showing its current child tool), then
// settles once `subagent.complete` lands; the spawning `Agent` call and its child tool calls are
// kept OUT of the main tool-call group.
//
// F-013: `<DerivedStateMirror>` reads the same derived slices through the framework-agnostic store
// via `useTaskList()` / `useSubagents()` — proving the lists are consumable outside the built-in
// panels (and re-render only when their slice changes, not on every message delta).
function DerivedStateMirror(): ReactNode {
  const tasks = useTaskList();
  const subagents = useSubagents();

  return (
    <div className={styles.mirror} data-testid="derived-mirror">
      useTaskList() → {tasks.filter(t => t.status === 'completed').length}/{tasks.length} tasks · useSubagents() →{' '}
      {subagents.filter(s => s.status !== 'running').length}/{subagents.length} subagents
    </div>
  );
}

export function SubagentDemo(): ReactNode {
  return (
    <DemoWrapper
      title="Subagent List (F-012) + derived-state store (F-013)"
      description="送出任意訊息即可觸發 mock 串流：Subagent 面板會疊在 Task 清單之上，執行中顯示當前工具、完成後自動收合。上方灰列由 useTaskList()／useSubagents() 讀取同一份 store。"
    >
      <div className={styles.chatbotContainer}>
        <Chatbot
          title="Subagent Demo"
          config={{ botProviderEndpoint: `${window.location.origin}/mock-asgard` }}
          customChannelId="subagent-demo"
          locale="zh-TW"
          renderMenu={(): ReactNode => <DerivedStateMirror />}
        />
      </div>
    </DemoWrapper>
  );
}
