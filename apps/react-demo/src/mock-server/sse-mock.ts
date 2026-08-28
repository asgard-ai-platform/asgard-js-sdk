// 本地 mock SSE handler,給 Vite dev server 用。
// 攔截 POST `/mock-asgard/message/sse`,回傳一段預設好的 streaming bot reply,
// 不接真實 Asgard backend,純測 SDK 的 send-message + streaming scroll 行為。
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

interface ParsedPayload {
  customChannelId?: string;
  customMessageId?: string;
  text?: string;
  action?: string;
  blobIds?: string[];
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

// Split text into small pieces for typewriter-style delta streaming (code-point aware so CJK / emoji
// never split mid-character).
function chunkText(text: string, size = 3): string[] {
  const chars = Array.from(text);
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += size) out.push(chars.slice(i, i + size).join(''));

  return out;
}

const NAMESPACE = 'mock-namespace';
const BOT_PROVIDER_NAME = 'mock-bot-provider';

// F-021 — channels that have received a NUDGE (empty-state → wake). The metadata handler starts them with
// no live sandbox and, once nudged, reports one — so the built-in aside's dropdown refills after the wake.
const nudgedChannels = new Set<string>();

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

// 豐富 markdown 串流示範內容（scoped 到 customChannelId `markdown-stream-demo`）。用 chunkText
// 切成細碎 delta，讓 streamdown 一邊接收未完成的 markdown（表格 / code fence / 清單）一邊漸進渲染。
const MARKDOWN_STREAM_TEXT = [
  '# 分析結果',
  '',
  '上週通路訂單以**官網居冠（1,280 筆）**，其中 *急單* 佔比偏高。以下為完整分析。',
  '',
  '## 庫存與缺口',
  '',
  'Bolzen 急單需 SWRCH35K φ7.0 線材 **16,000 kg**，可用庫存 9,500 kg → **短缺 6,500 kg**。',
  '',
  '### 替代方案',
  '',
  '- 標準料號 `SWRCH35K`：前置 30 天，趕不上 7/16',
  '- 替代料號 `SWRCH38K`：前置 15 天',
  '- 外購急件：成本 +20%，不建議',
  '',
  '1. 先鎖定替代料號 SWRCH38K',
  '2. 通知採購開單',
  '3. 更新生產排程',
  '',
  '> 註：替代料號需品保確認材質相容性後才能投產。',
  '',
  '## 報表產出',
  '',
  '| 項目 | 檔名 | 狀態 |',
  '| --- | --- | --- |',
  '| 分析報表 | `report.html` | 已建立 |',
  '| 計畫文件 | `plan.md` | 標題已更新 |',
  '| 出貨清單 | `shipping.csv` | 待補 |',
  '',
  '計算邏輯：',
  '',
  '```python',
  'def shortage(demand, stock):',
  '    return max(demand - stock, 0)',
  '```',
  '',
  '詳見 [完整文件](https://example.com)。',
  '',
  '---',
  '',
  '*本報告由系統自動產生。*',
].join('\n');

function writeEvent(res: ServerResponse, event: object): void {
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
    toolCallStart: null,
    toolCallComplete: null,
    toolCallConsent: null,
    promptSuggestion: null,
  };
}

// F-032 — the SDK no longer sends `RESET_CHANNEL`. Both the mount-time opening of a channel that does
// not exist and the header's reset (after its own `DELETE /channel`) now arrive as a plain `NONE` with
// no text, which is exactly what a real backend sees. The showcase routes still need to tell "this is
// the opening run, replay the whole script" apart from "the user typed something afterwards", so they
// ask this instead of matching on the action. `RESET_CHANNEL` is still recognized so a consumer pinned
// to an older SDK keeps working against the mock.
function isOpeningTurn(payload: ParsedPayload): boolean {
  if (payload.action === 'RESET_CHANNEL') return true;

  return payload.action === 'NONE' && !(payload.text ?? '').trim();
}

