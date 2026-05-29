import { ChartMessageTemplate, ConversationMessage, MessageTemplateType, TableMessageTemplate } from '@asgard-js/core';
import { nanoid } from 'nanoid';
import { createBaseTemplateExample } from './messages';

/**
 * 以 ClickUp ticket 86exrpun9 提供的 Data Insight 測試 response 為基礎，
 * 建立 SDK TABLE / CHART 模板的範例，用來目視驗證樣式是否對齊 Data Insight。
 *
 * 注意：Data Insight 的 VEGA spec 其 `table` data source 不含 values，
 * 實際是由後端把資料 inline 進 spec。此處在 mock 端注入資料，模擬後端行為，
 * SDK 本身不做資料注入。
 */

const rows: Record<string, unknown>[] = [
  {
    salesperson_id: 'X0002',
    salesperson_name: '鄭X松',
    total_gross_profit: '3459545246',
    total_sales_ntd: '8935639123',
    transaction_count: 14476,
  },
  {
    salesperson_id: 'X0074',
    salesperson_name: '林X君',
    total_gross_profit: '116194304',
    total_sales_ntd: '489002583',
    transaction_count: 1281,
  },
  {
    salesperson_id: 'Y0117',
    salesperson_name: '李X迪',
    total_gross_profit: '28717234',
    total_sales_ntd: '81134973',
    transaction_count: 184,
  },
  {
    salesperson_id: 'X0102',
    salesperson_name: '徐X風',
    total_gross_profit: '-1628219',
    total_sales_ntd: '39932043',
    transaction_count: 658,
  },
  {
    salesperson_id: 'X0041',
    salesperson_name: '石X良',
    total_gross_profit: '8212831',
    total_sales_ntd: '37841292',
    transaction_count: 1114,
  },
  {
    salesperson_id: 'X0018',
    salesperson_name: '游X湧',
    total_gross_profit: '351059',
    total_sales_ntd: '373467',
    transaction_count: 1,
  },
  {
    salesperson_id: 'X0097',
    salesperson_name: '李X輝',
    total_gross_profit: '818',
    total_sales_ntd: '1105',
    transaction_count: 1,
  },
];

const sqlStatement = `SELECT
  sp.salesperson_id AS salesperson_id,
  sp.salesperson_name AS salesperson_name,
  SUM(s.ntd_amount) AS total_sales_ntd,
  SUM(s.gross_profit) AS total_gross_profit,
  COUNT(*) AS transaction_count
FROM public.sales s
LEFT JOIN public.salespersons sp ON s.salesperson_id = sp.salesperson_id
GROUP BY sp.salesperson_id, sp.salesperson_name
ORDER BY total_sales_ntd DESC`;

const sqlExplanation =
  '這個查詢從銷售記錄表中統計每位業務人員的業績表現。透過 LEFT JOIN 連結業務人員資料表，取得業務員編號與姓名，並計算三個關鍵指標：新台幣銷售總額、總毛利以及交易筆數。使用 GROUP BY 按業務員分組統計，最後依照銷售總額由高到低排序，呈現出業務員的業績排名結果。';

/** 模擬後端：把資料 inline 進 vega spec 的 `table` data source（數字字串轉成數字）。 */
function injectVegaData(spec: Record<string, unknown>, data: Record<string, unknown>[]): Record<string, unknown> {
  const cloned = JSON.parse(JSON.stringify(spec)) as Record<string, unknown>;

  const formatted = data.map(row => {
    const out: Record<string, unknown> = {};

    Object.entries(row).forEach(([key, value]) => {
      out[key] = typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value) ? parseFloat(value) : value;
    });

    return out;
  });

  if (Array.isArray(cloned.data)) {
    cloned.data = (cloned.data as Record<string, unknown>[]).map(source =>
      source.name === 'table' && !source.source ? { ...source, values: formatted } : source,
    );
  }

  return cloned;
}

const barSpec: Record<string, unknown> = {
  $schema: 'https://vega.github.io/schema/vega/v5.json',
  axes: [
    { labelAngle: -30, labelFontSize: 12, orient: 'bottom', scale: 'xscale', title: '業務人員姓名', titleFontSize: 14 },
    {
      format: ',~s',
      labelFontSize: 12,
      orient: 'left',
      scale: 'yscale',
      title: '銷售總額（新台幣）',
      titleFontSize: 14,
    },
  ],
  data: [
    {
      name: 'table',
      transform: [{ as: 'total_sales_ntd_num', expr: 'toNumber(datum.total_sales_ntd)', type: 'formula' }],
    },
  ],
  description: '各業務員銷售總額（新台幣）長條圖',
  height: 400,
  marks: [
    {
      encode: {
        enter: {
          width: { band: 1, scale: 'xscale' },
          x: { field: 'salesperson_name', scale: 'xscale' },
          y: { field: 'total_sales_ntd_num', scale: 'yscale' },
          y2: { scale: 'yscale', value: 0 },
        },
        hover: { fill: { value: '#F58518' } },
        update: {
          fill: { value: '#4C78A8' },
          tooltip: {
            signal:
              "{'業務員': datum.salesperson_name, '銷售總額': format(datum.total_sales_ntd_num, ',.0f') + ' 元', '毛利總額': format(toNumber(datum.total_gross_profit), ',.0f') + ' 元', '交易筆數': format(datum.transaction_count, ',')}",
          },
        },
      },
      from: { data: 'table' },
      type: 'rect',
    },
  ],
  padding: 5,
  scales: [
    {
      domain: { data: 'table', field: 'salesperson_name' },
      name: 'xscale',
      padding: 0.1,
      range: 'width',
      type: 'band',
    },
    {
      domain: { data: 'table', field: 'total_sales_ntd_num' },
      name: 'yscale',
      nice: true,
      range: 'height',
      type: 'linear',
      zero: true,
    },
  ],
  signals: [
    {
      name: 'tooltip',
      on: [
        { events: 'rect:mouseover', update: 'datum' },
        { events: 'rect:mouseout', update: '{}' },
      ],
      value: {},
    },
  ],
  title: { anchor: 'start', fontSize: 18, offset: 10, text: '業務員銷售總額排名' },
  width: 600,
};

