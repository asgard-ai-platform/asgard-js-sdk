import {
  ConversationMessage,
  ConversationToolCallMessage,
  EventType,
  Message,
  MessageTemplateType,
  TableMessageTemplate,
} from '@asgard-js/core';
import { nanoid } from 'nanoid';

const quickReplies = [
  { text: '死侍有上映嗎?' },
  { text: '哪邊可以找得到哺乳室' },
  { text: '請問停車場入場幾分鐘內免費' },
  { text: '可以跨影城進行網路訂票的現場取票嗎' },
  { text: '台中文心秀泰充電樁是新款還是舊款?' },
];

export function createBaseTemplateExample(message: Message): ConversationMessage {
  const mockSseResponse = {
    eventType: EventType.MESSAGE_COMPLETE,
    fact: {
      messageComplete: {
        message,
      },
    },
  };

  return {
    type: 'bot',
    messageId: message.messageId,
    isTyping: false,
    typingText: '',
    eventType: EventType.MESSAGE_COMPLETE,
    time: new Date(),
    message,
    raw: JSON.stringify(mockSseResponse),
  };
}

export function createTextTemplateExample(): ConversationMessage {
  const messageId = nanoid();

  return createBaseTemplateExample({
    text: '我是秀泰影城 / 生活常見問答 AI，我可以回答你各項關於秀泰商場 / 影城相關的問題，你可以問我任何問題，我會盡力回答你。(目前資料更新至 2024/08)',
    template: {
      type: MessageTemplateType.TEXT,
      text: '',
      quickReplies: [
        { text: '死侍有上映嗎?' },
        { text: '哪邊可以找得到哺乳室' },
        { text: '請問停車場入場幾分鐘內免費' },
        { text: '可以跨影城進行網路訂票的現場取票嗎' },
        { text: '台中文心秀泰充電樁是新款還是舊款?' },
      ],
    },
    messageId,
    replyToCustomMessageId: '',
    payload: undefined,
    isDebug: false,
    idx: 0,
  });
}

export function createHintTemplateExample(): ConversationMessage {
  const messageId = nanoid();

  return createBaseTemplateExample({
    messageId,
    replyToCustomMessageId: '',
    text: '目前位於: 板橋秀泰',
    payload: null,
    isDebug: false,
    idx: 0,
    template: {
      type: MessageTemplateType.HINT,
      text: '目前位於: 板橋秀泰',
      quickReplies,
    },
  });
}

export function createButtonTemplateExample(): ConversationMessage {
  const messageId = nanoid();

  return createBaseTemplateExample({
    messageId,
    replyToCustomMessageId: '',
    text: '目前位於: 板橋秀泰',
    payload: null,
    isDebug: false,
    idx: 0,
    template: {
      type: MessageTemplateType.BUTTON,
      title: '死侍與金鋼狼',
      text: '演員: 萊恩·雷諾斯;休·傑克曼;艾瑪·可林;莫蓮娜·芭卡琳\n導演: 薛恩·李維\n簡介: 本片是《死侍》系列加入漫威電影宇宙的第一炮...',
      thumbnailImageUrl: 'https://capi.showtimes.com.tw/assets/57/576ed12bedb3ae6e548c6bfa50e9cbb5.jpg',
      imageAspectRatio: 'rectangle',
      imageSize: 'cover',
      imageBackgroundColor: '#FFFFFF',
      buttons: [
        {
          label: '訂票去',
          action: {
            type: 'uri',
            uri: 'https://www.showtimes.com.tw/programs/11502',
          },
        },
        {
          label: '觀看預告片',
          action: {
            type: 'uri',
            uri: 'https://youtu.be/O4PlaF13SH4?si=8DQ-3fZp007s2oJA',
          },
        },
      ],
      defaultAction: {
        type: 'uri',
        uri: 'https://www.showtimes.com.tw/programs/11502',
      },
      quickReplies,
    },
  });
}