export async function handleMockSse(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // F-014 — GET /message/sse is the transcript cold-start rejoin: replay the collapsed history
  // (message.user + self-sufficient *.complete), each frame carrying an `id:` cursor.
  if (req.method === 'GET') {
    await handleMockTranscriptRejoin(req, res);

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

  // F-011 adversarial-order demo — scoped to its own channel so the other routes' happy-flow mock below
  // is untouched. The route sends a keyword message; the mock replays a pathological frame order.
  if (customChannelId === 'stream-robustness-demo') {
    await handleStreamRobustnessMock(res, payload);

    return;
  }

  // F-002 Last-Event-ID resume demo — scoped channel. A fresh run drops the socket mid-stream; the
  // library reconnects with `Last-Event-ID` and the mock resumes from that cursor. A `no-cursor` keyword
  // fails before 200 → surfaced as an error, never re-POSTed.
  if (customChannelId === 'stream-resume-demo') {
    await handleStreamResumeMock(req, res, payload);

    return;
  }

  // F-001 thinking demo — scoped channel. Streams an extended-thinking sequence
  // (thinking.start → delta×N → complete) then the visible answer, so the ThinkingBlock's
  // streaming (auto-scroll window) and completed ("Thought for a moment" + show more) states show.
  if (customChannelId === 'thinking-demo') {
    await handleThinkingMock(res, payload);

    return;
  }

  // F-003 run-indicator demo — scoped channel. Streams a multi-message run with inter-message gaps
  // and a complete→done tail, so the seam indicator can be seen staying lit the whole run (bound to
  // the connection, not per-message) — no flicker, no disappearance in the gaps.
  // F-023 — the stop-generation demo channels. The run keeps streaming until the suspend endpoint has
  // been called, so pressing stop is visibly what ends it (and, on the timeout channel, only `force` is).
  if (customChannelId.startsWith('stop-generation-')) {
    await handleStopGenerationMock(res, payload, customChannelId);

    return;
  }

  // F-028 next-turn suggestion demo — scoped channels. The route mounts the shell twice (full-bleed and
  // the SDK's default 375×640) so both widths can be compared side by side, hence the prefix match: the
  // narrow one is `-narrow` and must run the same scripts, not fall through to the generic reply.
  if (customChannelId.startsWith('canvas-demo')) {
    await handleCanvasMock(res, payload, customChannelId);

    return;
  }

  if (customChannelId.startsWith('question-template-demo')) {
    await handleQuestionCardMock(res, payload, customChannelId);

    return;
  }

  if (customChannelId.startsWith('prompt-suggestion-demo')) {
    await handlePromptSuggestionMock(res, payload, customChannelId);

    return;
  }

  if (customChannelId === 'run-indicator-demo') {
    await handleRunIndicatorMock(res, payload);

    return;
  }

  // F-018 sandbox launch HUD demo — scoped channel. Streams sandbox.launch → (gap) → sandbox.ready
  // around a normal message run. A "cold" send holds `launch` >1s so the HUD floats in then rings out
  // on ready; a "warm" send reaches ready <1s so the HUD stays silent. The run seam indicator lights the
  // whole time, demonstrating the two are independent and can coexist.
  if (customChannelId === 'sandbox-hud-demo') {
    await handleSandboxHudMock(res, payload, customChannelId);

    return;
  }

  // BUG-006 — the /join-init route's ① restore and ③ init scenarios, extended with the same
  // sandbox.launch → (gap) → sandbox.ready timeline as sandbox-hud-demo, so the Launch HUD fix on the
  // non-reset join paths (F-015 R2 / R4) is visible in the browser, not just in Vitest.
  if (customChannelId === 'join-existing-demo' || customChannelId === 'join-new-noreset-demo') {
    await handleSandboxHudMock(res, payload, customChannelId);

    return;
  }

  // All-features showcase — scoped channel. One run streams every roadmap feature through the real
  // <Chatbot> at once: run indicator (F-003), sandbox Launch HUD (F-018), channel title update (F-016/017), thinking (F-001),
  // tool-call variants + grouping + diff + isError + expand (F-004/006/007/008/009), the docked Task
  // (F-010) and Subagent (F-012) panels, and the assembled answer (F-011). Auto-plays on the mount
  // opening turn; a later plain send gets a short reply so the page stays interactive.
  if (customChannelId === 'all-features-demo') {
    await handleAllFeaturesMock(res, payload);

    return;
  }

  // BUG-003 — a long run that keeps the thread growing for ~15s so the docked Task / Subagent strip can be
  // watched while messages stream and the view auto-scrolls. Three variants: `-demo` (typical run chrome),
  // `-tall-demo` (checklist past the strip's 50% cap) and `-empty-demo` (no run chrome at all).
  if (customChannelId.startsWith('docked-run-chrome-')) {
    const variant =
      customChannelId === 'docked-run-chrome-empty-demo'
        ? 'empty'
        : customChannelId === 'docked-run-chrome-tall-demo'
        ? 'tall'
        : 'chrome';
    await handleDockedRunChromeMock(res, payload, customChannelId, variant);

    return;
  }

  // F-032 — the delete-channel demo channels. Every reply reads back the mock's own server-side state,
  // so "the screen cleared" and "the conversation was really deleted" can be told apart.
  if (customChannelId.startsWith('delete-channel-')) {
    await handleDeleteChannelMock(res, payload, customChannelId);

    return;
  }

  // F-021 AC4 — NUDGE: an invisible turn (empty text, no message frames). Wakes an idle sandbox: the mock
  // records the channel as nudged (so the next metadata refetch reports a live sandbox) and emits
  // sandbox.launch → ready. The SDK's launch handler auto-refetches metadata → the dropdown refills.
  if (payload.action === 'NUDGE') {
    await handleNudgeMock(res, customChannelId);

    return;
  }

  const replyToCustomMessageId = payload.customMessageId ?? '';
  const messageId = randomUUID();
  const streamChunks = customChannelId === 'markdown-stream-demo' ? chunkText(MARKDOWN_STREAM_TEXT) : REPLY_CHUNKS;
  const fullText = streamChunks.join('');

  const header: CommonHeader = {
    requestId,
    namespace: NAMESPACE,
    botProviderName: BOT_PROVIDER_NAME,
    customChannelId,
  };

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  // 1. run.init
  writeEvent(res, { ...header, eventType: 'asgard.run.init', fact: { ...emptyFact(), runInit: {} } });
  await sleep(40);

  // 2. message.start (空 text,bot 訊息進入 isTyping 狀態)
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

  // 3. message.delta * N — 每 60ms 一筆,模擬真實 LLM streaming
  let idx = 0;

  for (const chunk of streamChunks) {
    await sleep(60);
    writeEvent(res, {
      ...header,
      eventType: 'asgard.message.delta',
      fact: {
        ...emptyFact(),
        messageDelta: {
          message: {
            messageId,
            replyToCustomMessageId,
            text: chunk,
            payload: null,
            isDebug: false,
            idx: idx++,
            template: null,
          },
        },
      },
    });
  }

  await sleep(40);

  // 4. message.complete (final 文字 + template)
  writeEvent(res, {
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

  // 5. run.done
  writeEvent(res, { ...header, eventType: 'asgard.run.done', fact: { ...emptyFact(), runDone: {} } });

  res.end();
}

// ---------------------------------------------------------------------------------------------------
// F-011 — message stream assembly robustness demo. Each button on the /stream-robustness route sends a
// keyword message; this handler replays one adversarial frame order for a single messageId so the SDK's
// reducer + renderer can be observed surviving it (no dropped text, no stuck typing, no blanked message).
// ---------------------------------------------------------------------------------------------------

const TEXT_TEMPLATE = (text: string): Record<string, unknown> => ({ type: 'TEXT', text });

function messageFrame(
  header: CommonHeader,
  eventType: 'asgard.message.start' | 'asgard.message.delta' | 'asgard.message.complete',
  messageId: string,
  replyToCustomMessageId: string,
  text: string,
  template: Record<string, unknown> | null,
): object {
  const factKey =
    eventType === 'asgard.message.start'
      ? 'messageStart'
      : eventType === 'asgard.message.delta'
      ? 'messageDelta'
      : 'messageComplete';

  return {
    ...header,
    eventType,
    fact: {
      ...emptyFact(),
      [factKey]: {
        message: { messageId, replyToCustomMessageId, text, payload: null, isDebug: false, idx: null, template },
      },
    },
  };
}

async function handleStreamRobustnessMock(res: ServerResponse, payload: ParsedPayload): Promise<void> {
  const header: CommonHeader = {
    requestId: randomUUID(),
    namespace: NAMESPACE,
    botProviderName: BOT_PROVIDER_NAME,
    customChannelId: 'stream-robustness-demo',
  };
  const replyTo = payload.customMessageId ?? '';
  const text = payload.text ?? '';
  const messageId = randomUUID();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  writeEvent(res, { ...header, eventType: 'asgard.run.init', fact: { ...emptyFact(), runInit: {} } });
  await sleep(40);

  const emit = async (
    eventType: 'asgard.message.start' | 'asgard.message.delta' | 'asgard.message.complete',
    frameText: string,
    template: Record<string, unknown> | null,
  ): Promise<void> => {
    writeEvent(res, messageFrame(header, eventType, messageId, replyTo, frameText, template));
    await sleep(140);
  };

  if (/delta-before-start/.test(text)) {
    // R2 — delta arrives with no start; the reducer lazy-creates and accumulates (never drops).
    await emit('asgard.message.delta', '缺 start，直接來 delta：', null);
    await emit('asgard.message.delta', '文字被 lazy-init 累加，不丟棄。', null);
    const full = '缺 start，直接來 delta：文字被 lazy-init 累加，不丟棄。';
    await emit('asgard.message.complete', full, TEXT_TEMPLATE(full));
  } else if (/start-after-complete/.test(text)) {
    // R3 — a completed message must not regress; the late start + delta are ignored.
    const done = '已完成的權威答案 —— 終態不該被遲到的 start / delta 打回。';
    await emit('asgard.message.complete', done, TEXT_TEMPLATE(done));
    await emit('asgard.message.start', '', TEXT_TEMPLATE(''));
    await emit('asgard.message.delta', '（這段遲到的 delta 應被忽略，不覆蓋終態）', null);
  } else if (/dup-complete/.test(text)) {
    // R3/R4 — duplicate complete stays idempotent (one message, terminal preserved).
    const dup = '重複 complete → 冪等，仍只有一則完成訊息。';
    await emit('asgard.message.complete', dup, TEXT_TEMPLATE(dup));
    await emit('asgard.message.complete', dup, TEXT_TEMPLATE(dup));
  } else if (/no-template/.test(text)) {
    // R5 — a complete with no template renders its plain text (not an empty bubble).
    await emit('asgard.message.complete', 'complete 沒有 template → 前端 fallback 顯示純文字，不是空白 <div/>。', null);
  } else {
    // R1 — complete-only (default): materialize the terminal from a single frame.
    const only = '只有 complete（無 start / delta）也能直接呈現完成訊息，不經 typing 泡泡。';
    await emit('asgard.message.complete', only, TEXT_TEMPLATE(only));
  }

  writeEvent(res, { ...header, eventType: 'asgard.run.done', fact: { ...emptyFact(), runDone: {} } });
  res.end();
}

// ---------------------------------------------------------------------------------------------------
// F-001 — extended-thinking demo. Streams a reasoning sequence (thinking.start → delta×N → complete)
// long enough to overflow the streaming window (shows the bottom-anchored auto-scroll + top mask) and
// to exceed the completed-state preview cap (shows "顯示更多"), then the visible answer below it.
// ---------------------------------------------------------------------------------------------------

const THINKING_CHUNKS = [
  '先拆解使用者的問題：',
  '他想知道各通路上週的成長狀況與排名。',
  '\n我需要幾個步驟：',
  '\n1. 取出上週與前一週各通路的訂單數，',
  '\n2. 按通路分組、算出成長率，',
  '\n3. 由高到低排序，',
  '\n4. 挑出前幾名並簡述原因。',
  '\n\n先確認資料範圍是否足夠，',
  '再決定要不要呼叫分析工具。',
  '看起來 orders 表已涵蓋所需欄位，可以直接彙總計算。',
  '\n\n另外要注意幾個邊界情況：',
  '\n- 上週有跨月，帳務結算日可能落在不同區間；',
  '\n- 部分通路上週才開通，成長率的分母會偏小、要標注；',
  '\n- 退貨與取消的訂單要不要計入，會影響排名。',
  '\n\n綜合以上，先用含退貨淨額、且排除未滿一週的通路來排，最穩健。',
];

const THINKING_ANSWER =
  '根據上週資料，成長最快的是行動 App（+38%），其次是 LINE 官方帳號（+21%）、官網（+9%）。行動 App 的成長主要來自推播導流的回購。';

function thinkingFrame(
  header: CommonHeader,
  eventType: 'asgard.message.thinking.start' | 'asgard.message.thinking.delta' | 'asgard.message.thinking.complete',
  messageId: string,
  replyToCustomMessageId: string,
  text: string,
): object {
  const factKey =
    eventType === 'asgard.message.thinking.start'
      ? 'messageThinkingStart'
      : eventType === 'asgard.message.thinking.delta'
      ? 'messageThinkingDelta'
      : 'messageThinkingComplete';

  return {
    ...header,
    eventType,
    fact: {
      ...emptyFact(),
      [factKey]: {
        message: { messageId, replyToCustomMessageId, text, payload: null, isDebug: false, idx: null, template: null },
      },
    },
  };
}

async function handleThinkingMock(res: ServerResponse, payload: ParsedPayload): Promise<void> {
  const header: CommonHeader = {
    requestId: randomUUID(),
    namespace: NAMESPACE,
    botProviderName: BOT_PROVIDER_NAME,
    customChannelId: 'thinking-demo',
  };
  const replyTo = payload.customMessageId ?? '';
  const thinkingId = randomUUID();
  const answerId = randomUUID();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  writeEvent(res, { ...header, eventType: 'asgard.run.init', fact: { ...emptyFact(), runInit: {} } });
  await sleep(40);

  // Extended-thinking: start (empty) → delta×N (streams into the auto-scroll window) → complete (full).
  writeEvent(res, thinkingFrame(header, 'asgard.message.thinking.start', thinkingId, replyTo, ''));
  await sleep(80);

  for (const chunk of THINKING_CHUNKS) {
    await sleep(90);
    writeEvent(res, thinkingFrame(header, 'asgard.message.thinking.delta', thinkingId, replyTo, chunk));
  }

  await sleep(80);
  writeEvent(
    res,
    thinkingFrame(header, 'asgard.message.thinking.complete', thinkingId, replyTo, THINKING_CHUNKS.join('')),
  );

  // The visible answer follows the thinking block.
  await sleep(160);
  writeEvent(res, messageFrame(header, 'asgard.message.start', answerId, replyTo, '', TEXT_TEMPLATE('')));
  await sleep(120);
  writeEvent(
    res,
    messageFrame(header, 'asgard.message.complete', answerId, replyTo, THINKING_ANSWER, TEXT_TEMPLATE(THINKING_ANSWER)),
  );

  writeEvent(res, { ...header, eventType: 'asgard.run.done', fact: { ...emptyFact(), runDone: {} } });
  res.end();
}

// ---------------------------------------------------------------------------------------------------
// F-030 — canvas demo. The fragment is streamed at the cadence measured on the product path: going
// through modelrouter → proxy → sandbox CLI it arrives at roughly 7 bytes per delta (a 2.3KB drawing
// came as 349 deltas) at about 270 bytes/s, i.e. one chunk every ~25ms. The pacing is deliberately not
// compressed — "how long before anything is visible" is exactly what the skeleton state exists for,
// and the fragment is style-first, so its first half has nothing to look at.
//
// Scripts, keyed off what was sent:
//   「重播」 → complete only, no deltas — what a rejoin replays (UC-052)
//   「壞掉」 → deltas, then a complete with NO template — the backend could not draw it (UC-053)
//   「長」   → a fragment past the 520px cap, so "scrolls inside the card" is observable (AC13)
//   「亂寫」 → a fragment that repeats the title, hardcodes colors and leaves a tag unclosed (AC17)
//   anything else → the full stream (UC-051)
// ---------------------------------------------------------------------------------------------------

const CANVAS_STEP_MS = 25;
const CANVAS_CHUNK = 7;
const CANVAS_TITLE = '資料管線現況';
const CANVAS_HTML =
  '<style>\n  /* \u53ea\u7528\u6ce8\u5165\u9032\u4f86\u7684\u4e94\u500b token \u2014\u2014 \u9019\u662f agent \u552f\u4e00\u62ff\u5f97\u5230\u7684\u8abf\u8272\u76e4(\u898b\u5f8c\u7aef show_canvas \u7684\u8aaa\u660e)\u3002\n     \u786c\u5beb\u8272\u78bc\u7684\u8a71,\u756b\u5e03\u5728\u53e6\u4e00\u7a2e\u4e3b\u984c\u4e0b\u5c31\u6703\u58de\u6389,\u800c\u4e14\u8ddf\u7522\u54c1\u7684\u54c1\u724c\u8272\u5404\u8d70\u5404\u7684\u3002 */\n  .pl { display: grid; gap: 0.75rem; font-size: 13px; }\n  .pl-row { display: flex; align-items: center; gap: 0.5rem; }\n  .pl-stage {\n    flex: 1; min-width: 0; padding: 0.6rem 0.7rem; border-radius: 0.5rem;\n    background: color-mix(in srgb, var(--canvas-accent) 12%, transparent);\n    border: 1px solid color-mix(in srgb, var(--canvas-accent) 38%, transparent);\n  }\n  .pl-stage b { display: block; font-size: 13px; margin-bottom: 0.15rem; }\n  .pl-stage span { color: var(--canvas-muted); font-size: 11.5px; }\n  .pl-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 0.5rem; }\n  .pl-metric {\n    padding: 0.5rem 0.6rem; border-radius: 0.5rem;\n    background: color-mix(in srgb, var(--canvas-fg) 6%, transparent);\n    border: 1px solid var(--canvas-border);\n  }\n  .pl-metric i { font-style: normal; color: var(--canvas-muted); font-size: 11px; }\n  .pl-metric b { display: block; font-size: 17px; font-weight: 650; margin-top: 0.1rem; }\n  .pl-bars { display: flex; align-items: flex-end; gap: 0.35rem; height: 64px; }\n  .pl-bars i { flex: 1; border-radius: 0.2rem 0.2rem 0 0; background: var(--canvas-accent); opacity: 0.8; }\n</style>\n<div class="pl">\n  <div class="pl-row">\n    <div class="pl-stage"><b>Ingest</b><span>Kafka topics \u00b7 12 sources</span></div>\n    <svg width="26" height="14" viewBox="0 0 26 14" aria-hidden="true">\n      <path d="M0 7h18M18 7l-5-4M18 7l-5 4" stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.55"/>\n    </svg>\n    <div class="pl-stage"><b>Transform</b><span>dbt \u00b7 34 models</span></div>\n    <svg width="26" height="14" viewBox="0 0 26 14" aria-hidden="true">\n      <path d="M0 7h18M18 7l-5-4M18 7l-5 4" stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.55"/>\n    </svg>\n    <div class="pl-stage"><b>Serve</b><span>Postgres \u00b7 4 marts</span></div>\n  </div>\n  <div class="pl-metrics">\n    <div class="pl-metric"><i>\u541e\u5410</i><b>1.2M/\u65e5</b></div>\n    <div class="pl-metric"><i>\u5ef6\u9072 p95</i><b>4.3 \u5206</b></div>\n    <div class="pl-metric"><i>\u5931\u6557\u7387</i><b>0.02%</b></div>\n  </div>\n  <div class="pl-bars">\n    <i style="height:38%"></i><i style="height:52%"></i><i style="height:47%"></i>\n    <i style="height:71%"></i><i style="height:64%"></i><i style="height:88%"></i>\n  </div>\n</div>';

// The fragment's own script. It must run exactly once and only after the fragment is final — running
// mid-stream would execute against half a tree. It stamps a counter onto #root so "exactly once" is
// observable from inside the frame.
const CANVAS_SCRIPT =
  '<scr' +
  'ipt>var r=document.getElementById("root");' +
  'var n=Number(r.getAttribute("data-script-runs")||0)+1;' +
  'r.setAttribute("data-script-runs", String(n));' +
  // Reported outward because the host cannot read into the frame — this is how "the fragment's own
  // script really executed, exactly once, after the drawing finished" becomes observable in a browser.
  'parent.postMessage({ __canvasDemo: "script-ran", runs: n }, "*");' +
  '</scr' +
  'ipt>';

const CANVAS_FRAGMENT = CANVAS_HTML + CANVAS_SCRIPT;

// The three scripts above all use a fragment *we* wrote, so it is well-behaved by construction: it fits
// under the height cap, uses only the five injected tokens, and does not repeat the title. A real agent
// guarantees none of that. These two exercise the cases the well-behaved one cannot reach.

// Tall enough to pass the 520px cap, so "scrolls inside the card" is actually observable rather than
// inferred from `max-height` being present in the stylesheet.
const CANVAS_TALL_ROWS = Array.from({ length: 26 }, (_, i) => {
  const status = i % 7 === 3 ? 'failed' : 'ok';

  return (
    `<tr><td>run-${String(2081 - i).padStart(4, '0')}</td>` +
    `<td>0${2 + (i % 8)}:${String((i * 7) % 60).padStart(2, '0')}</td>` +
    `<td>${(1.1 + (i % 9) * 0.37).toFixed(2)} 分</td>` +
    `<td class="${status}">${status}</td></tr>`
  );
}).join('');

const CANVAS_TALL_HTML =
  '<style>' +
  '.rt { width: 100%; border-collapse: collapse; font-size: 12.5px; }' +
  '.rt caption { text-align: left; font-weight: 650; padding-bottom: 0.5rem; }' +
  '.rt th { text-align: left; color: var(--canvas-muted); font-weight: 500; padding: 0.3rem 0.5rem; }' +
  '.rt td { padding: 0.3rem 0.5rem; border-top: 1px solid var(--canvas-border); }' +
  '.rt td.failed { color: var(--canvas-accent); font-weight: 650; }' +
  '</style>' +
  '<table class="rt"><caption>最近 26 次排程執行</caption>' +
  '<thead><tr><th>run</th><th>開始</th><th>耗時</th><th>狀態</th></tr></thead>' +
  `<tbody>${CANVAS_TALL_ROWS}</tbody></table>`;

// Deliberately breaks three of the rules the spec warns about, all at once: it repeats the title the
// card chrome already shows (AC17's note to the backend), hardcodes colors instead of using the five
// tokens (so it ignores the product's theme), and leaves a `<div>` unclosed. None of these should
// damage the host — the fragment lives in its own document, so the blast radius is the card itself.
const CANVAS_ROGUE_HTML =
  '<style>' +
  '.rg { font-size: 13px; }' +
  '.rg h2 { font-size: 15px; margin: 0 0 0.5rem; }' +
  '.rg .box { padding: 0.6rem; border-radius: 0.4rem; background: #2b1046; border: 1px solid #ff3ea5; }' +
  '.rg .box b { color: #ff3ea5; }' +
  '</style>' +
  '<div class="rg">' +
  `<h2>${CANVAS_TITLE}</h2>` +
  '<div class="box"><b>硬寫色碼</b>：這一塊完全不用注入的 token，換主題不會跟著變。' +
  '<p>下面這個 div 故意不關，看 morph 會不會把卡片撐爛。</p>' +
  '<div>unclosed';

async function handleCanvasMock(res: ServerResponse, payload: ParsedPayload, customChannelId: string): Promise<void> {
  const header: CommonHeader = {
    requestId: randomUUID(),
    namespace: NAMESPACE,
    botProviderName: BOT_PROVIDER_NAME,
    customChannelId,
  };
  const replyTo = payload.customMessageId ?? '';
  const text = payload.text ?? '';
  const messageId = randomUUID();
  const replayOnly = text.includes('重播') || text.toLowerCase().includes('replay');
  const broken = text.includes('壞掉') || text.toLowerCase().includes('broken');
  const tall = text.includes('長') || text.toLowerCase().includes('tall');
  const rogue = text.includes('亂寫') || text.toLowerCase().includes('rogue');
  const fragment = tall
    ? CANVAS_TALL_HTML + CANVAS_SCRIPT
    : rogue
    ? CANVAS_ROGUE_HTML + CANVAS_SCRIPT
    : CANVAS_FRAGMENT;
  const title = tall ? '排程執行紀錄' : CANVAS_TITLE;
  // The opening frame (empty text) must not draw: otherwise every reload paints a canvas
  // nobody asked for, and the three scripts below can never be observed in isolation.
  const wantsCanvas = text.trim() !== '';

  const canvasFrame = (eventType: string, factKey: string, body: Record<string, unknown>): object => ({
    ...header,
    eventType,
    fact: {
      ...emptyFact(),
      [factKey]: {
        message: {
          messageId,
          replyToCustomMessageId: replyTo,
          payload: null,
          isDebug: false,
          idx: null,
          text: '',
          template: null,
          ...body,
        },
      },
    },
  });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  writeEvent(res, { ...header, eventType: 'asgard.run.init', fact: { ...emptyFact(), runInit: {} } });
  await sleep(40);

  if (!wantsCanvas) {
    const hello =
      '打「畫」看完整串流，「重播」看重新進房的樣子，「壞掉」看畫不出來時整張丟棄，' +
      '「長」看超過 520px 在卡內捲動，「亂寫」看 agent 不守規矩時會怎樣。';

    writeEvent(
      res,
      messageFrame(header, 'asgard.message.complete', randomUUID(), replyTo, hello, TEXT_TEMPLATE(hello)),
    );
    await sleep(60);
    writeEvent(res, { ...header, eventType: 'asgard.run.done', fact: { ...emptyFact(), runDone: {} } });
    res.end();

    return;
  }

  const intro = replayOnly
    ? '這是重新進房會看到的樣子：只有 complete，沒有任何 delta。'
    : '好，我把資料管線畫出來給你看。';

  writeEvent(res, messageFrame(header, 'asgard.message.complete', randomUUID(), replyTo, intro, TEXT_TEMPLATE(intro)));
  await sleep(80);

  if (!replayOnly) {
    writeEvent(res, canvasFrame('asgard.message.canvas.start', 'messageCanvasStart', {}));

    for (let i = 0; i < fragment.length; i += CANVAS_CHUNK) {
      await sleep(CANVAS_STEP_MS);
      writeEvent(
        res,
        canvasFrame('asgard.message.canvas.delta', 'messageCanvasDelta', {
          text: fragment.slice(i, i + CANVAS_CHUNK),
        }),
      );
    }

    await sleep(60);
  }

  if (broken) {
    // No template: the backend could not render it. The frame only closes the block the start opened,
    // so the client must discard the whole card rather than keep the partial markup (UC-053).
    writeEvent(res, canvasFrame('asgard.message.canvas.complete', 'messageCanvasComplete', {}));
  } else {
    writeEvent(
      res,
      canvasFrame('asgard.message.canvas.complete', 'messageCanvasComplete', {
        text: fragment,
        template: { type: 'CANVAS', title, canvas: { html: fragment } },
      }),
    );
  }

  await sleep(60);
  writeEvent(res, { ...header, eventType: 'asgard.run.done', fact: { ...emptyFact(), runDone: {} } });
  res.end();
}

// ---------------------------------------------------------------------------------------------------
// F-029 — QUESTION card demo. The backend turns the CLI's `AskUserQuestion` into an ordinary
// `asgard.message.complete` carrying a QUESTION template, and closes the tool call without waiting:
// the run is already over when the card renders. So this handler sends a card and ends the run — there
// is no pending state to model, and a submitted form arrives back here as a plain text message like
// any other. `text` also carries the prose fallback, which is what an SDK without the QUESTION case
// shows instead of an empty bubble.
//
// Scripts, keyed off what was sent:
//   「一題」  → a single single-select question (the smallest card)
//   「長」    → deliberately long question / option strings (layout must not be pushed open)
//   anything else → the two-question card from the spec (single-select + multi-select)
// A message that does not ask for a card gets a plain reply, which is how you resolve an earlier card
// by "typing something else" (UC-050).
// ---------------------------------------------------------------------------------------------------

// #448 — the `blobs` entry the backend snapshots on `asgard.message.user`: renderable attachment
// metadata, no URL (a presigned link expires and cannot live in a durable record). `fileName` is null
// when the upload carried no name.
interface MockMessageBlob {
  blobId: string;
  fileType: 'IMAGE' | 'DOCUMENT' | 'VIDEO' | 'AUDIO' | 'BINARY';
  fileName: string | null;
  size: number;
  mime: string;
}

interface MockQuestion {
  question: string;
  header: string;
  multiSelect: boolean;
  options: { label: string; description?: string }[];
}

// Mirrors the chat-kit prototype's fixture (`demo/DemoApp.tsx`). The questions and options are backend
// content — the agent writes them per conversation — so any sample would do, but matching the
// prototype's makes a side-by-side design comparison read as structure-vs-structure instead of leaving
// the reviewer wondering why the copy differs.
//
// One deliberate deviation: the punctuation is full-width (？，) where the prototype uses half-width.
// Half-width punctuation inside Traditional Chinese is a typesetting error, and this fixture lives in
// our repo where people will read it. Please don't "restore" it to match the prototype character for
// character.
const QUESTION_CARD: MockQuestion[] = [
  {
    question: '資料要放在哪一種儲存？',
    header: '資料儲存',
    multiSelect: false,
    options: [
      { label: 'PostgreSQL', description: '關聯式，交易與複雜查詢最穩，預設的安全選擇。' },
      { label: 'Redis', description: '記憶體型，讀寫極快但不適合當唯一事實來源。' },
      { label: '兩個都要', description: 'Postgres 存真相、Redis 當快取層。' },
    ],
  },
  {
    question: '第一版要先具備哪些能力？',
    header: '首版範圍',
    multiSelect: true,
    options: [
      { label: '使用者認證', description: '註冊 / 登入 / token 續期。' },
      { label: '背景任務', description: '排程與非同步佇列。' },
      { label: '檔案上傳', description: '物件儲存與簽章網址。' },
      { label: '可觀測性', description: 'structured log、metrics、trace。' },
    ],
  },
];

const QUESTION_CARD_SINGLE: MockQuestion[] = [QUESTION_CARD[0]];

const QUESTION_CARD_LONG: MockQuestion[] = [
  {
    question:
      '如果要同時支援行動 App、官網、LINE 官方帳號三個通路，而且每個通路的回購率、客單價與新客佔比都要能分開追蹤，你希望第一版先把哪一個通路的資料管線接起來？',
    header: '優先通路',
    multiSelect: false,
    options: [
      {
        label: '行動 App —— 目前回購率最高、事件埋點最完整，但需要等下一次送審才能補上缺的欄位',
        description: '好處是資料品質最好，壞處是任何 schema 變更都被 App 的發版節奏綁住，通常要等兩到三週。',
      },
      { label: '官網 —— 埋點最鬆散，但改起來當天就能上線' },
    ],
  },
];

/** The prose fallback the backend ships in `text` for clients that do not know this template. */
function questionPlainText(questions: MockQuestion[]): string {
  return questions
    .map(q =>
      [q.question, ...q.options.map(o => `- ${o.label}${o.description ? ` — ${o.description}` : ''}`)].join('\n'),
    )
    .join('\n\n');
}

const QUESTION_ACK = '好的，我把幾個選項整理成表單了 —— 你可以直接勾，也可以用自己的話回我。';

async function handleQuestionCardMock(
  res: ServerResponse,
  payload: ParsedPayload,
  customChannelId: string,
): Promise<void> {
  const header: CommonHeader = {
    requestId: randomUUID(),
    namespace: NAMESPACE,
    botProviderName: BOT_PROVIDER_NAME,
    customChannelId,
  };
  const replyTo = payload.customMessageId ?? '';
  const text = payload.text ?? '';
  const wantsCard =
    text.trim() !== '' &&
    (text.includes('問') || text.includes('一題') || text.includes('長') || text.toLowerCase().includes('ask'));

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  writeEvent(res, { ...header, eventType: 'asgard.run.init', fact: { ...emptyFact(), runInit: {} } });
  await sleep(40);

  if (!wantsCard) {
    // Plain reply — this is the path that resolves an earlier card by typing something else (UC-050).
    const reply =
      text.trim() === ''
        ? '哈囉，我可以幫你決定技術選型。打「問我」會給你一張表單，打「一題」給單題版，打「長」給極端長度版。'
        : '收到，我先照你說的做，不另外問了。';

    writeEvent(
      res,
      messageFrame(header, 'asgard.message.complete', randomUUID(), replyTo, reply, TEXT_TEMPLATE(reply)),
    );
    await sleep(60);
    writeEvent(res, { ...header, eventType: 'asgard.run.done', fact: { ...emptyFact(), runDone: {} } });
    res.end();

    return;
  }

  const questions = text.includes('一題')
    ? QUESTION_CARD_SINGLE
    : text.includes('長')
    ? QUESTION_CARD_LONG
    : QUESTION_CARD;

  // The agent's own words come first, then the card as a separate message — mirroring the backend,
  // where the card is published alongside the turn's closing remark.
  writeEvent(
    res,
    messageFrame(header, 'asgard.message.complete', randomUUID(), replyTo, QUESTION_ACK, TEXT_TEMPLATE(QUESTION_ACK)),
  );
  await sleep(120);

  const plain = questionPlainText(questions);

  writeEvent(
    res,
    messageFrame(header, 'asgard.message.complete', randomUUID(), replyTo, plain, {
      type: 'QUESTION',
      text: plain,
      questions,
    }),
  );

  // The run ends right here: nobody is waiting for an answer (that is the whole point of F-029).
  await sleep(60);
  writeEvent(res, { ...header, eventType: 'asgard.run.done', fact: { ...emptyFact(), runDone: {} } });
  res.end();
}

// ---------------------------------------------------------------------------------------------------
// F-028 — next-turn suggestion demo. The backend pushes `asgard.prompt_suggestion` after the reply and
// before the run terminal, at most once per run. Three scripts, keyed off what was sent:
//   「沉默」 → the run carries no suggestion at all (the common case — UC-048)
//   「兩則」 → two suggestions in one run, so the last-one-wins rule is visible
//   anything else → one suggestion, the happy path (UC-047)
// The event never appears in the GET rejoin handler: it is live-only, so a reload legitimately shows
// no suggestion at all.
// ---------------------------------------------------------------------------------------------------

const SUGGESTION_REPLY = '上週營收 1,284 萬，較前週成長 12%。成長主要來自行動 App 的回購，官網則持平。';

async function handlePromptSuggestionMock(
  res: ServerResponse,
  payload: ParsedPayload,
  customChannelId: string,
): Promise<void> {
  const header: CommonHeader = {
    requestId: randomUUID(),
    namespace: NAMESPACE,
    botProviderName: BOT_PROVIDER_NAME,
    customChannelId,
  };
  const replyTo = payload.customMessageId ?? '';
  const messageId = randomUUID();
  const text = payload.text ?? '';
  // The opening run (mount, empty text) carries no suggestion — there is no previous turn
  // to predict from, which is also what a reload looks like: the event is live-only and never replayed.
  const silent = text.trim() === '' || text.includes('沉默') || text.toLowerCase().includes('silent');
  const twice = text.includes('兩則') || text.toLowerCase().includes('twice');
  // The backend caps suggestions at ~100 characters, but the UI must survive a long one regardless:
  // truncate, never push the layout around.
  const long = text.includes('很長') || text.toLowerCase().includes('long');

  const suggestionFrame = (suggestion: string): object => ({
    ...header,
    eventType: 'asgard.prompt_suggestion',
    fact: { ...emptyFact(), promptSuggestion: { suggestion } },
  });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  writeEvent(res, { ...header, eventType: 'asgard.run.init', fact: { ...emptyFact(), runInit: {} } });
  await sleep(40);

  writeEvent(res, messageFrame(header, 'asgard.message.start', messageId, replyTo, '', TEXT_TEMPLATE('')));

  for (const chunk of chunkText(SUGGESTION_REPLY, 4)) {
    await sleep(30);
    writeEvent(res, messageFrame(header, 'asgard.message.delta', messageId, replyTo, chunk, null));
  }

  await sleep(60);
  writeEvent(
    res,
    messageFrame(
      header,
      'asgard.message.complete',
      messageId,
      replyTo,
      SUGGESTION_REPLY,
      TEXT_TEMPLATE(SUGGESTION_REPLY),
    ),
  );

  // After the reply, before the terminal — the window the real backend uses.
  if (!silent) {
    await sleep(200);

    if (long) {
      writeEvent(
        res,
        suggestionFrame(
          '把行動 App、官網、LINE 官方帳號三個通路的回購率、客單價與新客佔比一起拉出來，並且按週比較過去六週的走勢',
        ),
      );
    } else if (twice) {
      writeEvent(res, suggestionFrame('先看看官網為什麼持平'));
      await sleep(300);
      writeEvent(res, suggestionFrame('把行動 App 的回購拆成新客與舊客'));
    } else {
      writeEvent(res, suggestionFrame('那前一週的數字是多少？'));
    }
  }

  await sleep(60);
  writeEvent(res, { ...header, eventType: 'asgard.run.done', fact: { ...emptyFact(), runDone: {} } });
  res.end();
}

// ---------------------------------------------------------------------------------------------------
// F-003 — run-indicator demo. One connection, two messages with a deliberate gap between them and a
// complete→done tail. `isConnecting` stays true for the whole run, so the seam indicator must stay lit
// continuously — no flicker per message, no disappearance in the gap (where the old placeholder blanked).
// ---------------------------------------------------------------------------------------------------

async function handleRunIndicatorMock(res: ServerResponse, payload: ParsedPayload): Promise<void> {
  const header: CommonHeader = {
    requestId: randomUUID(),
    namespace: NAMESPACE,
    botProviderName: BOT_PROVIDER_NAME,
    customChannelId: 'run-indicator-demo',
  };
  const replyTo = payload.customMessageId ?? '';
  const msgA = randomUUID();
  const msgB = randomUUID();
  const msgC = randomUUID();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  writeEvent(res, { ...header, eventType: 'asgard.run.init', fact: { ...emptyFact(), runInit: {} } });
  await sleep(40);

  const streamMessage = async (id: string, chunks: string[]): Promise<void> => {
    writeEvent(res, messageFrame(header, 'asgard.message.start', id, replyTo, '', TEXT_TEMPLATE('')));
    for (const chunk of chunks) {
      await sleep(200);
      writeEvent(res, messageFrame(header, 'asgard.message.delta', id, replyTo, chunk, null));
    }

    const full = chunks.join('');
    await sleep(120);
    writeEvent(res, messageFrame(header, 'asgard.message.complete', id, replyTo, full, TEXT_TEMPLATE(full)));
  };

  // A long, three-message run (~14s) so the seam indicator can be watched staying lit the whole time.
  // Message A.
  await streamMessage(msgA, [
    '先回覆第一段。',
    '這則訊息串流完成後，',
    '會有一段明顯的等待空檔，',
    '你可以盯著交界的進度線 —— ',
    '它不該在這裡消失。',
  ]);

  // Inter-message gap — no events for ~2.6s. The old per-message placeholder used to disappear here;
  // the seam indicator (bound to the connection) must stay lit.
  await sleep(2600);

  // Message B.
  await streamMessage(msgB, [
    '接著送出第二段回覆。',
    '整段 run 期間，',
    '交界的進度線都持續掃動，',
    '跨訊息、跨空檔都不閃爍。',
  ]);

  // Second gap.
  await sleep(2600);

  // Message C.
  await streamMessage(msgC, ['最後再補一段。', 'complete 之後連線還會保持一下，', '進度線要續亮到 run.done 才熄。']);

  // Complete→done tail — the connection lingers after the last message.complete (R4).
  await sleep(2200);

  writeEvent(res, { ...header, eventType: 'asgard.run.done', fact: { ...emptyFact(), runDone: {} } });
  res.end();
}

function sandboxFact(kind: 'launch' | 'ready'): Record<string, unknown> {
  const factKey = kind === 'launch' ? 'sandboxLaunch' : 'sandboxReady';

  return { ...emptyFact(), [factKey]: { sandboxName: 'sbx-demo-1', blueprintName: 'python-3.12' } };
}

// F-018 sandbox launch HUD demo. `launch` → gap → `ready` wrapped around a normal message run. A "warm"
// send (text contains 熱 / warm) reaches ready in ~300ms so the HUD never crosses the 1s threshold and
// stays silent; any other ("cold") send holds launch ~2.6s so the HUD floats in, then rings out on ready.
// Reused (BUG-006) by the /join-init route's restore/init scenarios — `customChannelId` is a parameter so
// the emitted frames carry whichever channel actually made the request.
async function handleSandboxHudMock(
  res: ServerResponse,
  payload: ParsedPayload,
  customChannelId: string,
): Promise<void> {
  const header: CommonHeader = {
    requestId: randomUUID(),
    namespace: NAMESPACE,
    botProviderName: BOT_PROVIDER_NAME,
    customChannelId,
  };
  const replyTo = payload.customMessageId ?? '';
  const text = payload.text ?? '';
  const warm = text.includes('熱') || text.toLowerCase().includes('warm');
  const msgId = randomUUID();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  writeEvent(res, { ...header, eventType: 'asgard.run.init', fact: { ...emptyFact(), runInit: {} } });
  await sleep(40);

  // Sandbox starts provisioning.
  writeEvent(res, { ...header, eventType: 'asgard.sandbox.launch', fact: sandboxFact('launch') });

  // Warm: ready before the 1s threshold (HUD stays silent). Cold: held well past it (HUD shows).
  await sleep(warm ? 300 : 2600);
  writeEvent(res, { ...header, eventType: 'asgard.sandbox.ready', fact: sandboxFact('ready') });

  // A short answer once the sandbox is up, so there is chat content and the run seam indicator lights
  // alongside (or independently of) the HUD.
  const chunks = warm
    ? ['熱啟動：', 'sandbox 已就緒，', 'HUD 全程靜音。']
    : ['冷啟動：', 'sandbox 花了點時間開機，', '右下角浮出啟動中 HUD，', 'ready 後播收尾拍再淡出。'];
  writeEvent(res, messageFrame(header, 'asgard.message.start', msgId, replyTo, '', TEXT_TEMPLATE('')));
  for (const chunk of chunks) {
    await sleep(200);
    writeEvent(res, messageFrame(header, 'asgard.message.delta', msgId, replyTo, chunk, null));
  }

  const full = chunks.join('');
  await sleep(120);
  writeEvent(res, messageFrame(header, 'asgard.message.complete', msgId, replyTo, full, TEXT_TEMPLATE(full)));

  await sleep(300);
  writeEvent(res, { ...header, eventType: 'asgard.run.done', fact: { ...emptyFact(), runDone: {} } });
  res.end();
}

// F-021 AC4 — Nudge wake. An invisible turn: emit run.init → sandbox.launch → (gap) → sandbox.ready →
// run.done, with NO message frames (the empty text must not surface a bubble). The launch frame triggers
// the SDK's metadata refetch; `nudgedChannels` makes that refetch report the now-live sandbox.
async function handleNudgeMock(res: ServerResponse, customChannelId: string): Promise<void> {
  nudgedChannels.add(customChannelId);
  const header: CommonHeader = {
    requestId: randomUUID(),
    namespace: NAMESPACE,
    botProviderName: BOT_PROVIDER_NAME,
    customChannelId,
  };

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  writeEvent(res, { ...header, eventType: 'asgard.run.init', fact: { ...emptyFact(), runInit: {} } });
  await sleep(300);
  writeEvent(res, {
    ...header,
    eventType: 'asgard.sandbox.launch',
    fact: { ...emptyFact(), sandboxLaunch: { sandboxName: 'sbx-nudged', blueprintName: 'demo-workspace' } },
  });
  await sleep(1400);
  writeEvent(res, {
    ...header,
    eventType: 'asgard.sandbox.ready',
    fact: { ...emptyFact(), sandboxReady: { sandboxName: 'sbx-nudged', blueprintName: 'demo-workspace' } },
  });
  await sleep(200);
  writeEvent(res, { ...header, eventType: 'asgard.run.done', fact: { ...emptyFact(), runDone: {} } });
  res.end();
}

// ---------------------------------------------------------------------------------------------------
// F-023 — stop-generation demo. This mock's whole point is that suspending and stopping are two
// separate moments: `POST /message/suspend` only records that a stop was asked for, and the run keeps
// streaming until it notices, then winds down and emits its terminal event. Nothing about that terminal
// is special — it is the same `run.done` a normal run ends with.
//
// Three channels drive the three branches:
//   stop-generation-demo          suspend is honoured → the run winds down shortly after
//   stop-generation-fail-demo     suspend answers 500 → the SDK must roll out of `stopping` (AC4)
//   stop-generation-timeout-demo  a plain suspend is IGNORED; only `force=true` ends the run (AC7)
// ---------------------------------------------------------------------------------------------------

const suspendRequests = new Map<string, { suspended: boolean; force: boolean }>();

// ---------------------------------------------------------------------------------------------------
// F-032 — `DELETE /channel?custom_channel_id=…` plus the scripted channels the /delete-channel route
// drives. What the route has to make visible is that the delete really happened: the mock therefore
// keeps a per-channel server-side transcript, and every reply reads it back. A reset that only cleared
// the browser would show an empty thread too — the give-away is the turn counter carrying on.
// ---------------------------------------------------------------------------------------------------

interface MockChannelState {
  /** Turns the mock believes this channel has seen since it last came into existence. */
  turns: string[];
  /** How many times this id has been deleted — proof the DELETE reached the server. */
  deletes: number;
}

const deleteDemoChannels = new Map<string, MockChannelState>();

function channelState(customChannelId: string): MockChannelState {
  const existing = deleteDemoChannels.get(customChannelId);

  if (existing) return existing;

  const fresh: MockChannelState = { turns: [], deletes: 0 };
  deleteDemoChannels.set(customChannelId, fresh);

  return fresh;
}

/** A slow teardown, standing in for the backend waiting on a live Sandbox pod (up to ~60s for real). */
const SLOW_TEARDOWN_MS = 6_000;

export async function handleMockChannelDelete(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'DELETE') {
    res.statusCode = 405;
    res.end();

    return;
  }

  const url = new URL(req.url ?? '', 'http://localhost');
  const customChannelId = url.searchParams.get('custom_channel_id');

  // The real endpoint answers 400 when the query parameter is missing (verified on dev).
  if (!customChannelId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'custom_channel_id query parameter is required', errorCode: 'INVALID_ARGUMENT' }));

    return;
  }

  // A teardown that fails. The SDK must NOT open a new conversation on top of it — the old one is still
  // there on the server, and a cleared screen would be a lie.
  if (customChannelId.startsWith('delete-channel-fail')) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'mock teardown failure' }));

    return;
  }

  if (customChannelId.startsWith('delete-channel-slow')) {
    await sleep(SLOW_TEARDOWN_MS);
  }

  const state = channelState(customChannelId);
  state.turns = [];
  state.deletes += 1;

  // 204, and only once the teardown is done — never a scheduled "we'll get to it". Deleting a channel
  // that never existed is a success too, which is why there is no 404 branch here.
  res.statusCode = 204;
  res.end();
}