const lineSpec: Record<string, unknown> = {
  $schema: 'https://vega.github.io/schema/vega/v5.json',
  axes: [
    { labelAngle: -30, labelFontSize: 12, orient: 'bottom', scale: 'x', title: '業務人員姓名', titleFontSize: 14 },
    { format: ',~s', labelFontSize: 12, orient: 'left', scale: 'y', title: '銷售總額（新台幣）', titleFontSize: 14 },
  ],
  data: [
    {
      name: 'table',
      transform: [{ as: 'total_sales_ntd_num', expr: 'toNumber(datum.total_sales_ntd)', type: 'formula' }],
    },
  ],
  description: '各業務員銷售總額（新台幣）折線圖',
  height: 400,
  marks: [
    {
      encode: {
        enter: { stroke: { value: '#4C78A8' }, strokeWidth: { value: 3 } },
        update: {
          x: { field: 'salesperson_name', scale: 'x' },
          y: { field: 'total_sales_ntd_num', scale: 'y' },
        },
      },
      from: { data: 'table' },
      type: 'line',
    },
    {
      encode: {
        enter: {
          fill: { field: 'salesperson_name', scale: 'color' },
          shape: { value: 'circle' },
          size: { value: 150 },
          stroke: { value: '#fff' },
          strokeWidth: { value: 2 },
        },
        update: {
          fillOpacity: { value: 1 },
          tooltip: {
            signal:
              "{'業務員': datum.salesperson_name, '銷售總額': format(datum.total_sales_ntd_num, ',.0f') + ' 元', '毛利總額': format(toNumber(datum.total_gross_profit), ',.0f') + ' 元', '交易筆數': format(datum.transaction_count, ',')}",
          },
          x: { field: 'salesperson_name', scale: 'x' },
          y: { field: 'total_sales_ntd_num', scale: 'y' },
        },
      },
      from: { data: 'table' },
      type: 'symbol',
    },
  ],
  padding: 5,
  scales: [
    { domain: { data: 'table', field: 'salesperson_name' }, name: 'x', padding: 0.5, range: 'width', type: 'point' },
    {
      domain: { data: 'table', field: 'total_sales_ntd_num' },
      name: 'y',
      nice: true,
      range: 'height',
      type: 'linear',
      zero: true,
    },
    { name: 'color', range: { scheme: 'category10' }, type: 'ordinal' },
  ],
  title: { anchor: 'start', fontSize: 18, offset: 10, text: '業務員銷售總額趨勢' },
  width: 600,
};

export function createDataInsightTableExample(): ConversationMessage {
  const messageId = nanoid();

  const template: TableMessageTemplate = {
    type: MessageTemplateType.TABLE,
    title: '業務員業績排名',
    quickReplies: [],
    table: {
      rowType: 'OBJECT',
      columns: [
        { header: '業務人員編號', key: 'salesperson_id' },
        { header: '業務人員姓名', key: 'salesperson_name' },
        { header: '銷售總額（新台幣）', key: 'total_sales_ntd' },
        { header: '毛利總額', key: 'total_gross_profit' },
        { header: '交易筆數', key: 'transaction_count' },
      ],
      pagination: { size: 5 },
      data: rows,
      sql: sqlStatement,
      sqlExplanation,
    },
  };

  return createBaseTemplateExample({
    messageId,
    replyToCustomMessageId: '',
    text: '業務員業績排名',
    payload: null,
    isDebug: false,
    idx: 0,
    template,
  });
}

export function createDataInsightChartExample(): ConversationMessage {
  const messageId = nanoid();

  const template: ChartMessageTemplate = {
    type: MessageTemplateType.CHART,
    title: '業務員業績排名',
    text: '以下是各業務員銷售總額的視覺化呈現。',
    chartOptions: [
      { type: 'bar', title: '長條圖', spec: injectVegaData(barSpec, rows) },
      { type: 'line', title: '折線圖', spec: injectVegaData(lineSpec, rows) },
    ],
    defaultChart: 'bar',
    quickReplies: [],
  };

  return createBaseTemplateExample({
    messageId,
    replyToCustomMessageId: '',
    text: '業務員業績排名',
    payload: null,
    isDebug: false,
    idx: 0,
    template,
  });
}
