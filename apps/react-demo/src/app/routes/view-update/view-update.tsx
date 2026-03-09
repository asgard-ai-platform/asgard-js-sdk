import { ReactNode, useCallback, useState } from 'react';
import { Chatbot, MessageContentRendererProps } from '@asgard-js/react';
import '@asgard-js/react/style';
import { ConversationMessage, ConversationViewMessage, EventType, VisualSchemaChoice } from '@asgard-js/core';
import { nanoid } from 'nanoid';
import { DemoWrapper } from '../../components/demo-wrapper';
import styles from './view-update.module.scss';

function createViewUpdateMessages(): ConversationMessage[] {
  return [
    {
      type: 'user',
      messageId: nanoid(),
      text: '請幫我分析各產品線的月營收趨勢',
      time: new Date(),
    },
    {
      type: 'view',
      messageId: nanoid(),
      eventType: EventType.VIEW_UPDATE,
      requestId: nanoid(),
      viewData: {
        channelViewId: nanoid(),
        sqlStatement:
          'SELECT product_line, month, SUM(revenue) as total_revenue\nFROM sales\nGROUP BY product_line, month\nORDER BY month',
        sqlExplanation: '此查詢從 sales 資料表中，依照產品線和月份分組，計算各組的總營收，並按月份排序。',
        previewData: [
          { product_line: 'Enterprise', month: '2024-01', total_revenue: 1250000 },
          { product_line: 'Enterprise', month: '2024-02', total_revenue: 1380000 },
          { product_line: 'Enterprise', month: '2024-03', total_revenue: 1520000 },
          { product_line: 'SMB', month: '2024-01', total_revenue: 680000 },
          { product_line: 'SMB', month: '2024-02', total_revenue: 720000 },
          { product_line: 'SMB', month: '2024-03', total_revenue: 890000 },
          { product_line: 'Starter', month: '2024-01', total_revenue: 320000 },
          { product_line: 'Starter', month: '2024-02', total_revenue: 350000 },
          { product_line: 'Starter', month: '2024-03', total_revenue: 410000 },
        ],
        visualSchemaChoices: [
          {
            title: 'Table',
            type: 'DOM_TABLE',
            dom_table_schema: {
              columns: [
                { name: 'product_line', display_name: 'Product Line' },
                { name: 'month', display_name: 'Month' },
                { name: 'total_revenue', display_name: 'Total Revenue' },
              ],
            },
          },
          {
            title: 'Bar Chart',
            type: 'VEGA',
            vega_schema: {
              spec: {
                $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
                mark: 'bar',
                encoding: {
                  x: { field: 'month', type: 'ordinal' },
                  y: { field: 'total_revenue', type: 'quantitative' },
                  color: { field: 'product_line', type: 'nominal' },
                },
              },
            },
          },
        ],
        viewTitle: '各產品線月營收趨勢',
      },
      sqlStatement:
        'SELECT product_line, month, SUM(revenue) as total_revenue\nFROM sales\nGROUP BY product_line, month\nORDER BY month',
      sqlExplanation: '此查詢從 sales 資料表中，依照產品線和月份分組，計算各組的總營收，並按月份排序。',
      previewData: [
        { product_line: 'Enterprise', month: '2024-01', total_revenue: 1250000 },
        { product_line: 'Enterprise', month: '2024-02', total_revenue: 1380000 },
        { product_line: 'Enterprise', month: '2024-03', total_revenue: 1520000 },
        { product_line: 'SMB', month: '2024-01', total_revenue: 680000 },
        { product_line: 'SMB', month: '2024-02', total_revenue: 720000 },
        { product_line: 'SMB', month: '2024-03', total_revenue: 890000 },
        { product_line: 'Starter', month: '2024-01', total_revenue: 320000 },
        { product_line: 'Starter', month: '2024-02', total_revenue: 350000 },
        { product_line: 'Starter', month: '2024-03', total_revenue: 410000 },
      ],
      visualSchemaChoices: [
        {
          title: 'Table',
          type: 'DOM_TABLE',
          dom_table_schema: {
            columns: [
              { name: 'product_line', display_name: 'Product Line' },
              { name: 'month', display_name: 'Month' },
              { name: 'total_revenue', display_name: 'Total Revenue' },
            ],
          },
        },
        {
          title: 'Bar Chart',
          type: 'VEGA',
          vega_schema: {
            spec: {
              $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
              mark: 'bar',
              encoding: {
                x: { field: 'month', type: 'ordinal' },
                y: { field: 'total_revenue', type: 'quantitative' },
                color: { field: 'product_line', type: 'nominal' },
              },
            },
          },
        },
      ],
      viewTitle: '各產品線月營收趨勢',
      time: new Date(),
    },
  ];
}

