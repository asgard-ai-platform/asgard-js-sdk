# BUILD-076 Announce the highlight levels instead of only painting them

## Meta

- Task ID: `BUILD-076`
- Status: `done`
- Issue: [asgard-js-sdk#462](https://github.com/asgard-ai-platform/asgard-js-sdk/issues/462)（`CHORE`／a11y：issue 開在本 repo，無 PM tracking spec；由 [BUILD-075](./BUILD-075-explorer-search-path-affordances.md) 的第二輪 review 開出）
- Source spec: 無 PM spec。行為依據為 issue #462 與 WCAG 1.4.1 Use of Color
- Complexity: `S`

---

## Brief

BUILD-075 的 `highlightPaths` 用兩級顏色回答「哪幾個資料夾真的被掃、它們在樹的哪裡」，而那個資訊**只存在於顏色裡**：命中層至少還有 `font-weight: 600`，祖先層是一條 `color-mix()` 而已。螢幕閱讀器、強制配色模式拿不到它；不支援 `color-mix()` 的瀏覽器會整條宣告失效，祖先層退化成與未標記列**完全相同**且無 fallback。

本 task 補兩件事，**兩件都是純附加、螢幕上零像素變動**：

1. **把兩級狀態帶進那一列的 accessible name** —— 標記列多一個視覺隱藏的 `<span>`，內容是 `t()` 出來的狀態字。用附加文字而不是 `aria-label`，因為 `aria-label` 會**取代**整個 name，把 entry 名稱與宿主 badge 的內容一起吃掉。
2. **給祖先層的 `color-mix()` 加一條 fallback 宣告** —— 同一個 `color` 屬性先寫純 `var()`，再寫 `color-mix()`；不認識後者的瀏覽器保留前者。

> **為什麼這不算偏離設計原型。** 原型（chat-kit `.ssfe-row-name.is-search-path-parent`）也只有視覺通道，而 BUILD-075 的第二輪 review 決定不單方面偏離它。這裡成立的理由是：**原型規範的是「看起來怎樣」，而這一條加的是「聽起來怎樣」**——量到的列寬列高、label 位置、文件 scrollWidth 都不變，所以原型的視覺契約一條都沒動。
>
> **字串用 prop 自己的詞彙，不用消費端的。** 元件知道的是「這條路徑被標記了」，不是「它被標記成什麼」——Odin 的 search path 是 `highlightPaths` 的一種用途，不是它的語意。所以是 `marked path` / `on the way to a marked path`，宿主要說自己的名詞可以透過 `entryBadge`。

**Already exists:** `tree.tsx`（`highlightTargets` / `highlightAncestors` 已穿到列上，`entryBadge` 的「沒東西就不加 DOM」模式可以照抄）、`source-set-explorer.module.scss`（`.labelHighlight` / `.labelHighlightAncestor` 已在，但無 fallback、無 sr-only 工具類）、`packages/react/src/i18n.ts`（自製 catalog，三語系同檔，非 Tolgee）、`source-set-explorer.spec.tsx`（`BUILD-075` 那組已含 stylesheet 斷言，可延伸）。

---

## Relevant Rules

Distilled from `FRONTEND_RULE_COMMON.md`; builder reads this table instead of the full corpus.

| §    | Rule (summary)                                                                                        |
| ---- | ----------------------------------------------------------------------------------------------------- |
| §1.1 | No `any` / `as any` — use precise types, generics, or `unknown` + narrowing                           |
| §1.2 | No `@ts-ignore` / `eslint-disable` to bypass type or lint errors                                      |
| §1.3 | No `console.log` left in library code                                                                 |
| §1.7 | No breaking public-API change without `@deprecated` transition                                        |
| §2.2 | New public types / functions / components exported from the package entry with explicit `export type` |
| §3.1 | Exported functions / methods declare explicit return types                                            |
| §4.1 | React component props fully typed (no `any`)                                                          |
| §4.2 | No hardcoded color values in components — theme via CSS variables / theme context                     |
| §6   | After implementation: extract repeated logic (≥2×), duplicate types, repeated JSX (≥3×)               |
| §7   | No `setTimeout` mock delays, no `console.log`, no dead commented code, no untracked TODO / FIXME      |

Extra rows for this task:

| §          | Rule (summary)                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| F-025 R16  | 只用 `--asg-*` semantic token；fallback 宣告一樣要走 token，不可寫裸色值                                                       |
| F-005      | 使用者可見字串一律進 `packages/react/src/i18n.ts` 的 catalog，**三語系（en-US / ja-JP / zh-TW）同時補齊**；本 repo 不走 Tolgee |
| BUILD-064  | `source-set-explorer.spec.tsx` 有兩條斷言依賴列的**子元素個數**（標記列 4、未標記列 3）—— 新增 DOM 不得破壞它們                |
| WCAG 1.4.1 | 不可只用顏色傳達資訊                                                                                                           |

---

## Acceptance Criteria

EARS form: `When <event/condition>[, while <state>], the system shall <observable behavior>`.

- `R1` When a row is a `highlightPaths` target, the system shall include a localized "marked path" state in that row's accessible name, after the entry name. → T1, T2
- `R2` When a row is on the way to a target, the system shall include the localized ancestor state instead — one state per row, never both. → T2
- `R3` When `locale` is supplied, the system shall announce in that locale, with the en-US catalog as the fallback. → T1, T2
- `R4` When a row carries no highlight, the system shall add no DOM to it at all — same child count as before this task, so BUILD-064's row-shape assertions still hold. → T2
- `R5` When the announcement is present, the system shall change nothing visible: identical row box, identical label position, no horizontal overflow. → T3
- `R6` When a browser cannot parse `color-mix()`, the system shall still render the ancestor level differently from an unmarked row, via a preceding fallback declaration on the same property. → T3
- `R7` (Smoke check) When the developer runs `npm run typecheck`, `npm run test:packages`, `npm run build:core && npm run build:react`, and inspects the demo route, the system shall show unchanged pixels while the marked rows carry the state in their accessible name. → T4

---

## Implementation Tasks

- [x] T1 (R1, R3): Add `sourceSetExplorer.markedPath` / `sourceSetExplorer.markedPathAncestor` to all three locales in `i18n.ts`.
- [x] T2 (R1, R2, R4): In `tree.tsx` split the highlight decision into `isTarget` / `isAncestor`, derive `announced` from it, and render a `styles.srOnly` span only when it is non-null.
- [x] T3 (R5, R6): Add the `.srOnly` utility and the fallback `color` declaration to `source-set-explorer.module.scss`; extend the `highlightPaths` prop doc to say the announced wording is the prop's own vocabulary.
- [x] T4 (R7): Extend `source-set-explorer.spec.tsx` (announced state per level, locale, declaration order), then run `npm run lint:packages`, `nx lint react-demo`, `npm run format:check`, `npm run typecheck`, `npm run test:packages`, `npm run build:core && npm run build:react`, and measure the demo route in the browser.

---

## Coverage

Use Cases: `R1`–`R7` — all seven verified. `R1`–`R4` / `R6` by Vitest (3 new cases in the `BUILD-075` group,
which is where the affordance they defend lives), `R5` by measuring the rendered route, `R7` by the gate run.

Files:

| File (package)                                                                      | Change                                                                           |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `packages/react/src/i18n.ts`                                                        | 2 keys × 3 locales (T1)                                                          |
| `packages/react/src/components/source-set-explorer/tree.tsx`                        | `isTarget` / `isAncestor` / `announced`, plus the `srOnly` span (T2)             |
| `packages/react/src/components/source-set-explorer/source-set-explorer.module.scss` | `.srOnly` utility; fallback `color` before the `color-mix()` (T3)                |
| `packages/react/src/components/source-set-explorer/source-set-file-explorer.tsx`    | `highlightPaths` prop doc — the announcement and why the wording is generic (T3) |
| `packages/react/src/components/source-set-explorer/source-set-explorer.spec.tsx`    | 3 cases: announced per level + locale + declaration order (T4)                   |

`packages/core/`, `packages/react/src/index.ts` and every `index.ts` barrel are untouched — no public
export changed, so this is additive for every existing consumer.

---

## Decisions

- **視覺隱藏文字，不是 `aria-label`。** `aria-label` 會取代整列的 accessible name，連 entry 名稱和宿主 `entryBadge`
  放進去的東西一起被吃掉；附加一段文字則是 name from content 的正常組合，讀出來是「pdf, marked path」。
- **只在標記列掛那個 span。** 照 `entryBadge` 的既有原則（沒東西就不動 DOM），同時讓 BUILD-064 依賴子元素個數的兩條
  斷言繼續成立——未標記列維持 3 個子元素。
- **字串是 prop 自己的詞彙（`marked path`），不是消費端的（`search path`）。** `highlightPaths` 是通用的標記機制，
  Odin 的 search path 只是其中一種用途。宿主要說自己的名詞，`entryBadge` 已經是那個位置。
- **fallback 宣告只加在祖先層，不擴及這份 stylesheet 其他的 `color-mix()`。** 其他幾處混的是「顏色混透明」、用途是
  背景色調，掉了只是少一個 hover 效果；祖先層掉了會**與未標記列完全相同**，那是資訊消失不是修飾消失。

---

## Execution Log / Change Log

- 2026-09-01: BUILD task created from [asgard-js-sdk#462](https://github.com/asgard-ai-platform/asgard-js-sdk/issues/462)（Status: `draft → in-progress`）。
- 2026-09-01: T1–T4 完成（Status: `in-progress → done`）。閘門全綠 —— `lint:packages` 0 errors（5 個既有 warning）、
  `nx lint react-demo` 0 errors（15 個既有 warning）、`format:check` 乾淨、`typecheck` 三專案綠、
  `test:packages` 715 通過（275 core + 440 react，新增 3）、`build:core` / `build:react` 乾淨。
  瀏覽器實測：標記列與未標記列的 box 皆 1074×24、label 位置相同、`scrollWidth === innerWidth`（無溢出）、
  隱藏 span 為 1×1 絕對定位；兩個掛載共 4 個隱藏 span（各 1 命中 + 1 祖先），未標記列維持 3 個子元素。
