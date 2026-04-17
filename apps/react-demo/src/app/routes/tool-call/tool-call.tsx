import { ReactNode, useState } from 'react';
import { Chatbot, ToolCallItemData, ToolCallStatus } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import {
  createToolCallMessages,
  createPendingToolCallMessages,
  createErrorToolCallMessages,
} from '../../mocks/messages';
import styles from './tool-call.module.scss';

type Scenario = 'completed' | 'pending' | 'error';

const scenarioOptions: { value: Scenario; label: string; description: string }[] = [
  { value: 'completed', label: 'Completed', description: 'All tool calls finished successfully' },
  { value: 'pending', label: 'Pending', description: 'One tool call still in progress' },
  { value: 'error', label: 'Error', description: 'A tool call failed with an error' },
];

const scenarioMessages: Record<Scenario, () => ReturnType<typeof createToolCallMessages>> = {
  completed: createToolCallMessages,
  pending: createPendingToolCallMessages,
  error: createErrorToolCallMessages,
};

type RenderMode = 'default' | 'hidden' | 'custom-title' | 'summary' | 'steps';

const modeOptions: { value: RenderMode; label: string; description: string }[] = [
  {
    value: 'default',
    label: 'Default',
    description: 'Built-in "Answer preparation steps" UI with expandable tool details',
  },
  {
    value: 'hidden',
    label: 'Hidden',
    description: 'Completely hide the tool call group from end users',
  },
  {
    value: 'custom-title',
    label: 'Custom Title',
    description: 'Keep the default UI but change the title text',
  },
  {
    value: 'summary',
    label: 'Summary',
    description: 'Replace with a one-line status summary',
  },
  {
    value: 'steps',
    label: 'Step Card',
    description: 'Custom expandable card showing each tool name and status badge',
  },
];

const codeExamples: Record<RenderMode, string> = {
  default: `// No prop needed — uses built-in UI
<Chatbot
  config={{ botProviderEndpoint: '...' }}
  customChannelId="my-channel"
/>`,
  hidden: `// Return null to hide completely
<Chatbot
  renderToolCallGroup={() => null}
  ...
/>`,
  'custom-title': `// Override title only, keep default UI
<Chatbot
  renderToolCallGroup={({ renderDefaultContent }) =>
    renderDefaultContent({ title: 'AI is thinking...' })
  }
  ...
/>`,
  summary: `// Custom one-line summary
<Chatbot
  renderToolCallGroup={({ items }) => {
    const done = items.filter(i => i.status === 'completed').length;
    return (
      <div>
        {done === items.length
          ? \`✅ \${done} step(s) completed\`
          : \`⏳ Processing...\`}
      </div>
    );
  }}
  ...
/>`,
  steps: `// Custom expandable step card
<Chatbot
  renderToolCallGroup={({ items }) => {
    return (
      <StepCard items={items} />
      // Each item has: id, label, status,
      // initial (parameters), result
    );
  }}
  ...
/>`,
};

const statusConfig: Record<ToolCallStatus, { icon: string; color: string; label: string }> = {
  completed: { icon: '✓', color: '#52c41a', label: 'Done' },
  pending: { icon: '⟳', color: '#1890ff', label: 'Running' },
  error: { icon: '✗', color: '#ff4d4f', label: 'Failed' },
};

function SummaryRenderer({ items }: { items: ToolCallItemData[] }): ReactNode {
  const completed = items.filter(i => i.status === 'completed').length;
  const pending = items.filter(i => i.status === 'pending').length;
  const error = items.filter(i => i.status === 'error').length;

  return (
    <div className={styles.summaryBox}>
      {pending > 0 ? `⏳ ${pending} step(s) in progress...` : `✅ ${completed} step(s) completed`}
      {error > 0 && ` · ❌ ${error} failed`}
    </div>
  );
}