async function handleDeleteChannelMock(
  res: ServerResponse,
  payload: ParsedPayload,
  customChannelId: string,
): Promise<void> {
  const header: CommonHeader = {
    requestId: randomUUID(),
    namespace: NAMESPACE,
    botProviderName: BOT_PROVIDER_NAME,
    customChannelId,
  };
  const replyTo = payload.customMessageId ?? '';
  const state = channelState(customChannelId);
  const text = (payload.text ?? '').trim();
  const attachments = payload.blobIds ?? [];

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  state.turns.push(text || '(開場)');

  const reply = isOpeningTurn(payload)
    ? `新對話已開始。這個 channel 被刪過 ${state.deletes} 次，目前的伺服器端對話有 ${state.turns.length} 輪 —— ` +
      '若上面看得到先前的訊息，那就是只清了畫面、沒清後端。' +
      (attachments.length > 0 ? `\n\n（本次開場帶了 ${attachments.length} 個附件：${attachments.join('、')}）` : '')
    : `收到「${text}」。伺服器端這個 channel 目前累積 ${state.turns.length} 輪、被刪過 ${state.deletes} 次。` +
      (attachments.length > 0
        ? `\n\n附件 ${attachments.length} 個都收到了：${attachments.join('、')} —— 這正是 RESET_CHANNEL 做不到的：` +
          '它會先刪掉 channel，剛上傳的 blob 跟著消失，訊息帶的 blobIds 於是查無此物、還不會報錯。'
        : '');

  const mid = randomUUID();
  writeEvent(res, { ...header, eventType: 'asgard.run.init', fact: { ...emptyFact(), runInit: {} } });
  await sleep(120);
  writeEvent(res, messageFrame(header, 'asgard.message.complete', mid, replyTo, reply, TEXT_TEMPLATE(reply)));
  writeEvent(res, { ...header, eventType: 'asgard.run.done', fact: { ...emptyFact(), runDone: {} } });
  res.end();
}