// Demo view component simulating what data-insight-web would render
function InsightResultsDemo({ message }: { message: ConversationViewMessage }): ReactNode {
  const [activeTab, setActiveTab] = useState<'table' | 'sql'>('table');
  const tableSchema = message.visualSchemaChoices.find((c: VisualSchemaChoice) => c.type === 'DOM_TABLE');
  const columns = tableSchema?.dom_table_schema?.columns ?? [];

  return (
    <div className={styles.viewCard}>
      <div className={styles.viewHeader}>
        <span className={styles.viewTitle}>{message.viewTitle}</span>
        <span className={styles.viewBadge}>VIEW_UPDATE</span>
      </div>
      <div className={styles.viewTabs}>
        <button
          className={`${styles.viewTab} ${activeTab === 'table' ? styles.active : ''}`}
          onClick={() => setActiveTab('table')}
        >
          Table
        </button>
        <button
          className={`${styles.viewTab} ${activeTab === 'sql' ? styles.active : ''}`}
          onClick={() => setActiveTab('sql')}
        >
          SQL
        </button>
      </div>
      {activeTab === 'table' && (
        <table className={styles.viewTable}>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.name}>{col.display_name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {message.previewData.map((row, i) => (
              <tr key={i}>
                {columns.map(col => (
                  <td key={col.name}>
                    {typeof row[col.name] === 'number'
                      ? (row[col.name] as number).toLocaleString()
                      : String(row[col.name])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {activeTab === 'sql' && (
        <>
          <div className={styles.viewSql}>
            <pre>{message.sqlStatement}</pre>
          </div>
          {message.sqlExplanation && <div className={styles.viewExplanation}>{message.sqlExplanation}</div>}
        </>
      )}
    </div>
  );
}

export function ViewUpdate(): ReactNode {
  const initMessages = createViewUpdateMessages();

  const viewRenderer = useCallback((props: MessageContentRendererProps): ReactNode => {
    const { message, renderDefaultContent, MessageContainer } = props;

    if (message.type === 'view') {
      return (
        <MessageContainer>
          <InsightResultsDemo message={message} />
        </MessageContainer>
      );
    }

    return renderDefaultContent();
  }, []);

  return (
    <DemoWrapper
      title="View Update (Data Insight)"
      description="Render custom view components for VIEW_UPDATE events using renderMessageContent."
    >
      <div className={styles.controls}>
        <h3>How It Works</h3>
        <p style={{ fontSize: '13px', color: '#666', lineHeight: 1.6, margin: '0 0 16px 0' }}>
          The SDK emits <code>EventType.VIEW_UPDATE</code> events for data insight queries. Use{' '}
          <code>renderMessageContent</code> to handle <code>message.type === 'view'</code> and render your custom
          visualization components.
        </p>

        <div className={styles.codePreview}>
          <h4>Code Example</h4>
          <pre className={styles.code}>
            {`<Chatbot
  renderMessageContent={(props) => {
    const { message, renderDefaultContent,
            MessageContainer } = props;

    if (message.type === 'view') {
      return (
        <MessageContainer>
          <InsightResults
            viewData={message.viewData}
            previewData={message.previewData}
            visualSchemaChoices={
              message.visualSchemaChoices
            }
          />
        </MessageContainer>
      );
    }

    return renderDefaultContent();
  }}
/>`}
          </pre>
        </div>
      </div>

      <div className={styles.chatbotContainer}>
        <Chatbot
          title="Data Insight Demo"
          config={{ botProviderEndpoint: 'skip' }}
          customChannelId="view-update-demo"
          initMessages={initMessages}
          renderMessageContent={viewRenderer}
        />
      </div>
    </DemoWrapper>
  );
}