export function createEmitButtonTemplateExample(): ConversationMessage {
  const messageId = nanoid();

  return createBaseTemplateExample({
    messageId,
    replyToCustomMessageId: '',
    text: '這是一個 EMIT 事件示範範例。點擊下方「立刻訂票」按鈕，系統會觸發 EMIT 事件並顯示訂票資訊。',
    payload: null,
    isDebug: false,
    idx: 0,
    template: {
      type: MessageTemplateType.BUTTON,
      title: '電影：死侍與金鋼狼',
      text: '這是 EMIT 事件示範：點擊「立刻訂票」按鈕會觸發自訂事件，並在彈窗中顯示訂票資訊。',
      thumbnailImageUrl: 'https://capi.showtimes.com.tw/assets/57/576ed12bedb3ae6e548c6bfa50e9cbb5.jpg',
      imageAspectRatio: 'rectangle',
      imageSize: 'cover',
      imageBackgroundColor: '#FFFFFF',
      buttons: [
        {
          label: '立刻訂票',
          action: {
            type: 'emit' as const,
            eventName: 'book_ticket',
            payload: {
              movieId: '11502',
              movieTitle: '死侍與金鋼狼',
              moviePoster: 'https://capi.showtimes.com.tw/assets/57/576ed12bedb3ae6e548c6bfa50e9cbb5.jpg',
              showtime: '2024-08-15 19:30',
              theater: '板橋秀泰影城',
              seatCount: 2,
              totalPrice: 600,
              currency: 'TWD',
              timestamp: Math.floor(Date.now() / 1000),
            },
          } as {
            type: 'emit';
            eventName: string;
            payload: Record<string, unknown>;
          },
        },
      ],
      defaultAction: {
        type: 'uri',
        uri: 'https://www.showtimes.com.tw/programs/11502',
      },
      quickReplies: [],
    },
  });
}

export function createCarouselTemplateExample(): ConversationMessage {
  const messageId = nanoid();

  return createBaseTemplateExample({
    messageId,
    replyToCustomMessageId: '',
    text: '',
    payload: null,
    isDebug: false,
    idx: 0,
    template: {
      type: MessageTemplateType.CAROUSEL,
      quickReplies,
      columns: [
        {
          title: '死侍與金鋼狼',
          text: '演員: 萊恩·雷諾斯;休·傑克曼\n導演: 薛恩·李維',
          thumbnailImageUrl: 'https://capi.showtimes.com.tw/assets/57/576ed12bedb3ae6e548c6bfa50e9cbb5.jpg',
          imageAspectRatio: 'rectangle',
          imageSize: 'cover',
          imageBackgroundColor: '#FFFFFF',
          buttons: [
            {
              label: '訂票去',
              action: {
                type: 'uri',
                uri: 'https://www.showtimes.com.tw/programs/11502',
              },
            },
            {
              label: '觀看預告片',
              action: {
                type: 'uri',
                uri: 'https://youtu.be/O4PlaF13SH4?si=8DQ-3fZp007s2oJA',
              },
            },
          ],
          defaultAction: {
            type: 'uri',
            uri: 'https://www.showtimes.com.tw/programs/11502',
          },
        },
        {
          title: '找死兇宅',
          text: '演員: 李星民;李熙峻;孔升妍\n導演: 南東協',
          thumbnailImageUrl: 'https://upload.wikimedia.org/wikipedia/zh/8/81/HandsomeGuys2024.jpg',
          imageAspectRatio: 'rectangle',
          imageSize: 'cover',
          imageBackgroundColor: '#FFFFFF',
          buttons: [
            {
              label: '訂票去',
              action: {
                type: 'uri',
                uri: 'https://www.showtimes.com.tw/programs/11503',
              },
            },
            {
              label: '觀看預告片',
              action: {
                type: 'uri',
                uri: 'https://youtu.be/YIy0WMtjL2w?si=-MVRM40vj4r_TNN0',
              },
            },
          ],
          defaultAction: {
            type: 'uri',
            uri: 'https://www.showtimes.com.tw/programs/11503',
          },
        },
        {
          title: '鬼才之道',
          text: '演員: 陳柏霖;張榕容;王淨\n導演: 徐漢強',
          thumbnailImageUrl: 'https://capi.showtimes.com.tw/assets/49/49cca24c8625483c83ae8d3016d7a910.jpg',
          imageAspectRatio: 'rectangle',
          imageSize: 'cover',
          imageBackgroundColor: '#FFFFFF',
          buttons: [
            {
              label: '訂票去',
              action: {
                type: 'uri',
                uri: 'https://www.showtimes.com.tw/programs/11487',
              },
            },
            {
              label: '觀看預告片',
              action: {
                type: 'uri',
                uri: 'https://youtu.be/a4IMYv34m_o?si=4dS1A8EuXru15nai',
              },
            },
          ],
          defaultAction: {
            type: 'uri',
            uri: 'https://www.showtimes.com.tw/programs/11487',
          },
        },
      ],
    },
  });
}