function StepCardRenderer({ items }: { items: ToolCallItemData[] }): ReactNode {
  const [expanded, setExpanded] = useState(false);
  const completed = items.filter(i => i.status === 'completed').length;
  const pending = items.filter(i => i.status === 'pending').length;
  const error = items.filter(i => i.status === 'error').length;

  const getLabel = (): string => {
    if (pending > 0) {
      return `Running... (${completed}/${items.length})`;
    }

    if (error > 0) {
      return `${completed} completed · ${error} failed`;
    }

    return `Completed ${items.length} steps`;
  };

  const getIndicatorClass = (): string => {
    if (pending > 0) {
      return styles.running;
    }

    if (error > 0) {
      return styles.error;
    }

    return styles.done;
  };

  return (
    <div className={styles.customCard}>
      <button className={styles.customCardHeader} onClick={() => setExpanded(prev => !prev)}>
        <span className={styles.customCardTitle}>
          <span className={`${styles.customCardIndicator} ${getIndicatorClass()}`} />
          {getLabel()}
        </span>
        <span className={`${styles.customCardChevron} ${expanded ? styles.expanded : ''}`}>▾</span>
      </button>
      {expanded && (
        <div className={styles.customCardBody}>
          {items.map(item => {
            const cfg = statusConfig[item.status];

            return (
              <div key={item.id} className={styles.customCardStep}>
                <span className={styles.customCardStepIcon} style={{ color: cfg.color }}>
                  {cfg.icon}
                </span>
                <span className={styles.customCardStepName}>{item.label}</span>
                <span
                  className={styles.customCardStepBadge}
                  style={{ backgroundColor: `${cfg.color}18`, color: cfg.color }}
                >
                  {cfg.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getRenderToolCallGroup(
  mode: RenderMode,
):
  | ((props: {
      items: ToolCallItemData[];
      time?: Date;
      renderDefaultContent: (overrides?: { title?: string }) => ReactNode;
    }) => ReactNode)
  | undefined {
  if (mode === 'hidden') return () => null;

  if (mode === 'custom-title')
    return ({ renderDefaultContent }) => renderDefaultContent({ title: 'AI is thinking...' });

  if (mode === 'summary') return ({ items }) => <SummaryRenderer items={items} />;

  if (mode === 'steps') return ({ items }) => <StepCardRenderer items={items} />;

  return undefined;
}

export function ToolCallDemo(): ReactNode {
  const [scenario, setScenario] = useState<Scenario>('completed');
  const [selectedMode, setSelectedMode] = useState<RenderMode>('default');

  return (
    <DemoWrapper
      title="Tool Call Renderer"
      description='Customize or hide the "Answer preparation steps" UI using renderToolCallGroup.'
    >
      <div className={styles.controls}>
        <h3>Tool Call Status</h3>
        <div className={styles.scenarioList}>
          {scenarioOptions.map(option => (
            <button
              key={option.value}
              className={`${styles.scenarioButton} ${scenario === option.value ? styles.active : ''}`}
              onClick={() => setScenario(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <h3>Usage Examples</h3>
        <div className={styles.modeList}>
          {modeOptions.map(option => (
            <button
              key={option.value}
              className={`${styles.modeButton} ${selectedMode === option.value ? styles.active : ''}`}
              onClick={() => setSelectedMode(option.value)}
            >
              <span className={styles.modeLabel}>{option.label}</span>
              <span className={styles.modeDescription}>{option.description}</span>
            </button>
          ))}
        </div>

        <div className={styles.codePreview}>
          <pre className={styles.code}>{codeExamples[selectedMode]}</pre>
        </div>
      </div>

      <div className={styles.chatbotContainer}>
        <Chatbot
          key={`${scenario}-${selectedMode}`}
          title="Tool Call Demo"
          config={{ botProviderEndpoint: 'skip' }}
          customChannelId={`tool-call-demo-${scenario}-${selectedMode}`}
          initMessages={scenarioMessages[scenario]()}
          autoResetChannel={false}
          renderToolCallGroup={getRenderToolCallGroup(selectedMode)}
        />
      </div>
    </DemoWrapper>
  );
}
