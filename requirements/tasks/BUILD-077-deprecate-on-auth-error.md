# BUILD-077 Deprecate `onAuthError` in favour of `onSseError`

## Meta

- Task ID: `BUILD-077`
- Status: `done`
- Issue: [asgard-js-sdk#459](https://github.com/asgard-ai-platform/asgard-js-sdk/issues/459) §2（`CHORE`／issue 開在本 repo，無 PM tracking spec）
- Source spec: 無 PM spec。#459 §2 明寫這張「**要的是決定，不是實作**」，兩條路是「填它」或「廢它」；2026-09-02 定案 **廢它**
- Complexity: `S`

---

## Brief

`onAuthError` 是 `ChatbotProps` 上的公開 prop，README 把它寫成「Callback fired when authentication or bot provider initialization fails」。但 **`packages/core/src` 裡 `isAuthError` / `isBotProviderError` 的出現次數是 0** —— core 從來沒有建出那個形狀。所以用第一方 `AsgardServiceClient` 的消費端，真的 401 / 403 送到的是 `HTTP 403: Forbidden`，五個入口的 `asAuthShapedError()` 一律回 `null`，只有 `onSseError` 收得到。照文件接了它的人，會拿到一個**永遠不觸發、而且沒有任何徵兆**的 callback。

[BUILD-074](./BUILD-074-sse-error-guard-gaps.md) 修掉 #459 的 §1（nudge 沒有錯誤出口）與 §3（throw 防護），並在 REVIEW-074 Findings 記下 §2 仍然是死的、**刻意不在那張處理**，因為它要的是取捨而不是實作。

**本 task 執行「廢它」這條，範圍就是 #459 §2 寫的那三件**：標 `@deprecated`、README 改寫成「要接錯誤請接 `onSseError`」、下一個 major 移除。

> **執行期行為零變動，這是刻意的。** `asAuthShapedError()` 留著、五個入口的分流留著、自訂 `IAsgardServiceClient` 自己丟出那個形狀時 `onAuthError` 照樣觸發（`sse-error-exits.spec.tsx` R2 與 `consent-reply-error.spec.tsx` R2 就是釘這件事的，兩條都沒動）。§1.7 要的正是這個：先標 `@deprecated` 並**保留舊行為**，不要直接改掉。
>
> **為什麼不順手把 core 填起來。** 那是另一條路（#459 §2 的「填它」），而且是真正的實作工作——要在 core 辨識 401/403 與 bot-provider 初始化失敗、建出那個形狀。決定是廢它，所以不做；#459 §2 也明寫「決定之前不要動程式碼——現在的行為至少是**一致地**不觸發，半套修比較糟」。

**Already exists:** `packages/react/src/hooks/use-channel.ts`（`asAuthShapedError` 與五個入口的分流，`AuthShapedError` 型別）、`sse-error-exits.spec.tsx`（BUILD-074 建的，R2 已釘住「auth 形狀仍會先到 `onAuthError`」）、`consent-reply-error.spec.tsx`（同樣有一條 R2）、`packages/react/README.md`（第 346 行的 prop 表）。

---

## Relevant Rules

| §    | Rule (summary)                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------ |
| §1.1 | No `any` / `as any`                                                                                    |
| §1.2 | No `@ts-ignore` / `eslint-disable` to bypass type or lint errors                                       |
| §1.3 | No `console.log` left in library code                                                                  |
| §1.7 | **No breaking public-API change without `@deprecated` transition** —— 本 task 就是那個 transition 本身 |
| §2.2 | New public types / functions / components exported from the package entry with explicit `export type`  |
| §3.1 | Exported functions / methods declare explicit return types                                             |
| §4.1 | React component props fully typed (no `any`)                                                           |
| §6   | After implementation: extract repeated logic (≥2×), duplicate types, repeated JSX (≥3×)                |
| §7   | No `setTimeout` mock delays, no dead commented code, no untracked TODO / FIXME                         |

Extra rows for this task:

| §      | Rule (summary)                                                                                     |
| ------ | -------------------------------------------------------------------------------------------------- |
| #459   | §2 的處置範圍只有三件：標 `@deprecated`、README 改寫、下一個 major 移除。**不得順手改執行期行為**  |
| README | 這個 repo 有 README 與型別漂移的前科（`docs/sourceset-explorer-readme-drift`），兩邊要一起改並釘住 |

---

## Acceptance Criteria

- `R1` When a consumer's editor resolves `ChatbotProps.onAuthError`, the system shall show it as deprecated and name `onSseError` as the replacement. → T1, T3
- `R2` When the prop is declared anywhere in the package — not only on the public props type — the system shall carry the same `@deprecated` block, so a later doc pass cannot copy from an unmarked one. → T1
- `R3` When a consumer reads the README, the system shall say the prop is deprecated and name `onSseError`, rather than describing it as a working auth hook. → T2
- `R4` When a custom `IAsgardServiceClient` throws the auth shape, the system shall still call `onAuthError` before `onSseError` — the deprecation changes documentation only. → T4
- `R5` (Smoke check) When the developer runs the gates and inspects the emitted `.d.ts`, the system shall carry the `@deprecated` tag into the published types with no behaviour change and no new export. → T5

---

## Implementation Tasks

- [x] T1 (R1, R2): Add the same `@deprecated` block to all three declarations — `chatbot.tsx` (`ChatbotProps`), `asgard-service-context.tsx`, `use-channel.ts`.
- [x] T2 (R3): Rewrite the README's `onAuthError` bullet.
- [x] T3 (R1): Confirm the tag survives into `packages/react/dist/**/chatbot.d.ts`.
- [x] T4 (R4): Confirm the two existing R2 cases still pass **unedited** — they are the behaviour guarantee.
- [x] T5 (R5): Add a `#459 §2` group to `sse-error-exits.spec.tsx` pinning the tag on every declaration and the README wording; run the full gate set.

---

## Coverage

Use Cases: `R1`–`R5` — all five verified. `R1`/`R2`/`R3` by the two new Vitest cases, `R4` by the two
pre-existing R2 cases passing unedited, `R5` by the gate run plus a grep over the emitted `.d.ts`.

Files:

| File (package)                                          | Change                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| `packages/react/src/components/chatbot/chatbot.tsx`     | `@deprecated` block on `ChatbotProps.onAuthError` (T1)              |
| `packages/react/src/context/asgard-service-context.tsx` | the same block (T1)                                                 |
| `packages/react/src/hooks/use-channel.ts`               | the same block (T1)                                                 |
| `packages/react/README.md`                              | the prop bullet rewritten (T2)                                      |
| `packages/react/src/hooks/sse-error-exits.spec.tsx`     | `#459 §2` group — 2 cases over the declarations and the README (T5) |

`packages/core/` is untouched. No export, signature or runtime path changed.

---

## Decisions

- **廢它而不是填它。** 兩條路是 #459 §2 列的；2026-09-02 定案廢它。填它要在 core 辨識 401/403 與
  bot-provider 初始化失敗並建出那個形狀，是真正的實作工作，而 `onSseError` 已經收得到每一個錯誤——
  多一個平行的 callback 只是多一條要維護的路。
- **不加執行期的 deprecation warning。** #459 §2 的處置只寫了 JSDoc 與 README 兩件。函式庫在消費端
  console 印東西是 §1.3 的反面，而且真的接了這個 prop 的人本來就收不到任何呼叫——警告會出現在一個
  什麼都沒發生的地方。
- **三個宣告點都標，即使只有一個是公開 API。** `useChannel` 與 service-context 都不在 `index.ts`，
  但 README 那段當初就是照某一個宣告寫出來的。只標公開那個，下一次寫文件的人照樣會從沒標的那份抄。
- **demo route 保持原樣。** `tool-call-consent` 與 `nudge-payload` 兩條路由仍然接著 `onAuthError`。
  它們示範的是錯誤分流的形狀，而那條路對自訂 client 仍然存在；#459 §2 的範圍也沒有包含 demo。
- **README 與型別的一致性用測試釘住，不靠自律。** 這個 repo 有 README 漂移的前科
  （`docs/sourceset-explorer-readme-drift`），而 deprecation 是最容易只改一半的一種改動。新的斷言
  刻意只看「緊鄰宣告上方的那個註解區塊」而不是整份檔案，否則別的 prop 的 `@deprecated` 就會讓它誤過。

---

## Execution Log / Change Log

- 2026-09-02: 收到「deprecate 它」的決定，BUILD task 建立（Status: `draft → in-progress`）。
- 2026-09-02: T1–T5 完成（Status: `in-progress → done`）。閘門全綠 —— `lint:packages` 0 errors
  （5 個既有 warning）、`format:check` 乾淨、`typecheck` 三專案綠、`test:packages` 714 通過
  （275 core + 439 react，新增 2）、`build:core` / `build:react` 乾淨，`@deprecated` 確認出現在
  `packages/react/dist/components/chatbot/chatbot.d.ts`。新斷言以反證確認有效：把 README 的
  `Deprecated` 字樣改回舊描述後測試轉紅，還原後轉綠。