export function createChartTemplateExample(): ConversationMessage {
  return createBaseTemplateExample({
    messageId: nanoid(),
    replyToCustomMessageId: '',
    text: '這是圖表範例',
    payload: null,
    isDebug: false,
    idx: 0,
    template: {
      quickReplies: [],
      chartOptions: [
        {
          spec: {
            $schema: 'https://vega.github.io/schema/vega/v5.json',
            description: 'A basic stacked bar chart example.',
            width: 500,
            height: 200,
            padding: 5,
            data: [
              {
                name: 'table',
                values: [
                  { c: '外部廠商', x: '折板機1號線(自動)', y: 3 },
                  { c: '楊*閔', x: '160', y: 28 },
                  { c: '外部廠商', x: '蘿拉沖孔線', y: 2 },
                  { c: '外部廠商', x: '烤二線', y: 17 },
                  { c: '張*麟', x: '160', y: 25 },
                  { c: '蔣*安', x: '160', y: 17 },
                  { c: '楊*閔', x: '歸仁廠區', y: 2 },
                  { c: '外部廠商', x: '190', y: 6 },
                  { c: '外部廠商', x: '三合一多功能線', y: 3 },
                  { c: '楊*閔', x: '三合一多功能線', y: 2 },
                ],
                transform: [
                  {
                    type: 'stack',
                    groupby: ['x'],
                    sort: { field: 'c' },
                    field: 'y',
                  },
                ],
              },
            ],
            scales: [
              {
                name: 'x',
                type: 'band',
                range: 'width',
                domain: { data: 'table', field: 'x' },
              },
              {
                name: 'y',
                type: 'linear',
                range: 'height',
                nice: true,
                zero: true,
                domain: { data: 'table', field: 'y1' },
              },
              {
                name: 'color',
                type: 'ordinal',
                range: 'category',
                domain: { data: 'table', field: 'c' },
              },
            ],
            axes: [
              { orient: 'bottom', scale: 'x', zindex: 1 },
              { orient: 'left', scale: 'y', zindex: 1 },
            ],
            marks: [
              {
                type: 'rect',
                from: { data: 'table' },
                encode: {
                  enter: {
                    x: { scale: 'x', field: 'x' },
                    width: { scale: 'x', band: 1, offset: -1 },
                    y: { scale: 'y', field: 'y0' },
                    y2: { scale: 'y', field: 'y1' },
                    fill: { scale: 'color', field: 'c' },
                  },
                  update: { fillOpacity: { value: 1 } },
                  hover: { fillOpacity: { value: 0.5 } },
                },
              },
            ],
          },
          type: 'bar',
          title: '堆疊長條圖',
        },
        {
          spec: {
            $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
            description: 'A simple pie chart.',
            width: 300,
            height: 200,
            data: {
              values: [
                { category: '外部廠商', value: 31 },
                { category: '楊*閔', value: 32 },
                { category: '張*麟', value: 25 },
                { category: '蔣*安', value: 17 },
              ],
            },
            mark: 'arc',
            encoding: {
              theta: { field: 'value', type: 'quantitative' },
              color: { field: 'category', type: 'nominal' },
            },
          },
          type: 'pie',
          title: '圓餅圖',
        },
      ],
      defaultChart: 'bar',
      text: '好的，這邊已經為您整理出圖表。',
      title: '各工作站新增數量統計',
      type: MessageTemplateType.CHART,
    },
  });
}