export async function handleMockSuspend(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end();

    return;
  }

  const url = new URL(req.url ?? '', 'http://localhost');
  const customChannelId = url.searchParams.get('custom_channel_id') ?? '';
  const force = url.searchParams.get('force') === 'true';

  // AC4 — a genuine failure (non-2xx that is not 404). The SDK must leave `stopping` and let the user
  // retry rather than stranding the UI.
  if (customChannelId === 'stop-generation-fail-demo') {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ message: 'mock suspend failure' }));

    return;
  }

  const previous = suspendRequests.get(customChannelId);
  suspendRequests.set(customChannelId, { suspended: true, force: force || Boolean(previous?.force) });

  // Relays answer either 204 or 200 + envelope; both mean accepted, and the SDK must not hardcode one.
  res.statusCode = 204;
  res.end();
}

const STOP_CHUNKS = [
  '這段回覆會刻意慢慢長，',
  '好讓你有時間按下停止。',
  '重點是：按下去之後，',
  '畫面不會立刻回到「等待輸入」——',
  '而是停在 stopping，',
  '因為後端只回報「已受理」，',
  '真正停下來要等串流上的終止事件。',
  '那個終止事件跟正常結束時是同一個，',
  '沒有新的事件型別。',
  '如果你看到這句，表示還沒按停止…',
];

