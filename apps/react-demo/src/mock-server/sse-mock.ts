// 本地 mock SSE handler,給 Vite dev server 用。
// 攔截 POST `/mock-asgard/message/sse`,回傳一段預設好的 streaming bot reply,
// 不接真實 Asgard backend,純測 SDK 的 send-message + streaming scroll 行為。
//
// F-002 續傳驗證:
// - 每筆 delta 帶 `id: <messageId>:<idx>` cursor。
// - 收到帶 `Last-Event-ID` header 的請求(fetch-event-source 原生重連)→ 從 cursor 續傳同一則 messageId。
// - 使用者訊息含「斷線 / 續傳 / drop / resume」→ 串到一半 `res.destroy()` 模擬中途斷線,觸發原生重連。
// - 使用者訊息含「fail / no-cursor」→ 200 前回 500,模擬 UC-004 無 cursor 失敗(surface、不重送)。
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

interface ParsedPayload {
  customChannelId?: string;
  customMessageId?: string;
  text?: string;
  action?: string;
}

function readBody(req: IncomingMessage): Promise<ParsedPayload> {
  return new Promise(resolve => {
    const chunks: Buffer[] = [];

    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf-8');

        resolve(JSON.parse(body) as ParsedPayload);
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const NAMESPACE = 'mock-namespace';
const BOT_PROVIDER_NAME = 'mock-bot-provider';

// 預設的長回覆 (~28 個 deltas),夠 overflow 一個高度 600px 的 chatbot,
// 讓 scroll follow-bottom 行為在 streaming 過程中可被觀察。
const REPLY_CHUNKS = [
  '收到 ',
  '你的訊息了！',
  '我來回覆',
  '一段較長',
  '的內容，',
  '主要是為了',
  '測試 chatbot ',
  '在 streaming ',
  '過程中,',
  '滾動是否能',
  '一直貼著底部。',
  '\n\n首先，',
  '當 bot 訊息一邊到達、',
  '一邊渲染時，',
  'ResizeObserver ',
  '會持續 fire，',
  '觸發 programmaticScrollToBottom，',
  '視窗應該',
  '持續貼底。',
  '\n\n其次，',
  '使用者送出訊息',
  '的瞬間，',
  'scrollToBottom ',
  '會 snap 到底，',
  '並重置 ',
  'isFollowingLatest=true。',
  '\n\n最後一段',
  '是收尾，完整訊息會在 ',
  'message.complete ',
  '時被換成 final template。',
];

function writeEvent(res: ServerResponse, event: object, id?: string): void {
  if (id) {
    res.write(`id: ${id}\n`);
  }

  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

interface CommonHeader {
  requestId: string;
  namespace: string;
  botProviderName: string;
  customChannelId: string;
}

function emptyFact(): Record<string, unknown> {
  return {
    runInit: null,
    runDone: null,
    runError: null,
    messageStart: null,
    messageDelta: null,
    messageComplete: null,
    messageThinkingStart: null,
    messageThinkingDelta: null,
    messageThinkingComplete: null,
    toolCallStart: null,
    toolCallComplete: null,
    toolCallConsent: null,
    subagentStart: null,
    subagentComplete: null,
    messageUser: null,
    channelTitleUpdate: null,
    sandboxLaunch: null,
    sandboxReady: null,
  };
}

// F-015 restore demo: a channel is treated as "existing" (has a transcript to
// replay on GET rejoin, metadata → exists) purely by an `existing-` id prefix,
// so both branches (restore vs. fresh) are deterministic without server state.
function channelExists(customChannelId: string): boolean {
  return customChannelId.startsWith('existing-');
}

function parseChannelId(req: IncomingMessage): string {
  try {
    const url = new URL(req.url ?? '', 'http://localhost');

    return url.searchParams.get('custom_channel_id') ?? '';
  } catch {
    return '';
  }
}

// Reasoning text streamed as a thinking block before the visible answer (F-001).
const THINKING_CHUNKS = [
  '讓我想一下：',
  '先確認使用者這則訊息想問什麼，',
  '把它拆成幾個小步驟，',
  '評估手上有哪些工具可用、',
  '哪一個最省成本，',
  '再決定回覆的結構，',
  '最後組出完整、好讀的答案。',
];

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
} as const;

export async function handleMockSse(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // GET side of the channel (F-015): rejoin — replay the collapsed transcript,
  // then a terminal. The POST side below dispatches a run.
  if (req.method === 'GET') {
    await handleMockRejoin(req, res);

    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end();

    return;
  }

  const payload = await readBody(req);
  const requestId = randomUUID();
  const customChannelId = payload.customChannelId ?? 'mock-channel';

  // The Sindri multi-panel demo runs a chat-kit-style Q&A scoped to its OWN channel. Branch out here
  // so the rest of this handler (used by the other routes) stays exactly as it was.
  if (customChannelId === 'multi-panel-demo') {
    await handleMultiPanelRun(res, payload);

    return;
  }

  const replyToCustomMessageId = payload.customMessageId ?? '';
  const text = payload.text ?? '';
  const lastEventId = typeof req.headers['last-event-id'] === 'string' ? req.headers['last-event-id'] : undefined;

  const header: CommonHeader = {
    requestId,
    namespace: NAMESPACE,
    botProviderName: BOT_PROVIDER_NAME,
    customChannelId,
  };
  const fullText = REPLY_CHUNKS.join('');

  const deltaEvent = (messageId: string, chunk: string, idx: number): object => ({
    ...header,
    eventType: 'asgard.message.delta',
    fact: {
      ...emptyFact(),
      messageDelta: {
        message: { messageId, replyToCustomMessageId, text: chunk, payload: null, isDebug: false, idx, template: null },
      },
    },
  });

  const completeEvent = (messageId: string): object => ({
    ...header,
    eventType: 'asgard.message.complete',
    fact: {
      ...emptyFact(),
      messageComplete: {
        message: {
          messageId,
          replyToCustomMessageId,
          text: fullText,
          payload: null,
          isDebug: false,
          idx: null,
          template: { type: 'TEXT', text: fullText },
        },
      },
    },
  });

  const runDoneEvent = (): object => ({
    ...header,
    eventType: 'asgard.run.done',
    fact: { ...emptyFact(), runDone: {} },
  });

  // UC-004 — 200 前失敗:無 cursor,不重送 POST,錯誤 surface 給呼叫端。
  if (!lastEventId && /fail|no-cursor/i.test(text)) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('simulated pre-200 failure (UC-004)');

    return;
  }

  // UC-003 — 原生重連帶 Last-Event-ID = `${messageId}:${idx}` → 從斷點續傳同一則訊息。
  if (lastEventId) {
    const sep = lastEventId.lastIndexOf(':');
    const messageId = lastEventId.slice(0, sep);
    const resumeFrom = Number(lastEventId.slice(sep + 1)) + 1;

    res.writeHead(200, SSE_HEADERS);

    for (let i = resumeFrom; i < REPLY_CHUNKS.length; i++) {
      await sleep(60);
      writeEvent(res, deltaEvent(messageId, REPLY_CHUNKS[i], i), `${messageId}:${i}`);
    }

    await sleep(40);
    writeEvent(res, completeEvent(messageId));
    writeEvent(res, runDoneEvent());
    res.end();

    return;
  }

  // 全新 run。
  const messageId = randomUUID();
  const dropMode = /斷線|續傳|drop|resume/i.test(text);
  const dropAt = Math.floor(REPLY_CHUNKS.length / 2);

  res.writeHead(200, SSE_HEADERS);
  writeEvent(res, { ...header, eventType: 'asgard.run.init', fact: { ...emptyFact(), runInit: {} } });
  await sleep(40);

  // Sandbox lifecycle (Files/Browser foundation): the run provisions a sandbox, then it's ready to
  // serve the fs + browser APIs. Both carry `sandboxName`; the SDK folds it into `sandboxName$`.
  const sandboxName = 'sbx-mock-0001';
  writeEvent(res, {
    ...header,
    eventType: 'asgard.sandbox.launch',
    fact: { ...emptyFact(), sandboxLaunch: { sandboxName, blueprintName: 'default' } },
  });
  await sleep(60);
  writeEvent(res, {
    ...header,
    eventType: 'asgard.sandbox.ready',
    fact: { ...emptyFact(), sandboxReady: { sandboxName, blueprintName: 'default' } },
  });
  await sleep(40);

  // Thinking phase (F-001): reasoning streams as its own message before the visible answer.
  // No `id:` on these — the Last-Event-ID resume cursor should track the answer, not thinking.
  const thinkingId = randomUUID();
  const thinkingMessage = (txt: string): object => ({
    messageId: thinkingId,
    replyToCustomMessageId,
    text: txt,
    payload: null,
    isDebug: false,
    idx: null,
    template: null,
  });
  writeEvent(res, {
    ...header,
    eventType: 'asgard.message.thinking.start',
    fact: { ...emptyFact(), messageThinkingStart: { message: thinkingMessage('') } },
  });
  for (const chunk of THINKING_CHUNKS) {
    await sleep(55);
    writeEvent(res, {
      ...header,
      eventType: 'asgard.message.thinking.delta',
      fact: { ...emptyFact(), messageThinkingDelta: { message: thinkingMessage(chunk) } },
    });
  }

  await sleep(40);
  writeEvent(res, {
    ...header,
    eventType: 'asgard.message.thinking.complete',
    fact: { ...emptyFact(), messageThinkingComplete: { message: thinkingMessage(THINKING_CHUNKS.join('')) } },
  });
  await sleep(40);

  // Channel title (F-016): the agent names the topic once it's clear. Ephemeral (live-only, not in
  // rejoin replay); the SDK updates `channelTitle$` from `fact.channelTitleUpdate.title`.
  writeEvent(res, {
    ...header,
    eventType: 'asgard.channel.title.update',
    fact: { ...emptyFact(), channelTitleUpdate: { title: '上週各通路訂單分析' } },
  });
  await sleep(40);

  // Tool-call phase (F-004/F-006): a few native built-in tool calls before the answer, so the
  // demo shows synthesized labels, per-variant icons, and the localized group summary.
  const processId = randomUUID();
  const demoToolCalls: { toolName: string; parameter: Record<string, unknown>; isError?: boolean }[] = [
    { toolName: 'Read', parameter: { file_path: '/repo/packages/core/src/index.ts' } },
    { toolName: 'WebSearch', parameter: { query: 'asgard sdk streaming resume' } },
    { toolName: 'Skill', parameter: { skill: 'code-review' } },
    { toolName: 'Write', parameter: { file_path: '/repo/report.md', content: 'line1\nline2\nline3\nline4\nline5' } },
    { toolName: 'Edit', parameter: { file_path: '/repo/plan.md', old_string: 'a\nb\nc', new_string: 'a\nB\nc\nd' } },
    { toolName: 'WebFetch', parameter: { url: 'https://api.example.com/down' }, isError: true }, // F-009: backend-flagged failure
  ];
  for (let seq = 0; seq < demoToolCalls.length; seq++) {
    const tc = demoToolCalls[seq];
    const toolCall = { toolsetName: '', toolName: tc.toolName, parameter: tc.parameter };
    writeEvent(res, {
      ...header,
      eventType: 'asgard.tool_call.start',
      fact: { ...emptyFact(), toolCallStart: { processId, callSeq: seq, toolCall } },
    });
    await sleep(130);
    writeEvent(res, {
      ...header,
      eventType: 'asgard.tool_call.complete',
      fact: {
        ...emptyFact(),
        toolCallComplete: {
          processId,
          callSeq: seq,
          toolCall,
          toolCallResult: tc.isError ? { message: 'connection refused' } : { ok: true },
          isError: tc.isError ?? false,
        },
      },
    });
  }

  // Task Check List phase (F-010): TaskCreate/TaskUpdate native tool calls fold into one task list
  // (rendered in the docked Task tray, NOT as tool-call rows). The authoritative id + status live on
  // `toolUseResultSidecar` (TaskCreate → task.{id,subject}, TaskUpdate → taskId + statusChange.to),
  // matching asgard-core; `parameter` (the tool input) carries activeForm / description. reduceTasks
  // reads the sidecar first, parameter as fallback (EXT-002).
  const taskProcessId = randomUUID();
  const taskCalls: { toolName: string; parameter: Record<string, unknown>; sidecar: Record<string, unknown> }[] = [
    {
      toolName: 'TaskCreate',
      parameter: { activeForm: '正在讀取訂單資料', description: '從 data warehouse 拉出上週各通路訂單數與金額' },
      sidecar: { task: { id: 'task-1', subject: '讀取並分析訂單資料' } },
    },
    { toolName: 'TaskCreate', parameter: {}, sidecar: { task: { id: 'task-2', subject: '依通路彙總並排序前 5 名' } } },
    { toolName: 'TaskCreate', parameter: {}, sidecar: { task: { id: 'task-3', subject: '產生報表並輸出' } } },
    {
      toolName: 'TaskUpdate',
      parameter: {},
      sidecar: { taskId: 'task-1', statusChange: { from: 'pending', to: 'completed' } },
    },
    {
      toolName: 'TaskUpdate',
      parameter: { activeForm: '正在依通路彙總並排序前 5 名' },
      sidecar: { taskId: 'task-2', statusChange: { from: 'pending', to: 'in_progress' } },
    },
  ];
  for (let seq = 0; seq < taskCalls.length; seq++) {
    const tc = taskCalls[seq];
    const toolCall = { toolsetName: '', toolName: tc.toolName, parameter: tc.parameter };
    writeEvent(res, {
      ...header,
      eventType: 'asgard.tool_call.start',
      fact: { ...emptyFact(), toolCallStart: { processId: taskProcessId, callSeq: seq, toolCall } },
    });
    await sleep(90);
    writeEvent(res, {
      ...header,
      eventType: 'asgard.tool_call.complete',
      fact: {
        ...emptyFact(),
        toolCallComplete: {
          processId: taskProcessId,
          callSeq: seq,
          toolCall,
          toolCallResult: { ok: true },
          toolUseResultSidecar: tc.sidecar,
        },
      },
    });
  }

  // Subagent phase (F-012): an `Agent` tool call spawns a subagent that runs its own child tool
  // calls and finishes via `subagent.complete`. The `Agent` tool_call.complete returns early with
  // `async_launched` — it must NOT mark the subagent done (terminal status is driven by
  // subagent.complete). The `Agent` call and every child are routed OUT of the main tool-call group.
  const subToolUseId = randomUUID();
  const subAgentId = randomUUID();
  const subDescription = '分析上週各通路訂單並找出異常';
  const agentProcessId = randomUUID();
  const agentToolCall = { toolsetName: '', toolName: 'Agent', parameter: { description: subDescription } };

  writeEvent(res, {
    ...header,
    eventType: 'asgard.tool_call.start',
    fact: {
      ...emptyFact(),
      toolCallStart: { processId: agentProcessId, callSeq: 0, toolUseId: subToolUseId, toolCall: agentToolCall },
    },
  });
  await sleep(80);
  writeEvent(res, {
    ...header,
    eventType: 'asgard.subagent.start',
    fact: {
      ...emptyFact(),
      subagentStart: {
        agentId: subAgentId,
        parentToolUseId: subToolUseId,
        subagentType: 'general-purpose',
        description: subDescription,
      },
    },
  });
  await sleep(80);
  // Agent tool call returns early (async_launched); the subagent is still running.
  writeEvent(res, {
    ...header,
    eventType: 'asgard.tool_call.complete',
    fact: {
      ...emptyFact(),
      toolCallComplete: {
        processId: agentProcessId,
        callSeq: 0,
        toolUseId: subToolUseId,
        toolCall: agentToolCall,
        toolCallResult: { status: 'async_launched' },
      },
    },
  });

  const childProcessId = randomUUID();
  const childTools: { toolName: string; parameter: Record<string, unknown>; isError?: boolean }[] = [
    { toolName: 'Read', parameter: { file_path: '/repo/data/orders.csv' } },
    { toolName: 'Bash', parameter: { description: '彙總各通路訂單金額', command: 'python analyze.py' } },
    { toolName: 'WebSearch', parameter: { query: 'retail order anomaly detection' } },
  ];
  for (let seq = 0; seq < childTools.length; seq++) {
    const tc = childTools[seq];
    const toolUseId = `${subToolUseId}-child-${seq}`;
    const toolCall = { toolsetName: '', toolName: tc.toolName, parameter: tc.parameter };
    writeEvent(res, {
      ...header,
      eventType: 'asgard.tool_call.start',
      fact: {
        ...emptyFact(),
        toolCallStart: { processId: childProcessId, callSeq: seq, toolUseId, parentToolUseId: subToolUseId, toolCall },
      },
    });
    await sleep(150);
    writeEvent(res, {
      ...header,
      eventType: 'asgard.tool_call.complete',
      fact: {
        ...emptyFact(),
        toolCallComplete: {
          processId: childProcessId,
          callSeq: seq,
          toolUseId,
          parentToolUseId: subToolUseId,
          toolCall,
          toolCallResult: tc.isError ? { message: 'failed' } : { ok: true },
          isError: tc.isError ?? false,
        },
      },
    });
  }

  // subagent.complete drives the terminal status (not the early Agent tool_call.complete).
  writeEvent(res, {
    ...header,
    eventType: 'asgard.subagent.complete',
    fact: {
      ...emptyFact(),
      subagentComplete: {
        agentId: subAgentId,
        parentToolUseId: subToolUseId,
        subagentType: 'general-purpose',
        description: subDescription,
        status: 'completed',
        summary: '完成上週各通路訂單分析，發現東區通路退貨率異常偏高。',
      },
    },
  });

  await sleep(40);

  writeEvent(res, {
    ...header,
    eventType: 'asgard.message.start',
    fact: {
      ...emptyFact(),
      messageStart: {
        message: {
          messageId,
          replyToCustomMessageId,
          text: '',
          payload: null,
          isDebug: false,
          idx: null,
          template: { type: 'TEXT', text: '' },
        },
      },
    },
  });

  for (let i = 0; i < REPLY_CHUNKS.length; i++) {
    await sleep(60);
    writeEvent(res, deltaEvent(messageId, REPLY_CHUNKS[i], i), `${messageId}:${i}`);

    if (dropMode && i === dropAt) {
      // 串到一半硬砍 socket → client 收到 transport error → fetch-event-source 帶
      // Last-Event-ID = `${messageId}:${dropAt}` 原生重連,打到上面的續傳分支。(UC-003)
      res.destroy();

      return;
    }
  }

  await sleep(40);
  writeEvent(res, completeEvent(messageId));
  writeEvent(res, runDoneEvent());
  res.end();
}

// ===========================================================================================
// Sindri multi-panel demo (F-014) — a chat-kit-style Q&A, isolated to the `multi-panel-demo`
// channel. The initial RESET (empty text) just provisions the sandbox and idles with an empty
// thread; the user then types one of the two questions and gets the matching answer. Content is
// verbatim from the chat-kit prototype. None of this touches handleMockSse's default run (the
// behavior the other routes rely on).
// ===========================================================================================

const MP_SANDBOX_NAME = 'sbx-mock-0001';

// chat-kit a1 thinking — the "rank the channels" question.
const MP_THINKING_RANK = [
  '使用者想看上週各通路的訂單並排名。',
  '第一步先確認「上週」的日期區間 —— 用系統時區的週一到週日,避免跨時區把邊界日算錯。',
  '接著從 orders 表依 channel 彙總「訂單數」與「金額」兩個指標;',
  '要先排除測試訂單與已取消的單,只算有效成交,數字才可信。',
  '金額欄還得留意各通路幣別是否一致,不一致得先換算成同一幣別再加總,否則排名會失真。',
  '彙總後依訂單數由多到少排序取前 5 名。',
  '最後考量呈現:表格最適合看精確數字,再附一張可下載的報表 artifact;',
  '若之後想看趨勢,可再拆成每日折線圖。',
];

// chat-kit a2 thinking — the "which grew fastest" question.
const MP_THINKING_GROWTH = [
  '「成長最快」要比的是成長率,不是絕對量,所以不能只看上週的訂單數排名。',
  '我需要同時拿到「上週」與「前一週」兩段的各通路訂單數,算出每個通路的週增率((本週 − 上週) / 上週),再依增率由高到低排序。',
  '但這裡有幾個要小心的地方:基期太小的通路(例如前一週只有個位數訂單)算出來的成長率會爆高、失去意義,得設一個最低基期門檻,或改用絕對增量輔助判讀;',
  '另外使用者沒指定要比哪兩週,預設先用最近兩個完整週,但也可能其實想看的是月對月或去年同期。',
  '還要考慮通路命名是否一致(同一通路在不同系統可能叫法不同,得先正規化再彙總),以及要不要排除退貨與取消單只算淨成交。',
  '最後決定呈現方式:先給一張排序表標出增率與絕對增量,再視需要補一張折線圖看趨勢,避免只憑單一數字誤判。',
];

// a1 answer + its SQL (as a markdown code fence — the SDK has no dedicated code block).
const MP_REPLY_RANK = [
  '## 上週通路訂單\n',
  '前 5 名通路如下,',
  '**官網**居冠。',
  '詳細數字見下表與報表。',
  '\n\n彙總用的 SQL：\n\n',
  '```sql\n',
  'SELECT channel, COUNT(*) AS orders\n',
  'FROM orders\n',
  'WHERE week = LAST_WEEK\n',
  'GROUP BY channel\n',
  'ORDER BY orders DESC\n',
  'LIMIT 5;\n',
  '```',
];

// chat-kit's a2 is thinking-only; a concise answer is added so the Q&A turn has a reply.
const MP_REPLY_GROWTH = [
  '依**週增率**排序,',
  '**App** 成長最快(+18%),',
  '其次官網(+9%)、LINE(+4%)。',
  '已排除前一週基期過小的通路以免成長率失真;',
  '詳細增率與絕對增量見下表。',
];

interface MockToolCall {
  toolName: string;
  parameter: Record<string, unknown>;
  /** Empty → native built-in (icon + synthesized label); non-empty → general/platform tool. */
  toolsetName?: string;
  /** General tools carry a reason; it becomes the row label (F-004). */
  reason?: string;
  isError?: boolean;
}

// Emit one tool-call group (shared processId), streamed so the running → completed transition shows.
async function emitToolGroup(res: ServerResponse, header: CommonHeader, calls: MockToolCall[]): Promise<void> {
  const processId = randomUUID();

  for (let seq = 0; seq < calls.length; seq++) {
    const c = calls[seq];
    const toolCall = {
      toolsetName: c.toolsetName ?? '',
      toolName: c.toolName,
      reason: c.reason,
      parameter: c.parameter,
    };
    writeEvent(res, {
      ...header,
      eventType: 'asgard.tool_call.start',
      fact: { ...emptyFact(), toolCallStart: { processId, callSeq: seq, toolCall } },
    });
    await sleep(120);
    writeEvent(res, {
      ...header,
      eventType: 'asgard.tool_call.complete',
      fact: {
        ...emptyFact(),
        toolCallComplete: {
          processId,
          callSeq: seq,
          toolCall,
          toolCallResult: c.isError ? { message: 'failed' } : { ok: true },
          isError: c.isError ?? false,
        },
      },
    });
  }
}

async function mpStreamThinking(
  res: ServerResponse,
  header: CommonHeader,
  reply: string,
  chunks: string[],
): Promise<void> {
  const thinkingId = randomUUID();
  const msg = (text: string): object => ({
    messageId: thinkingId,
    replyToCustomMessageId: reply,
    text,
    payload: null,
    isDebug: false,
    idx: null,
    template: null,
  });
  writeEvent(res, {
    ...header,
    eventType: 'asgard.message.thinking.start',
    fact: { ...emptyFact(), messageThinkingStart: { message: msg('') } },
  });
  for (const chunk of chunks) {
    await sleep(55);
    writeEvent(res, {
      ...header,
      eventType: 'asgard.message.thinking.delta',
      fact: { ...emptyFact(), messageThinkingDelta: { message: msg(chunk) } },
    });
  }

  await sleep(40);
  writeEvent(res, {
    ...header,
    eventType: 'asgard.message.thinking.complete',
    fact: { ...emptyFact(), messageThinkingComplete: { message: msg(chunks.join('')) } },
  });
}

async function mpStreamText(res: ServerResponse, header: CommonHeader, reply: string, chunks: string[]): Promise<void> {
  const messageId = randomUUID();
  const fullText = chunks.join('');
  const msg = (text: string, idx: number | null, template: unknown): object => ({
    messageId,
    replyToCustomMessageId: reply,
    text,
    payload: null,
    isDebug: false,
    idx,
    template,
  });
  writeEvent(res, {
    ...header,
    eventType: 'asgard.message.start',
    fact: { ...emptyFact(), messageStart: { message: msg('', null, { type: 'TEXT', text: '' }) } },
  });
  for (let i = 0; i < chunks.length; i++) {
    await sleep(60);
    writeEvent(
      res,
      {
        ...header,
        eventType: 'asgard.message.delta',
        fact: { ...emptyFact(), messageDelta: { message: msg(chunks[i], i, null) } },
      },
      `${messageId}:${i}`,
    );
  }

  await sleep(40);
  writeEvent(res, {
    ...header,
    eventType: 'asgard.message.complete',
    fact: { ...emptyFact(), messageComplete: { message: msg(fullText, null, { type: 'TEXT', text: fullText }) } },
  });
}

function mpEmitTable(
  res: ServerResponse,
  header: CommonHeader,
  reply: string,
  title: string,
  columns: { header: string; key: string }[],
  data: Record<string, unknown>[],
): void {
  writeEvent(res, {
    ...header,
    eventType: 'asgard.message.complete',
    fact: {
      ...emptyFact(),
      messageComplete: {
        message: {
          messageId: randomUUID(),
          replyToCustomMessageId: reply,
          text: '',
          payload: null,
          isDebug: false,
          idx: null,
          template: { type: 'TABLE', title, table: { rowType: 'OBJECT', columns, data } },
        },
      },
    },
  });
}

// The 法蘭螺栓 task list (chat-kit): task1 completed, task2 in_progress, task3 pending.
async function mpEmitTasks(res: ServerResponse, header: CommonHeader): Promise<void> {
  const processId = randomUUID();
  const calls: { toolName: string; parameter: Record<string, unknown>; sidecar: Record<string, unknown> }[] = [
    {
      toolName: 'TaskCreate',
      parameter: {
        activeForm: '查詢 Bolzen 急單用料需求中',
        description: '查詢 Bolzen 客戶法蘭螺栓急單的料號、強度等級、數量,並計算 SWRCH35K φ7.0 線材總需求量。',
      },
      sidecar: { task: { id: 'task-1', subject: '查詢 Bolzen 法蘭螺栓急單用料需求' } },
    },
    {
      toolName: 'TaskCreate',
      parameter: { activeForm: '查詢庫存狀態中' },
      sidecar: { task: { id: 'task-2', subject: '查詢 SWRCH35K φ7.0 庫存狀態' } },
    },
    {
      toolName: 'TaskCreate',
      parameter: { activeForm: '計算短缺量與風險中' },
      sidecar: { task: { id: 'task-3', subject: '計算短缺量與補貨時效風險' } },
    },
    {
      toolName: 'TaskUpdate',
      parameter: {},
      sidecar: { taskId: 'task-1', statusChange: { from: 'pending', to: 'completed' } },
    },
    {
      toolName: 'TaskUpdate',
      parameter: { activeForm: '查詢庫存狀態中' },
      sidecar: { taskId: 'task-2', statusChange: { from: 'pending', to: 'in_progress' } },
    },
  ];
  for (let seq = 0; seq < calls.length; seq++) {
    const tc = calls[seq];
    const toolCall = { toolsetName: '', toolName: tc.toolName, parameter: tc.parameter };
    writeEvent(res, {
      ...header,
      eventType: 'asgard.tool_call.start',
      fact: { ...emptyFact(), toolCallStart: { processId, callSeq: seq, toolCall } },
    });
    await sleep(80);
    writeEvent(res, {
      ...header,
      eventType: 'asgard.tool_call.complete',
      fact: {
        ...emptyFact(),
        toolCallComplete: {
          processId,
          callSeq: seq,
          toolCall,
          toolCallResult: { ok: true },
          toolUseResultSidecar: tc.sidecar,
        },
      },
    });
  }
}

// Three general-purpose subagents (chat-kit): each spawned by an Agent tool call that returns early
// (async_launched), runs child tools, then finishes via subagent.complete.
async function mpEmitSubagents(res: ServerResponse, header: CommonHeader): Promise<void> {
  const runs: { description: string; summary: string; children: MockToolCall[] }[] = [
    {
      description: '查詢 Bolzen 訂單用料需求',
      summary: '查得 1 筆:SO-TM-0455…',
      children: [
        { toolName: 'list_database_semantic_models', reason: '列出可用語意模型', parameter: {} },
        { toolName: 'dry_run_database_query', reason: '驗證用料查詢 SQL', parameter: {} },
        { toolName: 'execute_database_query', reason: '查詢 Bolzen 訂單用料明細', parameter: {} },
      ],
    },
    {
      description: '查詢 SWRCH35K φ7.0 庫存狀態',
      summary: '可用庫存 9,500 kg',
      children: [
        { toolName: 'list_database_semantic_models', reason: '列出可用語意模型', parameter: {} },
        { toolName: 'execute_database_query', reason: '查詢 SWRCH35K φ7.0 可用庫存', parameter: {} },
      ],
    },
    {
      description: '計算短缺量與補貨時效風險',
      summary: '短缺 6,500 kg,前置 30 天趕不上 7/16',
      children: [{ toolName: 'execute_database_query', reason: '計算短缺量', parameter: {} }],
    },
  ];

  for (const sub of runs) {
    const subToolUseId = randomUUID();
    const subAgentId = randomUUID();
    const agentProcessId = randomUUID();
    const agentToolCall = { toolsetName: '', toolName: 'Agent', parameter: { description: sub.description } };

    writeEvent(res, {
      ...header,
      eventType: 'asgard.tool_call.start',
      fact: {
        ...emptyFact(),
        toolCallStart: { processId: agentProcessId, callSeq: 0, toolUseId: subToolUseId, toolCall: agentToolCall },
      },
    });
    await sleep(70);
    writeEvent(res, {
      ...header,
      eventType: 'asgard.subagent.start',
      fact: {
        ...emptyFact(),
        subagentStart: {
          agentId: subAgentId,
          parentToolUseId: subToolUseId,
          subagentType: 'general-purpose',
          description: sub.description,
        },
      },
    });
    await sleep(70);
    writeEvent(res, {
      ...header,
      eventType: 'asgard.tool_call.complete',
      fact: {
        ...emptyFact(),
        toolCallComplete: {
          processId: agentProcessId,
          callSeq: 0,
          toolUseId: subToolUseId,
          toolCall: agentToolCall,
          toolCallResult: { status: 'async_launched' },
        },
      },
    });

    const childProcessId = randomUUID();
    for (let seq = 0; seq < sub.children.length; seq++) {
      const c = sub.children[seq];
      const toolUseId = `${subToolUseId}-child-${seq}`;
      const toolCall = {
        toolsetName: c.toolsetName ?? '',
        toolName: c.toolName,
        reason: c.reason,
        parameter: c.parameter,
      };
      writeEvent(res, {
        ...header,
        eventType: 'asgard.tool_call.start',
        fact: {
          ...emptyFact(),
          toolCallStart: {
            processId: childProcessId,
            callSeq: seq,
            toolUseId,
            parentToolUseId: subToolUseId,
            toolCall,
          },
        },
      });
      await sleep(110);
      writeEvent(res, {
        ...header,
        eventType: 'asgard.tool_call.complete',
        fact: {
          ...emptyFact(),
          toolCallComplete: {
            processId: childProcessId,
            callSeq: seq,
            toolUseId,
            parentToolUseId: subToolUseId,
            toolCall,
            toolCallResult: { ok: true },
          },
        },
      });
    }

    writeEvent(res, {
      ...header,
      eventType: 'asgard.subagent.complete',
      fact: {
        ...emptyFact(),
        subagentComplete: {
          agentId: subAgentId,
          parentToolUseId: subToolUseId,
          subagentType: 'general-purpose',
          description: sub.description,
          status: 'completed',
          summary: sub.summary,
        },
      },
    });
  }
}

async function mpEmitSandbox(res: ServerResponse, header: CommonHeader): Promise<void> {
  writeEvent(res, {
    ...header,
    eventType: 'asgard.sandbox.launch',
    fact: { ...emptyFact(), sandboxLaunch: { sandboxName: MP_SANDBOX_NAME, blueprintName: 'default' } },
  });
  await sleep(60);
  writeEvent(res, {
    ...header,
    eventType: 'asgard.sandbox.ready',
    fact: { ...emptyFact(), sandboxReady: { sandboxName: MP_SANDBOX_NAME, blueprintName: 'default' } },
  });
}

function mpTitle(res: ServerResponse, header: CommonHeader, title: string): void {
  writeEvent(res, {
    ...header,
    eventType: 'asgard.channel.title.update',
    fact: { ...emptyFact(), channelTitleUpdate: { title } },
  });
}

async function handleMultiPanelRun(res: ServerResponse, payload: ParsedPayload): Promise<void> {
  const header: CommonHeader = {
    requestId: randomUUID(),
    namespace: NAMESPACE,
    botProviderName: BOT_PROVIDER_NAME,
    customChannelId: 'multi-panel-demo',
  };
  const reply = payload.customMessageId ?? '';
  const text = payload.text ?? '';
  const isReset = payload.action === 'RESET_CHANNEL' || text.trim() === '';

  res.writeHead(200, SSE_HEADERS);
  writeEvent(res, { ...header, eventType: 'asgard.run.init', fact: { ...emptyFact(), runInit: {} } });
  await sleep(40);
  await mpEmitSandbox(res, header);
  await sleep(40);

  const done = (): void => {
    writeEvent(res, { ...header, eventType: 'asgard.run.done', fact: { ...emptyFact(), runDone: {} } });
    res.end();
  };

  // Initial RESET / empty — provision the sandbox and idle with an empty thread; wait for the user.
  if (isReset) {
    done();

    return;
  }

  // Q1 — 「這幾個通路裡,哪個成長最快?」→ growth-rate answer.
  if (/成長最快|成長率|哪個.*快/.test(text)) {
    await mpStreamThinking(res, header, reply, MP_THINKING_GROWTH);
    await sleep(40);
    await mpStreamText(res, header, reply, MP_REPLY_GROWTH);
    await sleep(60);
    mpEmitTable(
      res,
      header,
      reply,
      '各通路週增率',
      [
        { header: '通路', key: 'channel' },
        { header: '週增率', key: 'growth' },
        { header: '絕對增量', key: 'delta' },
      ],
      [
        { channel: 'App', growth: '+18%', delta: 140 },
        { channel: '官網', growth: '+9%', delta: 110 },
        { channel: 'LINE', growth: '+4%', delta: 25 },
      ],
    );
    await sleep(40);
    done();

    return;
  }

  // Q2 — 「幫我分析上週各通路的訂單,排出前幾名。」→ the rich analysis turn.
  mpTitle(res, header, 'Bolzen 法蘭螺栓急單備料查詢');
  await sleep(60);
  mpTitle(res, header, '法蘭螺栓急單:已改查替代料號 SWRCH38K');
  await sleep(40);
  await mpStreamThinking(res, header, reply, MP_THINKING_RANK);
  await sleep(40);
  await emitToolGroup(res, header, [
    {
      toolsetName: 'ag-material-procurement-tools',
      toolName: 'query_orders',
      reason: '讀取訂單資料',
      parameter: { week: 'LAST_WEEK' },
    },
    {
      toolsetName: 'ag-material-procurement-tools',
      toolName: 'aggregate_by_channel',
      reason: '依通路彙總',
      parameter: {},
    },
    {
      toolsetName: 'ag-material-procurement-tools',
      toolName: 'rank_top',
      reason: '排序前 5 名',
      parameter: { limit: 5 },
    },
  ]);
  await sleep(40);
  await emitToolGroup(res, header, [
    {
      toolName: 'Bash',
      parameter: { command: 'which wkhtmltopdf || which chromium', description: '檢查可用的 PDF 生成工具' },
    },
    { toolName: 'Read', parameter: { file_path: '/mnt/article-workspace/info.md' } },
    {
      toolName: 'Write',
      parameter: {
        file_path: '/work/report.html',
        content:
          '<!DOCTYPE html>\n<html lang="zh-TW">\n<head>\n<meta charset="UTF-8" />\n</head>\n<body>\n<h1>短缺分析報告</h1>\n</body>\n</html>',
      },
    },
    {
      toolName: 'Edit',
      parameter: {
        file_path: '/mnt/article-workspace/plan.md',
        old_string: '### 標題(暫定)\n**SpaceX 上市,台廠跟著飛?**',
        new_string: '### 標題(已確認)\n**星鏈背後的隱形冠軍:台灣供應鏈如何卡位**\n(副標:兆美元賽道)',
        replace_all: false,
      },
    },
    { toolName: 'Skill', parameter: { skill: 'local-plugin:shortage-calc', args: 'SWRCH35K φ7.0 目前短缺多少?' } },
    { toolName: 'WebSearch', parameter: { query: "Inside NATO chief Mark Rutte's U.S. strategy" } },
    {
      toolName: 'WebFetch',
      parameter: { url: 'https://www.cnbc.com/2026/07/09/nato-rutte-trump-europe.html', prompt: '請摘要這篇文章' },
      isError: true,
    },
  ]);
  await mpEmitTasks(res, header);
  await mpEmitSubagents(res, header);
  await sleep(40);
  await mpStreamText(res, header, reply, MP_REPLY_RANK);
  await sleep(60);
  mpEmitTable(
    res,
    header,
    reply,
    '上週通路訂單',
    [
      { header: '通路', key: 'channel' },
      { header: '訂單數', key: 'orders' },
      { header: '金額', key: 'amount' },
    ],
    [
      { channel: '官網', orders: 1280, amount: '$48,200' },
      { channel: 'App', orders: 940, amount: '$31,500' },
      { channel: 'LINE', orders: 610, amount: '$18,900' },
    ],
  );
  await sleep(40);
  done();
}

// F-015 — GET rejoin: replay an existing channel's collapsed history, then a
// terminal so `isConnecting` releases (idle channel). Faithful to asgard-core:
// the snapshot is collapsed to ONE persisted frame per message (user turns via
// `message.user`, bot answers as `message.complete`). `tool_call.*` / thinking
// deltas are EPHEMERAL — never in PG history — so a cold restore rehydrates
// messages only, NOT the derived task/subagent/tool-call activity. A
// non-existing channel just gets an immediate terminal.
async function handleMockRejoin(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const customChannelId = parseChannelId(req) || 'mock-channel';
  const header: CommonHeader = {
    requestId: '', // a rejoin is not tied to one turn
    namespace: NAMESPACE,
    botProviderName: BOT_PROVIDER_NAME,
    customChannelId,
  };

  res.writeHead(200, SSE_HEADERS);

  if (!channelExists(customChannelId)) {
    // Nothing to replay — synthesize the terminal so the client releases input.
    writeEvent(res, { ...header, eventType: 'asgard.run.done', fact: { ...emptyFact(), runDone: {} } });
    res.end();

    return;
  }

  // 1) User side — `message.user` is persist-only, so it only surfaces on rejoin.
  const priorUserId = 'restored-user-1';
  writeEvent(res, {
    ...header,
    eventType: 'asgard.message.user',
    fact: {
      ...emptyFact(),
      messageUser: { messageId: priorUserId, customMessageId: priorUserId, text: '上週各通路的訂單狀況如何？' },
    },
  });
  await sleep(60);

  // 2) Bot answer — collapsed to a single `message.complete` (rejoin does not re-stream deltas).
  const priorBotId = 'restored-bot-1';
  const restoredAnswer = '上週四個通路合計 1,240 筆訂單、營收約 NT$3.8M。東區退貨率偏高（12%），已在報表中標記待追蹤。';
  writeEvent(
    res,
    {
      ...header,
      eventType: 'asgard.message.complete',
      fact: {
        ...emptyFact(),
        messageComplete: {
          message: {
            messageId: priorBotId,
            replyToCustomMessageId: priorUserId,
            text: restoredAnswer,
            payload: null,
            isDebug: false,
            idx: null,
            template: { type: 'TEXT', text: restoredAnswer },
          },
        },
      },
    },
    `${priorBotId}:0`,
  );
  await sleep(60);

  // 3) Terminal — idle channel, so input releases immediately after the replay.
  writeEvent(res, { ...header, eventType: 'asgard.run.done', fact: { ...emptyFact(), runDone: {} } });
  res.end();
}

// F-015 — GET channel metadata: an `existing-` channel returns its metadata
// (SuccessResp envelope); anything else is 404 (ChannelNotFound), which the SDK
// reads as "does not exist" to decide reset vs. empty.
export async function handleMockChannelMetadata(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end();

    return;
  }

  const customChannelId = parseChannelId(req);

  if (!customChannelId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ isSuccess: false }));

    return;
  }

  if (!channelExists(customChannelId)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ isSuccess: false }));

    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      isSuccess: true,
      data: { customChannelId, title: '還原的頻道', runState: 'IDLE', lastActivityAt: new Date().toISOString() },
    }),
  );
}