export function createImageTemplateExample(width = 400, height = 400): ConversationMessage {
  return createBaseTemplateExample({
    messageId: nanoid(),
    replyToCustomMessageId: '',
    text: '這是圖片範例',
    payload: null,
    isDebug: false,
    idx: 0,
    template: {
      type: MessageTemplateType.IMAGE,
      originalContentUrl: `https://dummyimage.com/${width}x${height}/000/fff&text=Hello+World`,
      previewImageUrl: `https://dummyimage.com/${width}x${height}/000/fff`,
      quickReplies,
    },
  });
}

export function createMathTemplateExample(): ConversationMessage {
  return createBaseTemplateExample({
    messageId: nanoid(),
    replyToCustomMessageId: '',
    text: `# Mathematical Expressions Demo

## Inline Math Examples
- Pythagorean theorem: $a^2 + b^2 = c^2$
- Einstein's mass-energy equivalence: $E = mc^2$
- Quadratic formula: $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$

## Block Math Examples

### Maxwell's Equations
$$\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\epsilon_0}$$

### Matrix Operations
$$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} \\begin{pmatrix} x \\\\ y \\end{pmatrix} = \\begin{pmatrix} ax + by \\\\ cx + dy \\end{pmatrix}$$

### Calculus Integration
$$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$
`,
    payload: null,
    isDebug: false,
    idx: 0,
    template: {
      type: MessageTemplateType.TEXT,
      text: '',
      quickReplies: [{ text: 'Show physics formulas' }, { text: 'Display calculus examples' }],
    },
  });
}

export function createTableTemplateExample(): ConversationMessage {
  const messageId = nanoid();

  const template: TableMessageTemplate = {
    type: MessageTemplateType.TABLE,
    title: '每月銷售額統計',
    table: {
      rowType: 'OBJECT',
      columns: [
        { header: '姓名', key: 'name' },
        { header: '部門', key: 'department' },
        { header: '銷售額', key: 'sales', format: 'CURRENCY' },
        { header: '入職日期', key: 'joinDate', format: 'DATE' },
        { header: '最後更新', key: 'updatedAt', format: 'DATE_TIME' },
      ],
      pagination: { size: 5 },
      data: [
        {
          name: '王小明',
          department: '業務部',
          sales: 150000,
          joinDate: '2022-03-15',
          updatedAt: '2024-12-01T10:30:00',
        },
        {
          name: '李美玲',
          department: '行銷部',
          sales: 120000,
          joinDate: '2021-08-20',
          updatedAt: '2024-12-02T14:20:00',
        },
        {
          name: '張大偉',
          department: '業務部',
          sales: 180000,
          joinDate: '2020-01-10',
          updatedAt: '2024-12-03T09:15:00',
        },
        {
          name: '陳小芳',
          department: '客服部',
          sales: 95000,
          joinDate: '2023-05-01',
          updatedAt: '2024-12-04T16:45:00',
        },
        {
          name: '林志豪',
          department: '業務部',
          sales: 210000,
          joinDate: '2019-11-25',
          updatedAt: '2024-12-05T11:00:00',
        },
        {
          name: '黃雅琪',
          department: '行銷部',
          sales: 135000,
          joinDate: '2022-07-08',
          updatedAt: '2024-12-06T13:30:00',
        },
      ],
    },
    quickReplies: [{ text: '查看更多統計' }, { text: '匯出報表' }],
    sql: `SELECT
  s.salesperson_id,
  s.salesperson_name,
  SUM(o.total_sales_ntd) AS total_sales_ntd,
  SUM(o.total_gross_profit) AS total_gross_profit,
  COUNT(o.sales_count) AS sales_count
FROM salespeople s
LEFT JOIN orders o ON s.salesperson_id = o.salesperson_id
GROUP BY s.salesperson_id, s.salesperson_name
ORDER BY total_sales_ntd DESC`,
    sqlExplanation:
      '此查詢從 salespeople 資料表聯結 orders，統計每位業務員的總銷售額、毛利及訂單數，並依銷售額降冪排序。',
  };

  return createBaseTemplateExample({
    messageId,
    replyToCustomMessageId: '',
    text: '這是表格範例',
    payload: null,
    isDebug: false,
    idx: 0,
    template,
  });
}

