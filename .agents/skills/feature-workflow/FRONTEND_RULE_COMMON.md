# Common Implementation Rules (asgard-js-sdk)

> 本文件包含 `@asgard-js/core` + `@asgard-js/react` 所有 feature 實作**通用**的規則。
> 檔名沿用 Asgard 各 repo 的 `FRONTEND_RULE_COMMON.md` 慣例槽位（feature-workflow / review 皆引用此名）；
> 本 repo 是 **TypeScript SDK library**（Nx + Vite + RxJS，非 Next.js app），故規則以「函式庫公開 API 契約與型別安全」為核心，
> 涵蓋 core（框架無關的 SSE/RxJS client）與 react（React 元件庫）兩個 package。
> Per-repo specifics（package 版本策略、endpoint 慣例、theme 優先序）另見 `requirements/_index.md` → Implementation rules。
> 優先級：**公開 API 相容性 > 型別安全 > 架構正確（package 邊界）> 功能完整 > 程式碼風格**。

---

## §1 Prohibitions

### §1.1 禁止 `any` / `as any`

```ts
// ❌ function parse(data: any) {}      /  const x = raw as any;
// ✅ 完整定義型別；不確定型別用 unknown + type narrowing / type guard
```

TypeScript strict mode 全開；`any` 會侵蝕整條型別鏈，消費端會失去型別保護。

### §1.2 禁止用 `@ts-ignore` / `eslint-disable` 規避型別或 lint 錯誤

用更精確的型別或正確寫法取代，不要壓掉錯誤。

### §1.3 禁止 library code 殘留 `console.log`

函式庫會被塞進消費端 app，`console.log` 會污染對方 console。除錯用的 log 移除，或改由明確的 debug 選項（如 `config.debug`）控制。

### §1.4 禁止 hardcode 敏感資訊 / endpoint

API key、`botProviderEndpoint`、namespace 等一律由呼叫端經 `config` 傳入，不寫死在原始碼或測試資料中。

### §1.5 禁止未清理的 RxJS 訂閱 / 副作用

每個 `subscribe()` 都要有對應的 teardown（`takeUntil`、`Subscription.unsubscribe`、或 React `useEffect` cleanup）。SSE 連線、`EventSource`、timer 都必須在 dispose / unmount 時關閉，否則消費端會記憶體洩漏或殘留連線。

### §1.6 禁止跨 package 深層 import 與反向相依

- `@asgard-js/react` 只能從 `@asgard-js/core` 的**公開進入點**（package 名）import，不可深挖 `@asgard-js/core/src/...`。
- `@asgard-js/core` **絕對不可** import `@asgard-js/react`、`react`、`react-dom` 或任何 DOM API —— core 必須維持框架無關、可在非瀏覽器環境運行。

### §1.7 禁止未經 deprecation 就破壞公開 API

公開型別 / 函式 / props 的簽章變更、移除、rename 屬於 breaking change。先標 `@deprecated` 並保留舊行為（附遷移說明），不要直接改掉；確有必要的 breaking change 要在 TASK spec 記為 decision 並反映在版本號。

---

## §2 Architecture & Module Boundaries

### §2.1 Package 職責

- **`@asgard-js/core`**：SSE 連線 / 訊息串流（`AsgardServiceClient`）、型別定義、RxJS 事件處理、認證流程。**零 React / DOM 相依**，可 tree-shake，輸出 ESM/CJS/UMD。
- **`@asgard-js/react`**：Chatbot 元件、message templates、context providers、theming。相依 `@asgard-js/core`；`react`/`react-dom` 走 **peerDependencies**（externalize，不打包進 bundle）。

### §2.2 公開 API 從 package 進入點導出

新增的公開型別 / 函式 / 元件一律從該 package 的 `src/index.ts`（或既有 barrel）導出；module 邊界要有**明確的型別導出**（`export type`）。內部實作細節不對外導出。

### §2.3 依賴前置檢查（型別先於使用）

實作前先確認依賴已存在：

| 依賴         | 必須先存在                                                                 |
| ------------ | -------------------------------------------------------------------------- |
| 訊息模板型別 | `packages/core/src/types/sse-response.ts`                                  |
| 模板 enum    | `packages/core/src/constants/enum.ts`（`MessageTemplateType`）             |
| React 元件   | `packages/react/src/components/templates/`，並從 `templates/index.ts` 導出 |