// Sandbox Browser (part 2) — POST /sandbox/{name}/browser/open-url → { isSuccess, data: { openURL } }.
// Mounted at `/mock-asgard/sandbox`, so req.url is `/{name}/browser/open-url`. Returns a same-origin
// mock frame URL (a real backend returns a one-time Neko embed URL).
// Mock sandbox filesystem for the Files panel (part 3): a tiny tree + file contents by path.
const MOCK_FS: Record<string, { name: string; isDir: boolean; sizeBytes?: number }[]> = {
  '/': [
    { name: 'README.md', isDir: false, sizeBytes: 64 },
    { name: 'outputs', isDir: true },
    { name: 'uploads', isDir: true },
  ],
  '/outputs': [{ name: '客服月報.xlsx', isDir: false, sizeBytes: 20480 }],
  '/uploads': [{ name: 'notes.txt', isDir: false, sizeBytes: 32 }],
};
const MOCK_FILE: Record<string, string> = {
  '/README.md': '# Sandbox\n\n這是 mock sandbox 的工作區。真實環境由 GET /sandbox/{name}/fs/file 讀取。\n',
  '/outputs/客服月報.xlsx': '(binary xlsx — mock 內容)',
  '/uploads/notes.txt': 'mock uploaded note.\n',
};

export async function handleMockSandbox(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '', 'http://localhost');

  if (req.method === 'POST' && url.pathname.endsWith('/browser/open-url')) {
    const name = url.pathname.split('/').filter(Boolean)[0] ?? 'sandbox';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        isSuccess: true,
        data: { openURL: `/mock-asgard/sandbox-frame?sbx=${encodeURIComponent(name)}` },
      }),
    );

    return;
  }

  if (req.method === 'GET' && url.pathname.endsWith('/fs/list')) {
    const path = url.searchParams.get('path') ?? '/';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ isSuccess: true, data: { entries: MOCK_FS[path] ?? [], truncated: false } }));

    return;
  }

  if (req.method === 'GET' && url.pathname.endsWith('/fs/file')) {
    const path = url.searchParams.get('path') ?? '';
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    res.end(MOCK_FILE[path] ?? `（找不到 ${path}）`);

    return;
  }

  res.statusCode = 404;
  res.end();
}

// The mock "Neko" browser page embedded by <SandboxBrowser>'s iframe (same-origin so it renders).
export async function handleMockSandboxFrame(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '', 'http://localhost');
  const name = url.searchParams.get('sbx') ?? 'sandbox';
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(
    `<!doctype html><html><body style="font-family:system-ui;background:#0d0d0d;color:#e5e7eb;display:grid;place-items:center;height:100vh;margin:0">` +
      `<div style="text-align:center"><div style="font-size:44px">🌐</div>` +
      `<p style="margin:8px 0 2px">Mock Neko browser</p>` +
      `<p style="margin:0;opacity:.6;font-family:monospace">${name}</p>` +
      `<p style="margin:12px 0 0;opacity:.4;font-size:12px">（真實環境是 agent 操作的遠端瀏覽器）</p></div></body></html>`,
  );
}