// Custom renderer demo messages
export interface OrderPayload {
  customType: 'order_card';
  orderId: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered';
  items: { name: string; quantity: number; price: number }[];
  total: number;
  estimatedDelivery: string;
}

export interface ProductPayload {
  customType: 'product_card';
  productId: string;
  name: string;
  price: number;
  originalPrice?: number;
  imageUrl: string;
  rating: number;
  reviewCount: number;
  inStock: boolean;
}

export interface AlertPayload {
  customType: 'alert';
  severity: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  dismissible?: boolean;
}

export interface WeatherPayload {
  customType: 'weather_card';
  location: string;
  temperature: number;
  condition: 'sunny' | 'cloudy' | 'rainy' | 'snowy';
  humidity: number;
  windSpeed: number;
  forecast: { day: string; high: number; low: number; condition: string }[];
}

export function createOrderCardExample(): ConversationMessage {
  const messageId = nanoid();

  const payload: OrderPayload = {
    customType: 'order_card',
    orderId: 'ORD-2024-001234',
    status: 'shipped',
    items: [
      { name: 'iPhone 15 Pro Max', quantity: 1, price: 42900 },
      { name: 'AirPods Pro 2', quantity: 1, price: 7490 },
      { name: 'MagSafe 充電器', quantity: 2, price: 1190 },
    ],
    total: 52770,
    estimatedDelivery: '2024-12-20',
  };

  return createBaseTemplateExample({
    messageId,
    replyToCustomMessageId: '',
    text: '這是您的訂單資訊',
    payload,
    isDebug: false,
    idx: 0,
    template: {
      type: MessageTemplateType.TEXT,
      text: '',
      quickReplies: [{ text: '追蹤包裹' }, { text: '聯繫客服' }],
    },
  });
}

export function createProductCardExample(): ConversationMessage {
  const messageId = nanoid();

  const payload: ProductPayload = {
    customType: 'product_card',
    productId: 'PROD-001',
    name: 'Sony WH-1000XM5 無線降噪耳機',
    price: 10900,
    originalPrice: 12900,
    imageUrl: 'https://dummyimage.com/300x300/333/fff&text=WH-1000XM5',
    rating: 4.8,
    reviewCount: 2456,
    inStock: true,
  };

  return createBaseTemplateExample({
    messageId,
    replyToCustomMessageId: '',
    text: '為您推薦這款商品',
    payload,
    isDebug: false,
    idx: 0,
    template: {
      type: MessageTemplateType.TEXT,
      text: '',
      quickReplies: [{ text: '加入購物車' }, { text: '查看更多' }],
    },
  });
}

export function createAlertExample(severity: AlertPayload['severity']): ConversationMessage {
  const messageId = nanoid();

  const messages: Record<AlertPayload['severity'], { title: string; message: string }> = {
    info: { title: '系統通知', message: '系統將於今晚 23:00 進行例行維護，預計持續 2 小時。' },
    warning: { title: '庫存警告', message: '您購物車中的商品庫存即將售罄，建議盡快結帳。' },
    error: { title: '付款失敗', message: '信用卡授權失敗，請確認卡片資訊或嘗試其他付款方式。' },
    success: { title: '訂單成功', message: '您的訂單已成功建立！我們將盡快為您安排出貨。' },
  };

  const payload: AlertPayload = {
    customType: 'alert',
    severity,
    ...messages[severity],
    dismissible: severity !== 'error',
  };

  return createBaseTemplateExample({
    messageId,
    replyToCustomMessageId: '',
    text: messages[severity].message,
    payload,
    isDebug: false,
    idx: 0,
    template: {
      type: MessageTemplateType.TEXT,
      text: '',
      quickReplies: [],
    },
  });
}

