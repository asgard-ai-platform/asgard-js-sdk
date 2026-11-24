# BUILD-101 Render the agent's [NEEDS_INPUT]: line as a callout

## Meta

- Task ID: `BUILD-101`
- Status: `done`
- Issue: [asgard-sdk-pm#129](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/129)
- Source spec: `references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-041-agent-回覆的-needs-input-那一行畫成-callout.md`（行為契約在 `references/asgard-sdk-pm/docs/spec/asgard-js-sdk/needs-input-callout.md`，決議 `docs/decisions/2026-11-23-needs-input-callout.md`）
- Complexity: `M`

---

## Brief

agent 被使用者卡住時，回覆最後一行用 `[NEEDS_INPUT]: <需要你提供什麼>` 收尾（舊寫法 `needs input: …`）。這一行今天原樣印在畫面上。這張票把它從 bot 文字裡抽出來，畫成「需要你回覆」callout：左側主色色條、淡主色底、上方小標題，下方是那句話（markdown 渲染）；這則訊息後面已經有使用者訊息時，改成中性色的「✓ 已回覆」。

**切段放在 `BotMessageText`**（spec §6.2），宿主自己用它組的訊息列也會有 callout（AC10）。辨識與切段是純函式，規則跟後端 `asgard-core internal/shared/needsinput` 的 `markerLine` 一致（spec §2），另加「fenced code block 裡的不算」。`BotMessageText` 新增兩個選填 prop：`streaming`（由 `BotTypingBox` 傳 `true`，啟用 spec §4 的 hold-back）與 `answered`（由 `TextTemplate` 用 `isQuestionResolved` 算好傳入；沒傳視為「需要你回覆」）。沒有標記、也不在串流中的訊息，仍是單一 `StreamdownClient`，輸出跟現在完全一樣（AC11）。

**Already exists:** `templates/text-template/bot-message-text.tsx`（`BotMessageText`，public export，包 `StreamdownClient`）、`bot-typing-box.tsx`（串流中 → `BotMessageText`）、`text-template.tsx`（完成的訊息 → `BotMessageText`）、`templates/question-template/is-question-resolved.ts`（`isQuestionResolved(messages, messageId)`，messages 由 `useAsgardContext()` 的 `Map` 取得，用法見 `question-template.tsx:136`）、`i18n.ts`（`t(locale, key)` 三語 catalog）、`useAsgardTemplateContext().locale`、`file-explorer/icons.tsx` 的 inline icon 寫法（lucide 形狀）。原型參考實作：`references/asgard-chat-kit-prototype/src/needsInput.ts`、`src/blocks/NeedsInputCallout.tsx`、`src/blocks/TextBlock.tsx`（@ `ef183ce`，main 的 merge commit `b0831e4` 內容相同）。

**不在範圍**：

- 複製整則訊息（spec §5 後半）：SDK 目前沒有複製訊息的動作，只加 `needsInput.copyPrefix` 文案（spec §6.1 最後一條）。
- 發版與下游 bump（F-041 AC13）：發版時機由使用者決定，不在這張 BUILD。
- 從 SSE 事件或 `conversationStatus` 推出 callout、callout 上的互動（spec §7）。

---

## Relevant Rules

Distilled from `FRONTEND_RULE_COMMON.md`; builder reads this table instead of the full corpus.

| §    | Rule (summary)                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------------- |
| §1.1 | No `any` / `as any` — use precise types, generics, or `unknown` + narrowing                               |
| §1.2 | No `@ts-ignore` / `eslint-disable` to bypass type or lint errors                                          |
| §1.3 | No `console.log` left in library code (gate behind an explicit debug option if needed)                    |
| §1.6 | `@asgard-js/core` never imports `react` / `react-dom` / DOM; react imports core via its public entry only |
| §1.7 | No breaking public-API change without `@deprecated` transition                                            |
| §2.2 | New public types / functions / components exported from the package entry with explicit `export type`     |
| §3.1 | Exported functions / methods declare explicit return types                                                |
| §4.1 | React component props fully typed (no `any`)                                                              |
| §4.2 | No hardcoded color values in components — theme via CSS variables / theme context                         |
| §4.4 | `react` / `react-dom` stay peerDependencies (not bundled)                                                 |
| §5   | `@asgard-js/core` and `@asgard-js/react` keep the same version number                                     |
| §6   | After implementation: extract repeated logic (≥2×), duplicate types, repeated JSX (≥3×)                   |
| §7   | No `setTimeout` mock delays, no `console.log`, no dead commented code, no untracked TODO / FIXME          |

---

## Acceptance Criteria

- `R1` When a bot message line matches spec §2 — at the start of a line (leading spaces / tabs allowed), `[NEEDS_INPUT]` followed by a half- or full-width colon (spaces allowed in between, case-insensitive), or the legacy `needs input` followed by `:` `：` `—` `–` `-` — the system shall treat it as a needs-input line. → T1 ← F-041/AC1
- `R2` When the marker is mid-line, inside bold / blockquote / list syntax, lacks a colon, the line starts with `blocked:`, or the line is inside a fenced code block (` ``` ` or `~~~`), the system shall leave the line as ordinary markdown. → T1 ← F-041/AC2
- `R3` When a message contains a needs-input line, the system shall render a callout in that line's original position showing only the text after the marker, rendered as markdown (links clickable), and the surrounding text unchanged; when nothing follows the marker, the callout shall show only its title. → T1, T2, T3 ← F-041/AC3
- `R4` When needs-input lines are consecutive, the system shall merge them into one callout with one paragraph per line. → T1, T2 ← F-041/AC4
- `R5` When no user message follows the bot message, the system shall render the "needs your reply" state: 3px primary left bar, light primary background (≈10%), rounded right corners, a title row with a reply icon and the localized label in the primary color, one step smaller than body text and medium weight; colors only from `--asg-color-*` semantic tokens. → T2, T4 ← F-041/AC5
- `R6` When a user message follows the bot message, the system shall render the "replied" state (border-colored bar, faint neutral background, "✓" plus the localized answered label in the secondary text color) with the content still shown and not collapsed; the result shall be the same after a refresh or rejoin (derived via `isQuestionResolved`). → T2, T4 ← F-041/AC6
- `R7` While a bot message is streaming, when the last line could still become a marker (after trimming leading spaces and lowercasing, it is a prefix of `[needs_input]:` / `needs input:`, or `[needs_input]` / `needs input` followed only by spaces), the system shall hold that line back until it resolves; ordinary text shall keep appearing as it streams, and a line that already matches R1 shall render as a growing callout. → T1, T4 ← F-041/AC7
- `R8` The system shall provide `needsInput.label` / `needsInput.answered` / `needsInput.copyPrefix` in en-US, zh-TW and ja-JP with the wording in spec §5 (en-US `copyPrefix` ends with one space). → T5 ← F-041/AC8
- `R9` The callout shall carry `role="note"` and an accessible name equal to its title text. → T2 ← F-041/AC9
- `R10` When a host renders its own message row with `BotMessageText`, the system shall render the callout there too (default state "needs your reply" when `answered` is not passed). → T3 ← F-041/AC10
- `R11` When a message has no needs-input line and is not streaming, the system shall render exactly the same output as before this change (single `StreamdownClient`, same wrapper). → T3, T6 ← F-041/AC11
- `R12` The recognition and splitting functions shall have unit tests covering every R1 and R2 case (ported from the prototype `src/needsInput.ts` cases and the backend `needsinput_test.go` rules) plus R4 and R7. → T1, T6 ← F-041/AC12
- `R13` (Smoke check) When the developer runs `npm run build:core && npm run build:react` and walks the needs-input demo route (`npm run serve:react-demo -- -- --port 5100`) with a full-bleed and a 375×640 shell side by side, the system shall show R3–R7 and R9 behavior in both shells with no build errors. → T7

---

## Implementation Tasks

- [x] T1 (R1, R2, R4, R7, R12): `text-template/needs-input.ts` — `splitNeedsInput(text, { streaming })` → `NeedsInputSegment[]`（`markdown` / `needs-input`），marker regex 照 spec §2、fence 切換、連續標記合併（空行接起）、串流 hold-back（`mayBecomeMarker`）；`needs-input.spec.ts` 先寫、對照原型與後端規則逐條列案例。
- [x] T2 (R3, R4, R5, R6, R9): `text-template/needs-input-callout.tsx` + `.module.scss` — `role="note"`、`aria-label`＝標題；兩種狀態樣式只用 `--asg-color-primary` / `--asg-color-border` / `--asg-color-text-secondary` 等 token（淡底用 `color-mix`，比照 `chatbot-file-explorer.module.scss`）；內容交給 `StreamdownClient`；後面沒字只顯示標題。icon（reply、check）加進既有的 inline icon 寫法。
- [x] T3 (R3, R10, R11): `BotMessageText` 加選填 prop `streaming?: boolean`、`answered?: boolean`；切段後沒有 needs-input 片段且不在串流 → 維持原本單一 `StreamdownClient` 的輸出；串流中沒有標記 → 單一 `StreamdownClient` 收 hold-back 後的文字；有標記 → 依序渲染片段。定案的 prop 名稱就是 `streaming` / `answered`，記在本檔 Coverage；收斂時併進 `requirements/spec/conversation.md`（PM spec §6.2 那節由 PM 回寫）。
- [x] T4 (R5, R6, R7): `BotTypingBox` 傳 `streaming`；`TextTemplate` 由 `useAsgardContext().messages` 與 `isQuestionResolved` 算出 `answered` 傳入。
- [x] T5 (R8): `i18n.ts` 三語加 `needsInput.label` / `needsInput.answered` / `needsInput.copyPrefix`。
- [x] T6 (R11, R12): `text-template.spec.tsx` / 新 spec — 沒有標記的訊息輸出與改動前一致；有標記時片段順序、callout 狀態、`role="note"` 與可及名稱。
- [x] T7-1: `npm run lint:packages` + `npm run format:check` + `npm run typecheck` + `npm run build:core && npm run build:react` + `npm run test:packages`
- [x] T7 (R13): react-demo 新增 needs-input 路由（full-bleed 與 375×640 並排，mock 串流與「已回覆」情境，locale 切換），Playwright 走過 R3–R7、R9；截圖收進本機驗收文件，不進 repo。

---

## Coverage

Use Cases: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13

Files:

- `packages/react/src/components/templates/text-template/needs-input.ts`（新，辨識／切段／hold-back 純函式，不對外匯出）
- `packages/react/src/components/templates/text-template/needs-input.spec.ts`（新，44 案例）
- `packages/react/src/components/templates/text-template/needs-input-callout.tsx` + `needs-input-callout.module.scss`（新，不對外匯出）
- `packages/react/src/components/templates/text-template/bot-message-text.tsx`（`streaming?` / `answered?` 兩個選填 prop，additive）
- `packages/react/src/components/templates/text-template/bot-message-text.spec.tsx`（新，10 案例）
- `packages/react/src/components/templates/text-template/bot-typing-box.tsx`（傳 `streaming`）
- `packages/react/src/components/templates/text-template/text-template.tsx`（以 `isQuestionResolved` 算 `answered`）
- `packages/react/src/components/templates/text-template/text-template.module.scss`（`.text--segmented`，只在有 callout 時掛）
- `packages/react/src/i18n.ts`（三語 `needsInput.*`）
- `apps/react-demo/src/app/routes/needs-input/`（新路由 `/needs-input`）、`app.tsx`、`components/layout/layout.tsx`、`src/mock-server/sse-mock.ts`（`needs-input-demo*` 腳本）

公開 API：`BotMessageTextProps` 多兩個選填欄位 `streaming`、`answered`，其餘不變。

---

## Execution Log / Change Log

- 2026-11-24: BUILD task created from https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/129 (Status: `draft`).
- 2026-11-24: Plan confirmed; implementation started (Status: `draft → ready → in-progress`).
- 2026-11-24: All R# verified (Status: `in-progress → done`).
  - lint 0 error（5 個既有 warning 不在本次檔案）、typecheck（core + react + demo）、build core／react 通過；format:check 只剩 `requirements/spec/` 7 個 main 上本來就沒排版的檔案。Vitest：core 458、react 859 全綠。
  - R11：另以暫時的對照測試把 `main` 版 `BotMessageText` 與新版並排渲染 8 種沒有標記的訊息（含 code block、行中、粗體裡的標記與空字串），HTML 逐字相同；對照檔已刪除。
  - R13：`/needs-input` 寬版與 375×640 並排，Playwright 走過 R3–R7、R9：回覆前後狀態切換（寬窄兩個 channel 各自獨立）、連續標記合併、只有標題、code block 不算、三語標題、覆寫 `--asg-color-primary` 後色條／淡底／標題跟著變。串流中以 MutationObserver 與 39 張逐格取樣檢查，標記原文 0 次出現。
  - 觀察到的既有行為（不是本次改動造成）：`> [NEEDS_INPUT]: 單詞` 這種「標記後只有一個不含空白的詞」的行，在 markdown 裡會被當成連結參照定義而整行不顯示（demo 文字已改成含空白）；串流中連結還沒傳完時暫時顯示 `[blocked]`，傳完即恢復成連結，這是 Streamdown 處理未完成連結的方式。