async function handleStopGenerationMock(
  res: ServerResponse,
  payload: ParsedPayload,
  customChannelId: string,
): Promise<void> {
  // A new run starts with a clean slate — a stop asked for during the previous run must not end this one.
  suspendRequests.delete(customChannelId);

  const header: CommonHeader = {
    requestId: randomUUID(),
    namespace: NAMESPACE,
    botProviderName: BOT_PROVIDER_NAME,
    customChannelId,
  };
  const replyTo = payload.customMessageId ?? '';
  const messageId = randomUUID();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  writeEvent(res, { ...header, eventType: 'asgard.run.init', fact: { ...emptyFact(), runInit: {} } });
  await sleep(60);
  writeEvent(res, messageFrame(header, 'asgard.message.start', messageId, replyTo, '', TEXT_TEMPLATE('')));

  const emitted: string[] = [];

  // Long enough (~60s) that the run never ends on its own during a demo — so whatever ends it is
  // visibly the stop, not the run running out of things to say.
  for (let tick = 0; tick < 120; tick += 1) {
    await sleep(500);

    const state = suspendRequests.get(customChannelId);
    // The timeout channel plays an agent that ignores a polite stop: only `force` gets through (AC7).
    const honoured = state?.suspended && (customChannelId !== 'stop-generation-timeout-demo' || Boolean(state.force));

    if (honoured) {
      // The backend takes a moment to wind the run down — this gap is the `stopping` state.
      await sleep(1200);

      break;
    }

    const chunk = STOP_CHUNKS[tick % STOP_CHUNKS.length];
    emitted.push(chunk);
    writeEvent(res, messageFrame(header, 'asgard.message.delta', messageId, replyTo, chunk, null));
  }

  const full = emitted.join('');
  writeEvent(res, messageFrame(header, 'asgard.message.complete', messageId, replyTo, full, TEXT_TEMPLATE(full)));
  await sleep(80);
  writeEvent(res, { ...header, eventType: 'asgard.run.done', fact: { ...emptyFact(), runDone: {} } });
  res.end();
}

// ---------------------------------------------------------------------------------------------------
// F-002 — Last-Event-ID resume demo. A fresh run streams `id:`-tagged deltas then drops the socket
// mid-stream; @microsoft/fetch-event-source reconnects with `Last-Event-ID` and this handler resumes
// from that cursor (transparent — no gap, no dup). A `no-cursor` keyword fails before 200 so the SDK
// surfaces the error without re-POSTing it (UC-004).
// ---------------------------------------------------------------------------------------------------

const RESUME_CHUNKS = [
  '這則訊息會串到一半',
  '被伺服器切斷連線，',
  '接著 fetch-event-source ',
  '帶著 Last-Event-ID ',
  '自動重連，',
  '後端從 cursor 續傳、不重新派送，',
  '所以內容接續、',
  '不缺漏、不重複 —— ',
  '斷線對使用者透明。',
];

// Delta frame carrying a resume cursor (`id:` line written by writeCursorEvent).
function resumeDelta(header: CommonHeader, messageId: string, replyTo: string, text: string, idx: number): object {
  return {
    ...header,
    eventType: 'asgard.message.delta',
    fact: {
      ...emptyFact(),
      messageDelta: {
        message: {
          messageId,
          replyToCustomMessageId: replyTo,
          text,
          payload: null,
          isDebug: false,
          idx,
          template: null,
        },
      },
    },
  };
}

