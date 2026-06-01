import { ReactNode, useState } from 'react';
import { Chatbot, ChatbotTheme } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import { createDataInsightTableExample, createDataInsightChartExample } from '../../mocks/data-insight-templates';
import styles from './data-insight-style.module.scss';

type ExampleType = 'table' | 'chart';

const exampleOptions: { value: ExampleType; label: string }[] = [
  { value: 'table', label: 'TABLE (Table / SQL)' },
  { value: 'chart', label: 'CHART (長條圖 / 折線圖)' },
];

const exampleCreators: Record<ExampleType, () => ReturnType<typeof createDataInsightTableExample>> = {
  table: createDataInsightTableExample,
  chart: createDataInsightChartExample,
};

// 近似 Data Insight（Mimir）的深色主題，用來目視比對樣式是否對齊。
const dataInsightTheme: ChatbotTheme = {
  chatbot: {
    // 讓 chatbot 填滿較寬的容器，模擬整合進 Data Insight（其聊天面板為 w-full）後的寬度。
    width: '100%',
    maxWidth: '100%',
    height: '100%',
    backgroundColor: '#141414',
    borderColor: '#434343',
    inactiveColor: '#8c8c8c',
    primaryComponent: {
      mainColor: '#ef4444',
      secondaryColor: '#ffffff',
    },
  },
  botMessage: {
    color: '#ffffff',
    backgroundColor: '#1f1f1f',
  },
  userMessage: {
    color: '#ffffff',
    backgroundColor: '#ef4444',
  },
};

export function DataInsightStyle(): ReactNode {
  const [selected, setSelected] = useState<ExampleType>('table');
  const [showCreateView, setShowCreateView] = useState(true);
  const initMessages = [exampleCreators[selected]()];

  // 模擬 Data Insight 透過 renderTemplateHeaderActions 注入自己的「Create View」按鈕。
  // 按鈕的樣式與邏輯都留在嵌入端（這裡的 demo），SDK 只負責在 header 留位子。
  const renderTemplateHeaderActions = showCreateView
    ? (): ReactNode => (
        <button
          type="button"
          className={styles.createViewBtn}
          onClick={() => console.log('[demo] Create View clicked')}
        >
          Create View
        </button>
      )
    : undefined;

  return (
    <DemoWrapper
      title="Data Insight Style"
      description="驗證 TABLE / CHART 模板對齊 Data Insight 風格（ClickUp 86exrpun9）。使用 Data Insight 測試 response 的資料。"
    >
      <div className={styles.controls}>
        <h3>Select Example</h3>
        <div className={styles.buttons}>
          {exampleOptions.map(option => (
            <button
              key={option.value}
              className={`${styles.button} ${selected === option.value ? styles.active : ''}`}
              onClick={() => setSelected(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className={styles.toggle}>
          <input type="checkbox" checked={showCreateView} onChange={e => setShowCreateView(e.target.checked)} />
          注入 Create View 按鈕（header slot）
        </label>
      </div>

      <div className={styles.chatbotContainer}>
        <Chatbot
          title="業務員業績排名"
          config={{ botProviderEndpoint: 'skip' }}
          customChannelId="data-insight-style-demo"
          theme={dataInsightTheme}
          initMessages={initMessages}
          renderTemplateHeaderActions={renderTemplateHeaderActions}
        />
      </div>
    </DemoWrapper>
  );
}
