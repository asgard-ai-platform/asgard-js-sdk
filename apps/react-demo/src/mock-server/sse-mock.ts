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
  };
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
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end();

    return;
  }

  const payload = await readBody(req);
  const requestId = randomUUID();
  const customChannelId = payload.customChannelId ?? 'mock-channel';
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