function writeCursorEvent(res: ServerResponse, event: object, id: string): void {
  res.write(`id: ${id}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

async function handleStreamResumeMock(
  req: IncomingMessage,
  res: ServerResponse,
  payload: ParsedPayload,
): Promise<void> {
  const text = payload.text ?? '';
  const replyTo = payload.customMessageId ?? '';
  const lastEventId = typeof req.headers['last-event-id'] === 'string' ? req.headers['last-event-id'] : undefined;

  // UC-004 — no cursor: fail before 200. With the RxJS retry(3) removed, this surfaces as HttpError and
  // is NOT re-POSTed (an empty-cursor POST would be re-dispatched by the backend as a duplicate run).
  if (!lastEventId && /no-cursor|fail/.test(text)) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('simulated pre-200 failure (UC-004): no cursor, not re-dispatched');

    return;
  }

  const header: CommonHeader = {
    requestId: randomUUID(),
    namespace: NAMESPACE,
    botProviderName: BOT_PROVIDER_NAME,
    customChannelId: 'stream-resume-demo',
  };
  // messageId derived from customMessageId: stable across a run + its reconnect (the library replays the
  // same POST body), but distinct per user click. The cursor is `${messageId}:${idx}`.
  const messageId = `resume-${replyTo || 'init'}`;
  const fullText = RESUME_CHUNKS.join('');
  const sseHeaders = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  };

  const complete = (): void => {
    writeEvent(res, {
      ...header,
      eventType: 'asgard.message.complete',
      fact: {
        ...emptyFact(),
        messageComplete: {
          message: {
            messageId,
            replyToCustomMessageId: replyTo,
            text: fullText,
            payload: null,
            isDebug: false,
            idx: null,
            template: { type: 'TEXT', text: fullText },
          },
        },
      },
    });
    writeEvent(res, { ...header, eventType: 'asgard.run.done', fact: { ...emptyFact(), runDone: {} } });
    res.end();
  };

  // UC-003 resume — the reconnect carries `Last-Event-ID: ${messageId}:${idx}`; continue from idx+1.
  if (lastEventId) {
    res.writeHead(200, sseHeaders);
    const resumeFrom = Number(lastEventId.slice(lastEventId.lastIndexOf(':') + 1)) + 1;
    for (let i = resumeFrom; i < RESUME_CHUNKS.length; i++) {
      await sleep(90);
      writeCursorEvent(res, resumeDelta(header, messageId, replyTo, RESUME_CHUNKS[i], i), `${messageId}:${i}`);
    }

    await sleep(40);
    complete();

    return;
  }

  // Fresh run — stream `id:`-tagged deltas. A `resume`/`drop` keyword kills the socket mid-stream to
  // force the native reconnect; otherwise the message just completes (baseline).
  res.writeHead(200, sseHeaders);
  writeEvent(res, { ...header, eventType: 'asgard.run.init', fact: { ...emptyFact(), runInit: {} } });
  writeEvent(res, {
    ...header,
    eventType: 'asgard.message.start',
    fact: {
      ...emptyFact(),
      messageStart: {
        message: {
          messageId,
          replyToCustomMessageId: replyTo,
          text: '',
          payload: null,
          isDebug: false,
          idx: null,
          template: { type: 'TEXT', text: '' },
        },
      },
    },
  });

  const shouldDrop = /resume|drop|斷線|續傳/.test(text);
  const dropAt = Math.floor(RESUME_CHUNKS.length / 2);
  for (let i = 0; i < RESUME_CHUNKS.length; i++) {
    await sleep(90);
    writeCursorEvent(res, resumeDelta(header, messageId, replyTo, RESUME_CHUNKS[i], i), `${messageId}:${i}`);

    if (shouldDrop && i === dropAt) {
      // Kill the socket mid-stream → the client reconnects with `Last-Event-ID: resume-msg:${dropAt}`,
      // hitting the resume branch above.
      res.destroy();

      return;
    }
  }

  await sleep(40);
  complete();
}

// ---------------------------------------------------------------------------------------------------
// F-014 — transcript cold-start rejoin. `GET /message/sse?custom_channel_id=…` replays the collapsed
// history: user turns as `message.user` (persist-only, echoing the client's customMessageId for dedup)
// interleaved with self-sufficient assistant `message.complete` frames. Each carries an `id:` cursor.
// ---------------------------------------------------------------------------------------------------

async function handleMockTranscriptRejoin(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '', 'http://localhost');
  const customChannelId = url.searchParams.get('custom_channel_id') ?? 'mock-channel';
  const header: CommonHeader = {
    requestId: randomUUID(),
    namespace: NAMESPACE,
    botProviderName: BOT_PROVIDER_NAME,
    customChannelId,
  };

  const userFrame = (messageId: string, text: string, customMessageId: string): object => ({
    ...header,
    eventType: 'asgard.message.user',
    fact: { ...emptyFact(), messageUser: { messageId, text, customMessageId, blobIds: [] } },
  });
  // #448 — the attachment half of a replayed user turn. `blobs` is the renderable metadata; `blobIds` is
  // what an older transcript row has on its own (no backfill), which is why the two are passed separately.
  const userAttachmentFrame = (
    messageId: string,
    text: string,
    blobIds: string[],
    blobs?: MockMessageBlob[],
  ): object => ({
    ...header,
    eventType: 'asgard.message.user',
    fact: {
      ...emptyFact(),
      messageUser: { messageId, text, customMessageId: `c-${messageId}`, blobIds, ...(blobs ? { blobs } : {}) },
    },
  });
  const botComplete = (messageId: string, text: string): object => ({
    ...header,
    eventType: 'asgard.message.complete',
    fact: {
      ...emptyFact(),
      messageComplete: {
        message: {
          messageId,
          replyToCustomMessageId: '',
          text,
          payload: null,
          isDebug: false,
          idx: null,
          template: { type: 'TEXT', text },
        },
      },
    },
  });

  const questionComplete = (messageId: string, questions: MockQuestion[]): object => ({
    ...header,
    eventType: 'asgard.message.complete',
    fact: {
      ...emptyFact(),
      messageComplete: {
        message: {
          messageId,
          replyToCustomMessageId: '',
          text: questionPlainText(questions),
          payload: null,
          isDebug: false,
          idx: null,
          template: { type: 'QUESTION', text: questionPlainText(questions), questions },
        },
      },
    },
  });

  // F-029 R11 — a replayed transcript with two cards: the first is overtaken by a later user message and
  // must come back collapsed, the second is last and must come back answerable. The replay carries no
  // answered-ness for either — that is the whole point of deriving it from order.
  if (customChannelId === 'question-template-rejoin-demo') {
    const replay: { event: object; id: string }[] = [
      { event: userFrame('u-r-1', '幫我決定技術選型', 'c-r-1'), id: 'seq:1' },
      { event: questionComplete('a-r-card-1', QUESTION_CARD), id: 'seq:2' },
      { event: userFrame('u-r-2', '先不管那些，幫我看一下部署流程', 'c-r-2'), id: 'seq:3' },
      { event: botComplete('a-r-2', '收到，我先照你說的做，不另外問了。'), id: 'seq:4' },
      { event: userFrame('u-r-3', '好，那再問我一次', 'c-r-3'), id: 'seq:5' },
      { event: questionComplete('a-r-card-2', QUESTION_CARD_SINGLE), id: 'seq:6' },
    ];

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });

    for (const frame of replay) {
      await sleep(60);
      writeCursorEvent(res, frame.event, frame.id);
    }

    await sleep(40);
    writeEvent(res, { ...header, eventType: 'asgard.run.done', fact: { ...emptyFact(), runDone: {} } });
    res.end();

    return;
  }

  // #448 — a transcript whose user turns carried attachments. Three shapes, in the order that matters:
  // a pure-attachment turn (empty text — the one that used to vanish entirely), an attachment+text turn,
  // and a legacy row with ids and no metadata, which is what every pre-fix conversation looks like
  // forever. Matched by prefix so the route can mount two shells on their own channel ids.
  if (customChannelId.startsWith('attachment-rejoin-demo')) {
    const replay: { event: object; id: string }[] = [
      {
        event: userAttachmentFrame(
          'u-att-1',
          '',
          ['2091078155488989184', '2091078159192559616'],
          [
            {
              blobId: '2091078155488989184',
              fileType: 'DOCUMENT',
              fileName: 'quarterly.txt',
              size: 39,
              mime: 'text/plain',
            },
            { blobId: '2091078159192559616', fileType: 'IMAGE', fileName: null, size: 70, mime: 'image/png' },
          ],
        ),
        id: 'seq:1',
      },
      { event: botComplete('a-att-1', '收到，我看到一份 quarterly.txt 和一張圖片。'), id: 'seq:2' },
      {
        event: userAttachmentFrame(
          'u-att-2',
          '這張圖也一起看',
          ['2091078160000000000'],
          [
            {
              blobId: '2091078160000000000',
              fileType: 'IMAGE',
              fileName: 'revenue-chart.png',
              size: 20480,
              mime: 'image/png',
            },
          ],
        ),
        id: 'seq:3',
      },
      { event: botComplete('a-att-2', '兩者都納入了。'), id: 'seq:4' },
      { event: userAttachmentFrame('u-att-3', '', ['2087428865445072896']), id: 'seq:5' },
      { event: botComplete('a-att-3', '（這一則是舊 transcript 列：只有 blob id，沒有 metadata。）'), id: 'seq:6' },
    ];

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });

    for (const frame of replay) {
      await sleep(60);
      writeCursorEvent(res, frame.event, frame.id);
    }

    await sleep(40);
    writeEvent(res, { ...header, eventType: 'asgard.run.done', fact: { ...emptyFact(), runDone: {} } });
    res.end();

    return;
  }

  // Collapsed history: two turns. The first user turn echoes customMessageId `c-opt-1` so it de-dups
  // against the demo's optimistic bubble; the second (`c-2`) has no optimistic match.
  const transcript: { event: object; id: string }[] = [
    { event: userFrame('u-backend-1', '（後端歷史）我剛剛問的問題', 'c-opt-1'), id: 'seq:1' },
    { event: botComplete('a-backend-1', '（後端歷史）這是助理對第一題的回答。'), id: 'seq:2' },
    { event: userFrame('u-backend-2', '（後端歷史）第二個問題', 'c-2'), id: 'seq:3' },
    { event: botComplete('a-backend-2', '（後端歷史）這是助理對第二題的回答。'), id: 'seq:4' },
  ];

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  for (const frame of transcript) {
    await sleep(120);
    writeCursorEvent(res, frame.event, frame.id);
  }

  await sleep(40);
  writeEvent(res, { ...header, eventType: 'asgard.run.done', fact: { ...emptyFact(), runDone: {} } });
  res.end();
}

// ---------------------------------------------------------------------------------------------------
// F-015 — channel metadata gate. `GET /channel/metadata?custom_channel_id=…` is the join-init existence
// check: 200 (+ title/runState) = exists → restore; 404 = not exists → per autoResetChannel; other = error.
// Default is 404 so every other demo channel keeps its pre-F-015 mount behavior (404 → open with NONE).
// The /join-init route uses the scoped ids below to drive the three branches (+ the error fallback).
// ---------------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------------
// Blob upload. `client.uploadFile()` posts one multipart file per request to `${base}/blob` and reads
// back the `BlobData` the composer needs to turn a pending attachment into a `blobId`. Without this the
// live send path cannot complete in the demo at all, so the "what the sender sees" half of #448 — image
// previews and document cards, drawn from fields the consumer supplies — was not checkable here.
// ---------------------------------------------------------------------------------------------------

function rawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise(resolve => {
    const chunks: Buffer[] = [];

    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(Buffer.alloc(0)));
  });
}

/** Enough multipart parsing for a mock: the file part's declared name, type, and byte length. */
function describeUploadedFile(body: Buffer): { fileName: string | null; mime: string; size: number } {
  const head = body.subarray(0, 2048).toString('latin1');
  const fileName = /filename="([^"]*)"/.exec(head)?.[1] ?? null;
  const mime = /Content-Type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim() ?? 'application/octet-stream';

  return { fileName: fileName || null, mime, size: body.length };
}

function fileTypeOf(mime: string): MockMessageBlob['fileType'] {
  if (mime.startsWith('image/')) return 'IMAGE';

  if (mime.startsWith('video/')) return 'VIDEO';

  if (mime.startsWith('audio/')) return 'AUDIO';

  if (mime.startsWith('text/') || mime.startsWith('application/')) return 'DOCUMENT';

  return 'BINARY';
}

export async function handleMockBlobUpload(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await rawBody(req);
  const { fileName, mime, size } = describeUploadedFile(body);
  const blob: MockMessageBlob & { channelId: string } = {
    channelId: 'mock-channel',
    blobId: randomUUID(),
    fileType: fileTypeOf(mime),
    fileName,
    size,
    mime,
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ isSuccess: true, data: [blob], error: null, errorCode: null }));
}

export async function handleMockChannelMetadata(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '', 'http://localhost');
  const customChannelId = url.searchParams.get('custom_channel_id') ?? '';

  // Non-404 error → the SDK must fall back safely (no wipe, no hang), never treat it as "not exists".
  if (customChannelId === 'join-error-demo') {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('simulated metadata failure (F-015 R6): indeterminate, must not reset');

    return;
  }

  // F-021 — the File Explorer demo channel: exists + advertises one live sandbox so the built-in aside's
  // dropdown (driven by launchedSandboxes$) has something to show.
  if (customChannelId === 'file-explorer-demo') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        data: {
          title: 'File Explorer 展示',
          runState: 'IDLE',
          launchedSandboxes: [
            {
              sandboxName: 'sbx-demo',
              sandboxBlueprintName: 'demo-workspace',
              workingDirectory: '/home/user/project',
              editorServerEnabled: true,
              browserEnabled: false,
            },
          ],
        },
      }),
    );

    return;
  }

  // F-021 AC4 — the Nudge empty-state channel: no live sandbox until nudged, then one appears (so the
  // built-in aside starts on the empty state + Nudge button, and the dropdown refills after the wake).
  if (customChannelId === 'file-explorer-empty-demo') {
    const launchedSandboxes = nudgedChannels.has(customChannelId)
      ? [
          {
            sandboxName: 'sbx-nudged',
            sandboxBlueprintName: 'demo-workspace',
            workingDirectory: '/home/user/project',
            editorServerEnabled: true,
            browserEnabled: false,
          },
        ]
      : [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: { title: 'File Explorer（Nudge 空狀態）', runState: 'IDLE', launchedSandboxes } }));

    return;
  }

  // F-029 R11 — the rejoin channel exists, so mounting takes the restore path and GET /message/sse
  // replays a transcript that already contains QUESTION cards. Nothing about their answered-ness is
  // stored anywhere; the collapse must come back purely from the replayed message order.
  if (customChannelId === 'question-template-rejoin-demo') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: { title: '技術選型（重新進房）', runState: 'IDLE' } }));

    return;
  }

  // #448 — the attachment replay channels exist, so mounting takes the restore path and GET /message/sse
  // replays turns that carried attachments.
  if (customChannelId.startsWith('attachment-rejoin-demo')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: { title: '帶附件的歷史對話', runState: 'IDLE' } }));

    return;
  }

  // Exists → restore. The title seeds the channel-title bar (F-016); GET /message/sse replays history.
  if (customChannelId.startsWith('join-existing')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        data: { title: '庫存分析（已存在的頻道）', runState: 'IDLE', lastActivityAt: '2026-07-15T00:00:00Z' },
      }),
    );

    return;
  }

  // Default: channel does not exist.
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('channel not found');
}

// ---------------------------------------------------------------------------------------------------
// F-021 — in-memory sandbox fs mock for the /file-explorer demo. Cycle 1: GET fs/list (JSON), GET fs/file
// (octet-stream + X-Total-Bytes/X-Truncated), PUT fs/file (multipart → { data: { bytesWritten } }).
// Cycle 2: GET fs/stat, POST fs/mkdir, DELETE fs/item (file), DELETE fs/all (dir, recursive),
// POST fs/copy?src=&dst=, POST fs/move?src=&dst=, GET fs/watch (SSE `event: change`). The tree is now
// *mutable* so mutations reflect on re-list — reset to the seed on server restart.
// ---------------------------------------------------------------------------------------------------

interface FsDirEntry {
  name: string;
  isDir: boolean;
  sizeBytes: number;
}

const FS_DIRS: Record<string, FsDirEntry[]> = {
  '/home/user/project': [
    { name: 'src', isDir: true, sizeBytes: 0 },
    { name: 'README.md', isDir: false, sizeBytes: 92 },
    { name: 'notes.txt', isDir: false, sizeBytes: 34 },
  ],
  '/home/user/project/src': [
    { name: 'index.ts', isDir: false, sizeBytes: 48 },
    { name: 'app.tsx', isDir: false, sizeBytes: 60 },
  ],
};

const FS_FILES: Record<string, string> = {
  '/home/user/project/README.md':
    '# Demo Workspace\n\n這是 **File Explorer** 展示用的 mock 檔案。\n\n- 點資料夾展開\n- 點檔案預覽\n- 切換編輯後打字會存檔',
  '/home/user/project/notes.txt': 'plain text note — 切到編輯試打字。',
  '/home/user/project/src/index.ts': 'export const greet = (n: string) => `hi ${n}`;\n',
  '/home/user/project/src/app.tsx': 'export function App() {\n  return <div>hello</div>;\n}\n',
};

function fsParentOf(path: string): string {
  const norm = path.replace(/\/+$/, '');
  const i = norm.lastIndexOf('/');

  return i > 0 ? norm.slice(0, i) : '/';
}

function fsBaseOf(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path;
}

function fsAddEntry(dir: string, name: string, isDir: boolean, sizeBytes: number): void {
  const list = FS_DIRS[dir] ?? (FS_DIRS[dir] = []);
  const existing = list.find(e => e.name === name);
  if (existing) {
    existing.isDir = isDir;
    existing.sizeBytes = sizeBytes;
  } else {
    list.push({ name, isDir, sizeBytes });
  }
}

function fsRemoveEntry(dir: string, name: string): void {
  const list = FS_DIRS[dir];
  if (list) FS_DIRS[dir] = list.filter(e => e.name !== name);
}

function fsIsDir(path: string): boolean {
  return path in FS_DIRS;
}

/** Recursively copy a file or dir subtree (prefix key replace). Registers the dst entry in its parent. */
function fsCopyTree(src: string, dst: string): void {
  if (src in FS_FILES) {
    FS_FILES[dst] = FS_FILES[src];
    fsAddEntry(fsParentOf(dst), fsBaseOf(dst), false, Buffer.byteLength(FS_FILES[dst], 'utf-8'));

    return;
  }

  for (const key of Object.keys(FS_DIRS)) {
    if (key === src || key.startsWith(`${src}/`))
      FS_DIRS[dst + key.slice(src.length)] = FS_DIRS[key].map(e => ({ ...e }));
  }

  for (const key of Object.keys(FS_FILES)) {
    if (key.startsWith(`${src}/`)) FS_FILES[dst + key.slice(src.length)] = FS_FILES[key];
  }

  fsAddEntry(fsParentOf(dst), fsBaseOf(dst), true, 0);
}

function fsRemoveTree(path: string): void {
  delete FS_FILES[path];
  for (const key of Object.keys(FS_FILES)) if (key.startsWith(`${path}/`)) delete FS_FILES[key];
  for (const key of Object.keys(FS_DIRS)) if (key === path || key.startsWith(`${path}/`)) delete FS_DIRS[key];
  fsRemoveEntry(fsParentOf(path), fsBaseOf(path));
}

/**
 * Open `fs/watch` streams, keyed by the watched path. Real `fsnotify` would also report a parent
 * directory's children; the demo only ever watches a single open file, so exact-path is enough.
 */
const FS_WATCHERS = new Map<string, Set<ServerResponse>>();

function fsNotify(path: string, op: 'CREATE' | 'WRITE' | 'REMOVE'): void {
  const payload = JSON.stringify({ op, path, mtimeUnix: Math.floor(Date.now() / 1000) });
  FS_WATCHERS.get(path)?.forEach(res => res.write(`event: change\ndata: ${payload}\n\n`));
}

/**
 * Pull the file part out of a `multipart/form-data` body. The real edge server parses this properly; the
 * demo just needs the bytes between the part headers and the closing boundary so a save round-trips.
 */
function fsMultipartContent(body: Buffer): string {
  const text = body.toString('utf-8');
  const start = text.indexOf('\r\n\r\n');
  if (start === -1) return '';

  const end = text.lastIndexOf('\r\n--');

  return text.slice(start + 4, end === -1 ? undefined : end);
}

function fsJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data }));
}

export async function handleMockSandboxFs(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '', 'http://localhost');
  const path = url.searchParams.get('path') ?? '';
  const op = url.pathname.split('/fs/')[1] ?? '';

  if (op === 'watch') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const watchers = FS_WATCHERS.get(path) ?? new Set<ServerResponse>();
    watchers.add(res);
    FS_WATCHERS.set(path, watchers);
    req.on('close', () => {
      watchers.delete(res);
      if (watchers.size === 0) FS_WATCHERS.delete(path);
    });

    return;
  }

  if (op === 'list') {
    const entries = (FS_DIRS[path] ?? []).map(e => ({
      name: e.name,
      isDir: e.isDir,
      sizeBytes: e.sizeBytes,
      mtimeUnix: 1_700_000_000,
      mode: e.isDir ? 493 : 420,
    }));
    fsJson(res, { entries, truncated: false });

    return;
  }

  if (op === 'stat') {
    const isDir = fsIsDir(path);
    const exists = isDir || path in FS_FILES;
    fsJson(res, {
      exists,
      isDir,
      sizeBytes: isDir ? 0 : Buffer.byteLength(FS_FILES[path] ?? '', 'utf-8'),
      mtimeUnix: 1_700_000_000,
      mode: isDir ? 493 : 420,
    });

    return;
  }

  if (op === 'mkdir') {
    if (!(path in FS_DIRS)) FS_DIRS[path] = [];

    fsAddEntry(fsParentOf(path), fsBaseOf(path), true, 0);
    fsNotify(path, 'CREATE');
    fsJson(res, null);

    return;
  }

  if (op === 'item' || op === 'all') {
    fsRemoveTree(path);
    fsNotify(path, 'REMOVE');
    fsJson(res, null);

    return;
  }

  if (op === 'copy' || op === 'move') {
    const src = url.searchParams.get('src') ?? '';
    const dst = url.searchParams.get('dst') ?? '';
    const bytesCopied = src in FS_FILES ? Buffer.byteLength(FS_FILES[src], 'utf-8') : 0;
    fsCopyTree(src, dst);
    if (op === 'move') fsRemoveTree(src);

    fsNotify(dst, 'CREATE');
    if (op === 'move') fsNotify(src, 'REMOVE');

    fsJson(res, op === 'copy' ? { bytesCopied } : null);

    return;
  }

  // fs/file
  if (req.method === 'PUT') {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c));
    await new Promise<void>(resolve => req.on('end', () => resolve()));

    const body = Buffer.concat(chunks);
    const existed = path in FS_FILES;
    FS_FILES[path] = fsMultipartContent(body);

    fsAddEntry(fsParentOf(path), fsBaseOf(path), false, Buffer.byteLength(FS_FILES[path], 'utf-8'));
    fsNotify(path, existed ? 'WRITE' : 'CREATE');
    fsJson(res, { bytesWritten: body.length });

    return;
  }

  const content = FS_FILES[path] ?? '';
  const buf = Buffer.from(content, 'utf-8');
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'X-Total-Bytes': String(buf.length),
    'X-Truncated': 'false',
  });
  res.end(buf);
}

// ---------------------------------------------------------------------------------------------------
// All-features showcase — one live run through the real <Chatbot> that exercises every roadmap feature.
// Frame builders for the tool-call / subagent / title events (the other demos use preview initMessages;
// this one streams them so the docked Task/Subagent panels, live title, and run indicator all light up).
// ---------------------------------------------------------------------------------------------------

interface ToolCallShape {
  toolsetName: string;
  toolName: string;
  parameter: Record<string, unknown>;
  reason?: string;
}

function toolStartFrame(
  header: CommonHeader,
  processId: string,
  callSeq: number,
  toolCall: ToolCallShape,
  ids?: { toolUseId?: string; parentToolUseId?: string },
): object {
  return {
    ...header,
    eventType: 'asgard.tool_call.start',
    fact: { ...emptyFact(), toolCallStart: { processId, callSeq, ...ids, toolCall } },
  };
}

function toolCompleteFrame(
  header: CommonHeader,
  processId: string,
  callSeq: number,
  toolCall: ToolCallShape,
  result: Record<string, unknown>,
  opts?: {
    isError?: boolean;
    sidecar?: Record<string, unknown>;
    ids?: { toolUseId?: string; parentToolUseId?: string };
  },
): object {
  return {
    ...header,
    eventType: 'asgard.tool_call.complete',
    fact: {
      ...emptyFact(),
      toolCallComplete: {
        processId,
        callSeq,
        ...opts?.ids,
        toolCall,
        toolCallResult: result,
        ...(opts?.isError != null ? { isError: opts.isError } : {}),
        ...(opts?.sidecar ? { toolUseResultSidecar: opts.sidecar } : {}),
      },
    },
  };
}

function subagentStartFrame(header: CommonHeader, data: Record<string, unknown>): object {
  return { ...header, eventType: 'asgard.subagent.start', fact: { ...emptyFact(), subagentStart: data } };
}

function subagentCompleteFrame(header: CommonHeader, data: Record<string, unknown>): object {
  return { ...header, eventType: 'asgard.subagent.complete', fact: { ...emptyFact(), subagentComplete: data } };
}

// BUG-001 — a subagent's own message / thinking frames carry the spawning Agent call's `toolUseId` as
// `parentToolUseId`. They must NOT surface in the main chat view. The showcase streams them so the fix is
// exercised live: without the guard the internal coordination text (and the system-prompt tail below) leak.
function subagentThinkingCompleteFrame(header: CommonHeader, parentToolUseId: string, text: string): object {
  return {
    ...header,
    eventType: 'asgard.message.thinking.complete',
    fact: {
      ...emptyFact(),
      messageThinkingComplete: {
        message: {
          messageId: randomUUID(),
          parentToolUseId,
          replyToCustomMessageId: '',
          text,
          payload: null,
          isDebug: false,
          idx: null,
          template: null,
        },
      },
    },
  };
}

function subagentMessageCompleteFrame(header: CommonHeader, parentToolUseId: string, text: string): object {
  return {
    ...header,
    eventType: 'asgard.message.complete',
    fact: {
      ...emptyFact(),
      messageComplete: {
        message: {
          messageId: randomUUID(),
          parentToolUseId,
          replyToCustomMessageId: '',
          text,
          payload: null,
          isDebug: false,
          idx: null,
          template: TEXT_TEMPLATE(text),
        },
      },
    },
  };
}

function titleUpdateFrame(header: CommonHeader, title: string | null): object {
  return {
    ...header,
    eventType: 'asgard.channel.title.update',
    fact: { ...emptyFact(), channelTitleUpdate: { title } },
  };
}

const SHOWCASE_THINKING = [
  '先確認「上週」的日期區間（系統時區週一到週日），',
  '從 orders 表依通路彙總訂單數與金額、排除測試與取消單，',
  '再看 Bolzen 法蘭螺栓急單的用料需求與 SWRCH35K φ7.0 線材庫存，',
  '算出短缺量並評估標準前置 30 天是否趕得上 7/16 出貨。',
];

const SHOWCASE_ANSWER =
  '## 分析結果\n\n上週通路訂單以**官網**居冠（1,280 筆）。Bolzen 急單需 SWRCH35K φ7.0 線材 **16,000 kg**，' +
  '可用庫存 9,500 kg → **短缺 6,500 kg**，標準前置 30 天趕不上 7/16。已改查替代料號 **SWRCH38K**（前置 15 天），' +
  '報表 `report.html` 已建立、`plan.md` 標題已更新。';

async function handleAllFeaturesMock(res: ServerResponse, payload: ParsedPayload): Promise<void> {
  const header: CommonHeader = {
    requestId: randomUUID(),
    namespace: NAMESPACE,
    botProviderName: BOT_PROVIDER_NAME,
    customChannelId: 'all-features-demo',
  };
  const replyTo = payload.customMessageId ?? '';

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  // A later plain send just gets a short reply so the page stays interactive after the show.
  if (!isOpeningTurn(payload)) {
    const mid = randomUUID();
    writeEvent(res, { ...header, eventType: 'asgard.run.init', fact: { ...emptyFact(), runInit: {} } });
    const ack = '這是「全功能展示」頁 —— 重整頁面即可重看整段串流（進房 RESET 會重播全部功能）。';
    await sleep(120);
    writeEvent(res, messageFrame(header, 'asgard.message.complete', mid, replyTo, ack, TEXT_TEMPLATE(ack)));
    writeEvent(res, { ...header, eventType: 'asgard.run.done', fact: { ...emptyFact(), runDone: {} } });
    res.end();

    return;
  }

  // One run, one processId — the shape every real backend emits. The thread tool-call groups are keyed
  // by their leading tool call's messageId (`${processId}-${callSeq}`, see chatbot-body), so groups
  // split apart by interleaved text/thinking stay distinct without faking separate processIds.
  const proc = 'showcase';
  let seq = 0;
  const next = (): number => seq++;
  const emit = async (frame: object, ms = 220): Promise<void> => {
    writeEvent(res, frame);
    await sleep(ms);
  };

  // run.init → seam indicator lights, input disabled (F-003).
  await emit({ ...header, eventType: 'asgard.run.init', fact: { ...emptyFact(), runInit: {} } });

  // sandbox cold-start (F-018): launch now; ready arrives after the thinking block (well past the 1s
  // threshold), so the Launch HUD floats into the chat view's bottom-right during the intro then rings
  // out — independent of, and coexisting with, the run seam indicator.
  await emit({ ...header, eventType: 'asgard.sandbox.launch', fact: sandboxFact('launch') }, 200);

  // channel title seed via live update (F-016 store → F-017 title bar).
  await emit(titleUpdateFrame(header, 'Bolzen 法蘭螺栓急單備料查詢'), 200);

  // thinking: streams then collapses to "Thought for a moment" (F-001).
  const think = randomUUID();
  await emit(thinkingFrame(header, 'asgard.message.thinking.start', think, replyTo, ''), 400);
  for (const clause of SHOWCASE_THINKING) {
    for (const piece of chunkText(clause, 4)) {
      await emit(thinkingFrame(header, 'asgard.message.thinking.delta', think, replyTo, piece), 55);
    }
  }

  await emit(
    thinkingFrame(header, 'asgard.message.thinking.complete', think, replyTo, SHOWCASE_THINKING.join('')),
    160,
  );

  // sandbox ready (F-018) → HUD plays the "Sandbox 就緒" beat then fades out.
  await emit({ ...header, eventType: 'asgard.sandbox.ready', fact: sandboxFact('ready') }, 200);

  // General tool-call group (toolsetName set + reason → label from reason; F-004/006/008).
  const gp = 'ag-material-procurement-tools';
  const g1 = next();
  await emit(
    toolStartFrame(header, proc, g1, {
      toolsetName: gp,
      toolName: 'query_orders',
      reason: '讀取上週訂單資料',
      parameter: { week: 'LAST_WEEK' },
    }),
    900,
  );
  await emit(
    toolCompleteFrame(
      header,
      proc,
      g1,
      { toolsetName: gp, toolName: 'query_orders', reason: '讀取上週訂單資料', parameter: { week: 'LAST_WEEK' } },
      { rows: 1280 },
    ),
  );
  const g2 = next();
  await emit(
    toolStartFrame(header, proc, g2, {
      toolsetName: gp,
      toolName: 'aggregate_by_channel',
      reason: '依通路彙總',
      parameter: {},
    }),
    700,
  );
  await emit(
    toolCompleteFrame(
      header,
      proc,
      g2,
      { toolsetName: gp, toolName: 'aggregate_by_channel', reason: '依通路彙總', parameter: {} },
      { channels: 3 },
    ),
  );

  // A bot text breaks the tool-call group (so the native group below renders as its own group).
  const t1 = randomUUID();
  await emit(
    messageFrame(
      header,
      'asgard.message.complete',
      t1,
      replyTo,
      '已彙總上週各通路訂單，接著查急單用料與庫存。',
      TEXT_TEMPLATE('已彙總上週各通路訂單，接著查急單用料與庫存。'),
    ),
    160,
  );

  // Task Check List panel (F-010) — TaskCreate/TaskUpdate carried on tool_call.complete sidecar (never
  // parsed from the result string). Task tools are filtered out of the thread into the docked TaskList.
  // The reducer only updates an *existing* tool-call message on complete, so a complete-only frame is
  // dropped — emit start (creates the message) then complete (carries the replay-safe sidecar).
  const task = async (
    name: 'TaskCreate' | 'TaskUpdate',
    parameter: Record<string, unknown>,
    sidecar: Record<string, unknown>,
  ): Promise<void> => {
    const cs = next();
    const tc = { toolsetName: '', toolName: name, parameter };
    await emit(toolStartFrame(header, proc, cs, tc), 130);
    await emit(toolCompleteFrame(header, proc, cs, tc, {}, { sidecar }), 180);
  };

  await task(
    'TaskCreate',
    {
      subject: '查詢 Bolzen 急單用料需求',
      activeForm: '查詢 Bolzen 急單用料需求中',
      description: '查料號、強度等級、數量並計算 SWRCH35K φ7.0 總需求。',
    },
    { task: { id: '1' } },
  );
  await task(
    'TaskUpdate',
    { taskId: '1', status: 'in_progress' },
    { statusChange: { from: 'pending', to: 'in_progress' }, taskId: '1' },
  );
  await task(
    'TaskCreate',
    {
      subject: '查詢 SWRCH35K φ7.0 庫存狀態',
      activeForm: '查詢庫存狀態中',
      description: '查現有量、已分配量、可用量。',
    },
    { task: { id: '2' } },
  );
  await task(
    'TaskUpdate',
    { taskId: '1', status: 'completed' },
    { statusChange: { from: 'in_progress', to: 'completed' }, taskId: '1' },
  );
  await task(
    'TaskUpdate',
    { taskId: '2', status: 'in_progress' },
    { statusChange: { from: 'pending', to: 'in_progress' }, taskId: '2' },
  );
  await task(
    'TaskCreate',
    {
      subject: '計算短缺量與補貨時效風險',
      activeForm: '計算短缺量與風險中',
      description: '需求 16,000kg − 可用 9,500kg，評估 30 天前置是否趕上 7/16。',
    },
    { task: { id: '3' } },
  );
  await task(
    'TaskUpdate',
    { taskId: '2', status: 'completed' },
    { statusChange: { from: 'in_progress', to: 'completed' }, taskId: '2' },
  );
  await task(
    'TaskUpdate',
    { taskId: '3', status: 'in_progress' },
    { statusChange: { from: 'pending', to: 'in_progress' }, taskId: '3' },
  );
  await task(
    'TaskUpdate',
    { taskId: '3', status: 'completed' },
    { statusChange: { from: 'in_progress', to: 'completed' }, taskId: '3' },
  );

  // Subagent panel (F-012) — Agent spawn + subagent.start + child tool + subagent.complete (status is
  // driven by subagent.complete, not the Agent tool-call). Agent + child tools filtered into the panel.
  const subagentChildCall = async (parent: string, toolName: string, reason: string, delay: number): Promise<void> => {
    const cs = next();
    const call = { toolsetName: '', toolName, reason, parameter: {} };

    await emit(toolStartFrame(header, proc, cs, call, { parentToolUseId: parent }), delay);
    await emit(toolCompleteFrame(header, proc, cs, call, { ok: true }, { ids: { parentToolUseId: parent } }));
  };

  const spawnSubagent = async (
    parent: string,
    agentId: string,
    desc: string,
    childTool: string,
    childReason: string,
    summary: string,
  ): Promise<void> => {
    await emit(
      toolStartFrame(
        header,
        proc,
        next(),
        { toolsetName: '', toolName: 'Agent', parameter: { description: desc } },
        { toolUseId: parent },
      ),
    );
    await emit(
      subagentStartFrame(header, {
        agentId,
        parentToolUseId: parent,
        subagentType: 'general-purpose',
        description: desc,
      }),
      150,
    );
    await subagentChildCall(parent, childTool, childReason, 800);
    // BUG-001 — the subagent emits its own thinking + message (parentToolUseId set). Both must stay hidden
    // from the main chat view; the panel keeps showing the subagent, and only its summary surfaces there.
    await emit(subagentThinkingCompleteFrame(header, parent, `（子代理內部推理）${desc}`), 150);
    await emit(
      subagentMessageCompleteFrame(
        header,
        parent,
        `${summary}\n\n請主代理人在主線程呼叫 issue_wire_po。` +
          'If this output may be shown to the end user, they prefer a concise summary.',
      ),
      150,
    );
    await emit(
      subagentCompleteFrame(header, {
        agentId,
        parentToolUseId: parent,
        subagentType: 'general-purpose',
        status: 'completed',
        summary,
      }),
      180,
    );
  };

  await spawnSubagent(
    'toolu_A',
    'ae9f13d8',
    '查詢 Bolzen 訂單用料需求',
    'execute_database_query',
    '查詢用料明細',
    '查得 SO-TM-0455，需 16,000 kg',
  );
  await spawnSubagent(
    'toolu_B',
    'a8c6caab',
    '查詢 SWRCH35K φ7.0 庫存狀態',
    'execute_database_query',
    '查詢可用庫存',
    '可用庫存 9,500 kg',
  );

  // Issue #382 — a subagent is not one-shot; the orchestrator can resume an existing one. Both cards
  // above are terminal by now, and each is resumed in one of the two shapes the backend produces.
  //
  // Shape B (the common case, a later-turn resume): NO lifecycle event is emitted at all, so the child
  // tool-call landing on the finished card is the only signal that toolu_A is working again.
  await subagentChildCall('toolu_A', 'execute_database_query', '重查用料明細（追加急單）', 900);

  // Shape A (a same-turn resume): a second subagent.start arrives for toolu_B, which works again and
  // then settles back to terminal on its own subagent.complete.
  await emit(
    subagentStartFrame(header, {
      agentId: 'a8c6caab',
      parentToolUseId: 'toolu_B',
      subagentType: 'general-purpose',
      description: '補查替代料號 SWRCH38K 庫存',
    }),
    900,
  );
  await subagentChildCall('toolu_B', 'execute_database_query', '查詢替代料號庫存', 700);
  await emit(
    subagentCompleteFrame(header, {
      agentId: 'a8c6caab',
      parentToolUseId: 'toolu_B',
      subagentType: 'general-purpose',
      status: 'completed',
      summary: '替代料號 SWRCH38K 可用 12,000 kg',
    }),
    900,
  );

  // Live title update (F-016) — the topic drifts, the title bar fades to the new value.
  await emit(titleUpdateFrame(header, '急單備料：已改查替代料號 SWRCH38K'), 200);

  // Native built-in tool variants (toolsetName === '' && no reason) — icons + labels (F-004), Write/Edit
  // line diff (F-007), a failed call in red via backend isError (F-009), all expandable (F-008).
  const nativeCall = async (
    toolName: string,
    parameter: Record<string, unknown>,
    result: Record<string, unknown> | string,
    isError?: boolean,
    runMs = 700,
  ): Promise<void> => {
    const s = next();
    const tc = { toolsetName: '', toolName, parameter };
    await emit(toolStartFrame(header, proc, s, tc), runMs); // spinner spins while the tool "runs"
    await emit(
      toolCompleteFrame(
        header,
        proc,
        s,
        tc,
        typeof result === 'string' ? { result } : result,
        isError != null ? { isError } : undefined,
      ),
      250,
    );
  };

  await nativeCall(
    'Bash',
    { command: 'which weasyprint || which wkhtmltopdf', description: '檢查可用的 PDF 生成工具' },
    'weasyprint ok',
    undefined,
    400,
  );
  await nativeCall(
    'Read',
    { file_path: '/mnt/workspace/orders.md' },
    '1\t上週訂單彙總\n2\t官網 1280 / App 940 / LINE 610',
    undefined,
    400,
  );
  await nativeCall(
    'Write',
    {
      file_path: '/work/report.html',
      content:
        '<!DOCTYPE html>\n<html lang="zh-TW">\n<head><meta charset="UTF-8" /></head>\n<body>\n<h1>短缺分析報告</h1>\n<p>SWRCH35K φ7.0 短缺 6,500 kg</p>\n</body>\n</html>',
    },
    'File created successfully at: /work/report.html',
  );
  await nativeCall(
    'Edit',
    {
      file_path: '/work/plan.md',
      old_string: '### 標題（暫定）\n**Bolzen 急單備料**',
      new_string: '### 標題（已確認）\n**Bolzen 法蘭螺栓急單：替代料號 SWRCH38K 備料計畫**\n（前置 15 天）',
      replace_all: false,
    },
    'The file /work/plan.md has been updated successfully.',
  );
  await nativeCall(
    'Skill',
    { skill: 'local-plugin:shortage-calc', args: 'SWRCH35K φ7.0 目前短缺多少?' },
    'Launching skill: local-plugin:shortage-calc',
  );
  await nativeCall(
    'WebSearch',
    { query: 'SWRCH38K 線材 交期 2026' },
    'Web search results for query: SWRCH38K 交期…',
    undefined,
    1200,
  );
  await nativeCall(
    'WebFetch',
    { url: 'https://example.com/steel-price', prompt: '摘要鋼價走勢' },
    'The server returned HTTP 403 Forbidden.',
    true,
    1300,
  );

  // Assembled final answer (F-011) — start (empty) → typewriter deltas → complete (markdown).
  const ans = randomUUID();
  await emit(messageFrame(header, 'asgard.message.start', ans, replyTo, '', TEXT_TEMPLATE('')), 450);
  for (const piece of chunkText(SHOWCASE_ANSWER, 3)) {
    await emit(messageFrame(header, 'asgard.message.delta', ans, replyTo, piece, null), 45);
  }

  await emit(
    messageFrame(header, 'asgard.message.complete', ans, replyTo, SHOWCASE_ANSWER, TEXT_TEMPLATE(SHOWCASE_ANSWER)),
    120,
  );

  // run.done → indicator off, input released.
  writeEvent(res, { ...header, eventType: 'asgard.run.done', fact: { ...emptyFact(), runDone: {} } });
  res.end();
}

// BUG-003 — the docked Task / Subagent strip must hold a stable position while a run streams. This mock
// keeps the thread growing for ~15s (paragraph after paragraph, well past the viewport, with auto-scroll
// following) and mutates the strip mid-run, so any coupling between thread layout and strip position
// shows up plainly. Three variants, all streaming the identical thread:
//   'chrome' — a typical run (3 tasks + 1 subagent); the strip fits under its 50% cap.
//   'tall'   — a long checklist that pushes the strip past the cap, so it scrolls internally and the
//              thread keeps its half. Without this the route cannot exercise the cap at all.
//   'empty'  — no run chrome, for the "no strip → no gap" case.
const DOCKED_PARAGRAPHS = [
  '先確認資料範圍：上週為 7/14（一）至 7/20（日），時區以系統設定為準，排除測試單與已取消單。',
  '通路彙總結果：官網 1,280 筆、App 940 筆、LINE 610 筆、電話 210 筆，官網仍是主力通路。',
  '接著看 Bolzen 法蘭螺栓急單 SO-TM-0455 的用料需求，主料為 SWRCH35K φ7.0 線材。',
  '單件用料 0.32 kg，急單數量 50,000 件，加上 2% 製程損耗，總需求約 16,000 kg。',
  '倉庫現有量 14,200 kg，其中 4,700 kg 已被既有工單分配，實際可用量為 9,500 kg。',
  '因此短缺 6,500 kg，必須外購或改料，否則 7/16 的出貨日期無法達成。',
  'SWRCH35K φ7.0 的標準採購前置為 30 天，從今天下單最快 8/28 才進料，明顯趕不上。',
  '改查替代料號 SWRCH38K：強度等級相容，前置 15 天，供應商回覆現貨可支應 8,000 kg。',
  '若改用 SWRCH38K，8/13 可進料，配合既有 9,500 kg 可用庫存，7/16 出貨仍有機會達成。',
  '風險提醒：替代料號需先過工程變更審查，建議今天同步送出 ECR，避免卡在流程上。',
  '成本影響：SWRCH38K 單價高約 4.2%，本批多出約 27,300 元，仍低於延遲出貨的違約金。',
  '結論：建議走替代料號並立即開立採購單，同時保留原料號的長交期訂單作為後續補庫。',
];

type DockedRunChromeVariant = 'chrome' | 'tall' | 'empty';

async function handleDockedRunChromeMock(
  res: ServerResponse,
  payload: ParsedPayload,
  customChannelId: string,
  variant: DockedRunChromeVariant,
): Promise<void> {
  const withRunChrome = variant !== 'empty';
  const header: CommonHeader = {
    requestId: randomUUID(),
    namespace: NAMESPACE,
    botProviderName: BOT_PROVIDER_NAME,
    customChannelId,
  };
  const replyTo = payload.customMessageId ?? '';

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  // A later plain send just gets a short reply so the page stays interactive after the run.
  if (!isOpeningTurn(payload)) {
    const mid = randomUUID();
    writeEvent(res, { ...header, eventType: 'asgard.run.init', fact: { ...emptyFact(), runInit: {} } });
    const ack = '重整頁面即可重播這段長串流（進房 RESET 會重跑整段）。';
    await sleep(120);
    writeEvent(res, messageFrame(header, 'asgard.message.complete', mid, replyTo, ack, TEXT_TEMPLATE(ack)));
    writeEvent(res, { ...header, eventType: 'asgard.run.done', fact: { ...emptyFact(), runDone: {} } });
    res.end();

    return;
  }

  const proc = 'docked';
  let seq = 0;
  const next = (): number => seq++;
  const emit = async (frame: object, ms = 180): Promise<void> => {
    writeEvent(res, frame);
    await sleep(ms);
  };

  // Task tools only land in the docked list once the message exists, so start must precede complete.
  const task = async (
    name: 'TaskCreate' | 'TaskUpdate',
    parameter: Record<string, unknown>,
    sidecar: Record<string, unknown>,
  ): Promise<void> => {
    const cs = next();
    const tc = { toolsetName: '', toolName: name, parameter };
    await emit(toolStartFrame(header, proc, cs, tc), 120);
    await emit(toolCompleteFrame(header, proc, cs, tc, {}, { sidecar }), 160);
  };

  await emit({ ...header, eventType: 'asgard.run.init', fact: { ...emptyFact(), runInit: {} } });
  await emit(titleUpdateFrame(header, 'BUG-003：docked 面板定位驗證'), 160);

  if (withRunChrome) {
    await task(
      'TaskCreate',
      { subject: '彙總上週各通路訂單', activeForm: '彙總通路訂單中', description: '排除測試單與已取消單。' },
      { task: { id: '1' } },
    );
    await task(
      'TaskUpdate',
      { taskId: '1', status: 'completed' },
      { statusChange: { from: 'pending', to: 'completed' }, taskId: '1' },
    );
    await task(
      'TaskCreate',
      { subject: '查詢 SWRCH35K φ7.0 庫存', activeForm: '查詢庫存中', description: '現有量、已分配量、可用量。' },
      { task: { id: '2' } },
    );
    await task(
      'TaskUpdate',
      { taskId: '2', status: 'in_progress' },
      { statusChange: { from: 'pending', to: 'in_progress' }, taskId: '2' },
    );

    // 'tall' — enough extra tasks to push the strip past its 50% cap, so the internal scroll (and the
    // thread keeping its half) is actually exercised rather than merely asserted.
    if (variant === 'tall') {
      for (let i = 0; i < 14; i++) {
        const id = `t${i}`;
        await task(
          'TaskCreate',
          { subject: `檢查第 ${i + 1} 批線材入庫紀錄`, activeForm: `檢查第 ${i + 1} 批入庫紀錄中` },
          { task: { id } },
        );
      }
    }

    // A subagent that never completes — the panel stays expanded for the whole run.
    await emit(
      toolStartFrame(
        header,
        proc,
        next(),
        { toolsetName: '', toolName: 'Agent', parameter: { description: '查詢替代料號交期' } },
        { toolUseId: 'toolu_docked' },
      ),
      140,
    );
    await emit(
      subagentStartFrame(header, {
        agentId: 'agent-docked',
        parentToolUseId: 'toolu_docked',
        subagentType: 'general-purpose',
        description: '查詢替代料號交期',
      }),
      160,
    );
    await emit(
      toolStartFrame(
        header,
        proc,
        next(),
        { toolsetName: '', toolName: 'execute_database_query', reason: '查詢 SWRCH38K 供應商交期', parameter: {} },
        { parentToolUseId: 'toolu_docked' },
      ),
      160,
    );
  }

  // The long part: one streamed paragraph per message, so the thread keeps outgrowing the viewport.
  for (const [i, paragraph] of DOCKED_PARAGRAPHS.entries()) {
    const mid = randomUUID();
    await emit(messageFrame(header, 'asgard.message.start', mid, replyTo, '', TEXT_TEMPLATE('')), 220);
    for (const piece of chunkText(paragraph, 3)) {
      await emit(messageFrame(header, 'asgard.message.delta', mid, replyTo, piece, null), 45);
    }

    await emit(messageFrame(header, 'asgard.message.complete', mid, replyTo, paragraph, TEXT_TEMPLATE(paragraph)), 260);

    // Mid-run strip mutations: the strip changes height while the thread streams underneath it.
    if (withRunChrome && i === 4) {
      await task(
        'TaskCreate',
        { subject: '評估替代料號 SWRCH38K', activeForm: '評估替代料號中', description: '強度相容性與交期。' },
        { task: { id: '3' } },
      );
    }

    if (withRunChrome && i === 8) {
      await task(
        'TaskUpdate',
        { taskId: '2', status: 'completed' },
        { statusChange: { from: 'in_progress', to: 'completed' }, taskId: '2' },
      );
      await task(
        'TaskUpdate',
        { taskId: '3', status: 'in_progress' },
        { statusChange: { from: 'pending', to: 'in_progress' }, taskId: '3' },
      );
    }
  }

  writeEvent(res, { ...header, eventType: 'asgard.run.done', fact: { ...emptyFact(), runDone: {} } });
  res.end();
}