export function createWeatherCardExample(): ConversationMessage {
  const messageId = nanoid();

  const payload: WeatherPayload = {
    customType: 'weather_card',
    location: '台北市',
    temperature: 22,
    condition: 'cloudy',
    humidity: 75,
    windSpeed: 12,
    forecast: [
      { day: '週一', high: 12, low: 18, condition: 'cloudy' },
      { day: '週二', high: 24, low: 18, condition: 'sunny' },
      { day: '週三', high: 22, low: 17, condition: 'rainy' },
      { day: '週四', high: 20, low: 15, condition: 'cloudy' },
      { day: '週五', high: 20, low: 15, condition: 'cloudy' },
    ],
  };

  return createBaseTemplateExample({
    messageId,
    replyToCustomMessageId: '',
    text: '這是今天的天氣預報',
    payload,
    isDebug: false,
    idx: 0,
    template: {
      type: MessageTemplateType.TEXT,
      text: '',
      quickReplies: [{ text: '查看一週天氣' }, { text: '切換地區' }],
    },
  });
}

export function createUserMessageExample(text: string): ConversationMessage {
  return {
    type: 'user',
    messageId: nanoid(),
    text,
    time: new Date(),
  };
}

export function createToolCallMessages(): ConversationMessage[] {
  const processId = 'proc-001';
  const toolCalls: ConversationToolCallMessage[] = [
    {
      type: 'tool-call',
      messageId: `${processId}-0`,
      eventType: EventType.TOOL_CALL_COMPLETE,
      processId,
      callSeq: 0,
      toolName: 'validate_query',
      toolsetName: 'data-insight',
      parameter: { query: 'SELECT COUNT(*) FROM users GROUP BY cohort' },
      result: { valid: true, estimatedRows: 5 },
      isComplete: true,
      time: new Date(),
    },
    {
      type: 'tool-call',
      messageId: `${processId}-1`,
      eventType: EventType.TOOL_CALL_COMPLETE,
      processId,
      callSeq: 1,
      toolName: 'execute_query',
      toolsetName: 'data-insight',
      parameter: { query: 'SELECT COUNT(*) FROM users GROUP BY cohort' },
      result: { rowCount: 5, status: 'ok' },
      isComplete: true,
      time: new Date(),
    },
    {
      type: 'tool-call',
      messageId: `${processId}-2`,
      eventType: EventType.TOOL_CALL_COMPLETE,
      processId,
      callSeq: 2,
      toolName: 'render_chart',
      toolsetName: 'data-insight',
      parameter: { chartType: 'bar', title: '各群組新增數量' },
      result: { viewId: 'view-123', status: 'ok' },
      isComplete: true,
      time: new Date(),
    },
  ];

  return [
    createUserMessageExample('幫我比較各群組的新增數量'),
    ...toolCalls,
    createBaseTemplateExample({
      messageId: nanoid(),
      replyToCustomMessageId: '',
      text: '已為您產出長條圖，可以看到各群組的新增數量比較。',
      payload: null,
      isDebug: false,
      idx: 0,
      template: {
        type: MessageTemplateType.TEXT,
        text: '',
        quickReplies: [{ text: '匯出報表' }, { text: '換成圓餅圖' }],
      },
    }),
  ];
}

export function createPendingToolCallMessages(): ConversationMessage[] {
  const processId = 'proc-002';
  const toolCalls: ConversationToolCallMessage[] = [
    {
      type: 'tool-call',
      messageId: `${processId}-0`,
      eventType: EventType.TOOL_CALL_COMPLETE,
      processId,
      callSeq: 0,
      toolName: 'search_weather',
      toolsetName: 'weather-service',
      parameter: { location: '台北', date: 'tomorrow' },
      result: { temperature: 22, condition: 'sunny' },
      isComplete: true,
      time: new Date(),
    },
    {
      type: 'tool-call',
      messageId: `${processId}-1`,
      eventType: EventType.TOOL_CALL_COMPLETE,
      processId,
      callSeq: 1,
      toolName: 'search_nearby_places',
      toolsetName: 'location-service',
      parameter: { city: '台北', category: 'outdoor' },
      result: { places: ['陽明山', '大稻埕', '河濱公園'] },
      isComplete: true,
      time: new Date(),
    },
    {
      type: 'tool-call',
      messageId: `${processId}-2`,
      eventType: EventType.TOOL_CALL_START,
      processId,
      callSeq: 2,
      toolName: 'recommend_activities',
      toolsetName: 'activity-service',
      parameter: { weather: 'sunny', places: ['陽明山', '大稻埕', '河濱公園'] },
      isComplete: false,
      time: new Date(),
    },
  ];

  return [createUserMessageExample('幫我查台北明天天氣，並推薦適合的活動'), ...toolCalls];
}