> 新增 message template 的標準步驟見 `AGENTS.md` → Common Development Tasks。

### §2.4 使用非 deprecated 的 API

- 用 `botProviderEndpoint`，不要用已 deprecated 的 `endpoint`。
- 沿用既有 pattern，不要平行造第二套做同一件事的 API。

---

## §3 TypeScript & Contracts

### §3.1 導出函式一律標明 explicit return type

所有對外導出的函式 / 方法都要明確標注回傳型別（strict 專案要求），不依賴推導。

### §3.2 型別精準、集中、不重複

- 禁止 `any`（見 §1.1）；泛型優先於過度寬鬆型別。
- 共用型別集中在 core 的 `src/types/`，不在多檔重複定義同一 interface。
- SSE / streaming 的資料形狀一律對齊 `types/sse-response.ts` 的契約。

### §3.3 RxJS 用法

- 用 operator 組合 stream，避免手動巢狀 subscribe。
- 對外導出的 stream 型別要標成 `Observable<T>`，`T` 明確。
- 錯誤要走 stream 的 error channel 或明確的 error 型別，不可靜默吞掉。

---

## §4 React Package（`@asgard-js/react`）

### §4.1 元件 props 完整型別化

props 一律定義 interface / type，無 `any`；event handler、children、render props 都標型別。

### §4.2 Theming 走 CSS 變數與 theme context

顏色 / 尺寸經 theme 設定與 CSS variables，**禁止在元件 hardcode 色值（hex / rgba）**。Theme 優先序：props theme > bot provider metadata annotations > default theme（見 `AGENTS.md`）。

### §4.3 Message template 遵循既有元件 pattern

新模板沿用 `components/templates/` 既有結構與命名，從 `templates/index.ts` 導出，並補上對應 theme 設定。

### §4.3+ UI 驗收：兩種尺寸都要看

預設 theme 把 shell 畫成 **375×640** 的行動版 widget，但消費端（Mimir / Sindri / Odin）一律 full-bleed
掛載（`theme={{ chatbot: { width: '100%', height: '100%' } }}`）。只驗其中一種等於沒驗到另一種會壞的版面
——尤其是 composer 這類「寬度一窄就被裁掉」的地方。demo 路由請**同時並排**渲染兩個 shell（範例見
`/prompt-suggestion`），細節與兩個已知陷阱見 `AGENTS.md` → Demo application。

### §4.4 React 走 peerDependencies

`react` / `react-dom` 不打包進 bundle（externalize）；不得引入會把 React 打進來的相依。避免消費端出現兩份 React（invalid hook call）。

---

## §5 Versioning & Consistency

- `@asgard-js/core` 與 `@asgard-js/react` **永遠相同版本號**；改動涉及公開 API 時，於 TASK spec 記錄版本影響（見 `CLAUDE.local.md` 版本管理原則）。
- 重複出現 3 次以上的常數 / 字面量抽成共用常數；重複邏輯抽成 util。
- 對外文字 / 錯誤訊息用一致措辭，不隨手改寫。

---

## §6 Refactor Pass

所有實作完成後執行一次重構掃描：

| 類型     | 觸發條件                          | 抽出目標                            |
| -------- | --------------------------------- | ----------------------------------- |
| 邏輯函式 | 相同邏輯出現 2 次以上             | core / react 對應的 `lib` / `utils` |
| 型別     | 同一概念型別重複定義              | core `src/types/`                   |
| 元件片段 | 相同 JSX / hook 使用出現 3 次以上 | 共用元件 / 自訂 hook                |

utils 有對應單元測試（Vitest）：happy path + edge cases。

靜態檢查全綠才算完成：

```bash
npm run lint:packages   # ESLint（core + react）
npm run format:check    # Prettier
npm run build:core && npm run build:react   # 型別檢查（tsc 經 vite build）+ 產物驗證
```

---

## §7 No Residue

以下不可存在於發布分支：

- `console.log`（除刻意保留、由 debug 選項控制的 logging）
- `setTimeout` 模擬串流 / API delay 的假資料
- 未清理的 RxJS 訂閱（見 §1.5）
- 註解掉的死碼
- 殘留的 TODO / FIXME 且無對應 TASK 追蹤
- 被 externalize 卻誤打包進 bundle 的相依