export function createErrorToolCallMessages(): ConversationMessage[] {
  const processId = 'proc-003';
  const toolCalls: ConversationToolCallMessage[] = [
    {
      type: 'tool-call',
      messageId: `${processId}-0`,
      eventType: EventType.TOOL_CALL_COMPLETE,
      processId,
      callSeq: 0,
      toolName: 'validate_query',
      toolsetName: 'data-insight',
      parameter: { query: 'SELECT * FROM orders WHERE date > now()' },
      result: { valid: true },
      isComplete: true,
      time: new Date(),
    },
    {
      type: 'tool-call',
      messageId: `${processId}-1`,
      eventType: EventType.TOOL_CALL_COMPLETE,
      processId,
      callSeq: 1,
      toolName: 'check_permissions',
      toolsetName: 'data-insight',
      parameter: { table: 'orders', action: 'read' },
      result: { allowed: false, reason: 'restricted table' },
      isComplete: true,
      time: new Date(),
    },
    {
      type: 'tool-call',
      messageId: `${processId}-2`,
      eventType: EventType.TOOL_CALL_COMPLETE,
      processId,
      callSeq: 2,
      toolName: 'execute_query',
      toolsetName: 'data-insight',
      parameter: { query: 'SELECT * FROM orders WHERE date > now()' },
      result: { error: 'Permission denied: table "orders" is restricted' },
      isComplete: true,
      time: new Date(),
    },
  ];

  return [
    createUserMessageExample('幫我查詢最近的訂單資料'),
    ...toolCalls,
    {
      type: 'bot',
      messageId: nanoid(),
      isTyping: false,
      typingText: '',
      eventType: EventType.MESSAGE_COMPLETE,
      time: new Date(),
      message: {
        messageId: nanoid(),
        replyToCustomMessageId: '',
        text: '抱歉，查詢訂單資料時發生錯誤，您可能沒有該資料表的存取權限。',
        payload: null,
        isDebug: false,
        idx: 0,
        template: {
          type: MessageTemplateType.TEXT,
          text: '',
          quickReplies: [],
        },
      },
      raw: '',
    },
  ];
}

export function createMixedCustomRendererMessages(): ConversationMessage[] {
  return [
    createUserMessageExample('請幫我查詢訂單狀態'),
    createOrderCardExample(),
    createUserMessageExample('有推薦的耳機嗎？'),
    createProductCardExample(),
    createAlertExample('success'),
    createTextTemplateExample(),
    createAlertExample('warning'),
    createWeatherCardExample(),
    createAlertExample('info'),
  ];
}

export function createAttachmentTemplateExample(): ConversationMessage {
  const messageId = nanoid();

  return createBaseTemplateExample({
    messageId,
    replyToCustomMessageId: '',
    text: '',
    payload: null,
    isDebug: false,
    idx: 0,
    template: {
      type: MessageTemplateType.ATTACHMENT,
      attachments: [
        {
          title: 'article-1.md',
          text: 'Plain Text',
          defaultAction: {
            type: 'uri',
            uri: 'https://store.com/',
          },
        },
        {
          title: 'article-2.pdf',
          text: 'Plain Text',
          defaultAction: {
            type: 'uri',
            uri: 'https://store.com/',
          },
          downloadAction: {
            type: 'emit',
            eventName: 'download_file',
            payload: {},
          },
        },
        {
          title: 'article-3.md',
          text: 'Plain Text',
          defaultAction: {
            type: 'uri',
            uri: 'https://store.com/',
          },
        },
      ],
      quickReplies: [],
    },
  });
}
