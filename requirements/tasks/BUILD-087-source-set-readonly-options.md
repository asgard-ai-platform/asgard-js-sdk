# BUILD-087 Let SourceSetFileExplorer hide entries and open or toggle from the context menu

## Meta

- Task ID: `BUILD-087`
- Status: `done`
- Issue: [asgard-sdk-pm#116](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/116)（需求來源：Sindri F-052／UC-048 [asgard-sindri-pm#300](https://github.com/asgard-ai-platform/asgard-sindri-pm/issues/300)、Mimir F-010 [asgard-mimir-pm#163](https://github.com/asgard-ai-platform/asgard-mimir-pm/issues/163)）
- Source spec: `references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-025-sourceset-file-explorer-元件.md`；原型 `asgard-sindri-prototype` @ `20f7b9c` `src/app/components/files/VolumeFileExplorer.tsx:205-249`（右鍵選單）
- Complexity: `M`

---

## Brief

Sindri 資源面板與 Mimir 資源抽屜都用 `SourceSetFileExplorer` 的 `readOnly` 瀏覽 Skillset／Drive。PM 2026-09-30 對兩個
產品定了同一條規則：名稱以 `.` 開頭的**目錄**一律隱藏（`.` 開頭的檔案照常顯示），而元件的清單是自己抓、自己畫，
宿主插不進去。另外唯讀時右鍵只剩「下載」「重新整理」，原型另有「開啟」（檔案）與「展開／收合」（資料夾）。

本 task 加兩件事，都是 additive：

1. **`hideEntry?: (entry: FsEntry) => boolean`**：回傳 `true` 的項目（連同底下的一切）不畫在樹上，每一層都適用。
   兩個產品傳 `entry => entry.isDir && entry.name.startsWith('.')`。只影響畫面：檔名去重仍看完整清單，
   被隱藏的項目還在 volume 上，貼上／新增不會撞到或蓋掉它。
2. **右鍵的導覽項目**：右鍵檔案時第一項是「開啟」，右鍵資料夾時第一項是「展開」或「收合」（看目前狀態）。
   兩種模式都有（不改檔，`readOnly` 不拿掉）；背景右鍵（沒有選取）不出現。工具列不變。

**Already exists:** `source-set-file-explorer.tsx`（action 表、`menuSections`、`extraEntryActions` 不受 `readOnly`
抑制的先例）、`tree.tsx`（`renderDirBody` 的空目錄判斷）、`use-source-set-explorer.ts`（`open`、`toggleExpand`、
以原始清單去重的 `takenIn`）、`icons.tsx`（`EyeIcon`、`ChevronRightIcon`、`ChevronDownIcon`）、demo `/source-set-explorer`
（寬窄並排、`readOnly` 開關、模擬 volume）。

---

## Relevant Rules

| §     | Rule (summary)                                                                      |
| ----- | ----------------------------------------------------------------------------------- |
| §1.1  | No `any` / `as any`                                                                 |
| §1.2  | No `@ts-ignore` / `eslint-disable`                                                  |
| §1.3  | No `console.log` left in library code                                               |
| §1.6  | core never imports react / react-dom / DOM; react imports core via its public entry |
| §1.7  | **No breaking public-API change without `@deprecated` transition**                  |
| §2.2  | New public types exported from the package entry with explicit `export type`        |
| §3.1  | Exported functions / methods declare explicit return types                          |
| §4.1  | React component props fully typed                                                   |
| §4.2  | No hardcoded colour values — theme via CSS variables                                |
| §4.3+ | UI acceptance at both widths, side by side                                          |
| §6    | After implementation: extract repeated logic (≥2×)                                  |
| §7    | No `setTimeout` mock delays, no dead commented code, no untracked TODO / FIXME      |

Extra rows for this task:

| §     | Rule (summary)                                                                                                              |
| ----- | --------------------------------------------------------------------------------------------------------------------------- |
| F-025 | `packages/react/src/components/file-explorer/`（chat 版）零變更；文案走 `sourceSetExplorer.*`，en-US / ja-JP / zh-TW 三語齊 |
| F-025 | `readOnly` 仍拿掉所有變更動作；新增的導覽項目不改檔，所以保留                                                               |
| #116  | 隱藏只作用在畫面；去重、碰撞判斷仍以 volume 的完整清單為準                                                                  |

---

## Acceptance Criteria

- `R1` When `hideEntry` is given, the system shall not render an entry for which it returns `true` — at every level of
  the tree, together with everything under it — while every entry it returns `false` for renders as before (under the
  PM rule: a `.`-prefixed directory is hidden, a `.`-prefixed file is not). → T1, T2, T4
- `R2` When every entry of a listed directory is hidden, the system shall show that directory as empty. → T1, T4
- `R3` When an entry is hidden, the system shall still count it as taken when deduplicating a name, so pasting into
  its directory never writes over it. → T1, T4
- `R4` When `hideEntry` is omitted, the system shall render the tree exactly as before. → T4
- `R5` When the user right-clicks a file, the system shall offer "Open" as the first context-menu item and open the file
  view on it; on a directory, the first item shall read "Expand" or "Collapse" by its current state and toggle it. Both
  shall appear with and without `readOnly`; a right-click on the tree's background (nothing selected) shall offer
  neither. → T2, T3, T5
- `R6` When the explorer renders, the system shall keep the toolbar unchanged — no open or expand/collapse button — and
  `readOnly` shall still remove every mutating action from both toolbar and menu. → T2, T5
- `R7` When the new labels render, the system shall take them from `sourceSetExplorer.*` with en-US, ja-JP and zh-TW
  entries. → T3, T5
- `R8` (Smoke check) When the developer runs `lint:packages`, `format:check`, `typecheck`, `build:core`, `build:react`
  and `test:packages`, all shall pass; and on the react-demo `/source-set-explorer` route, at both widths side by side,
  turning hiding on shall drop the mock `.git/` directory while `.env.example` stays, and the context menu shall offer
  Open / Expand / Collapse in both read-only and editable mode. → T6, T7, T8

---

## Implementation Tasks

- [x] T1 (R1–R3): `tree.tsx` — `hideEntry?` prop；`renderDirBody` 以過濾後的清單畫列與判斷空目錄。去重的
      `takenIn` 不動（仍讀原始清單）。
- [x] T2 (R1, R5, R6): `source-set-file-explorer.tsx` — `SourceSetFileExplorerProps.hideEntry?`（JSDoc 寫明只影響畫面、
      作用於每一層、被隱藏的項目即使是 `initialPath`／`autoExpandPaths`／`highlightPaths` 的目標也不畫）並傳給樹；
      `menuSections` 最前面加一組導覽項目（檔案：開啟；資料夾：展開／收合），不進 action 表，所以工具列不變。
- [x] T3 (R5, R7): `i18n.ts` — `sourceSetExplorer.open` / `.expand` / `.collapse` 三語。
- [x] T4 (R1–R4): react Vitest — 隱藏根層與巢狀層的項目、`.` 開頭檔案照常顯示、全部被隱藏的目錄顯示為空、
      貼上到有被隱藏同名項目的目錄會去重、不傳時與現在相同。
- [x] T5 (R5–R7): react Vitest — 檔案右鍵第一項「開啟」且能開檔、資料夾第一項「展開」→ 展開後變「收合」、
      `readOnly` 與一般模式都有、背景右鍵沒有、工具列沒有這兩個按鈕；既有「右鍵與工具列同一組動作」一案改成
      「工具列那一組＋導覽項目」。
- [x] T6 (R8): `packages/react/README.md` — 〈SourceSet File Explorer〉補 `hideEntry` 與右鍵導覽項目。
- [x] T7 (R8): demo `/source-set-explorer` — 模擬 volume 加 `.git/`（內含檔案）與 `.env.example`；加「隱藏 `.` 開頭目錄」開關。
- [x] T8 (R8): `npm run lint:packages && npm run format:check && npm run typecheck`、`npm run build:core && npm run build:react`、
      `npm run test:packages`；demo 寬窄兩個面板各走一輪。

---

## Decisions

- **導覽項目只進右鍵、不進工具列**：照原型（原型工具列沒有這兩項）。F-025 R5「toolbar 與右鍵選單提供同一組動作」
  列的是會操作檔案的那組；開啟、展開／收合是在樹上移動，工具列多兩顆只為了對稱沒有意義。這是 #116 第 2 題問 PM
  的內容，2026-10-01 決定先照原型做，PM 回覆若不同再調整。
- **`hideEntry` 用 predicate，不做成元件內建的固定規則**：#116 第 1 題問 PM 的內容。predicate 涵蓋固定規則
  （兩個產品傳同一行即可），又不把「`.` 目錄」寫死成元件語意；2026-10-01 決定先照此做。
- **只過濾畫面、不過濾資料**：被隱藏的項目還在 volume 上，資料層一起濾掉會讓去重看不到它，貼上同名時就會寫到它頭上。
- **右鍵分組沿用 SDK 既有規則，不完全照原型**：原型的檔案選單是「開啟、下載」同一組，資料夾唯讀時只有「展開／收合」與
  「重新整理」。這裡導覽項目自成第一組，後面接 SDK 既有的分組；資料夾也照樣列出停用的「下載」。出處是 F-025 既有決議：
  工具列與右鍵共用同一張 action 表、該停用的動作停用而不隱藏（R5）。要完全照原型得改那條既有規則，不在本 task 範圍
  （2026-10-02 code review 指出）。

---

## Coverage

Use Cases: `R1`–`R8`。R1–R4 由 `source-set-explorer.spec.tsx` 新增的〈hideEntry keeps entries off the tree〉4 案，R5–R7 由
〈the context menu opens files and folds folders〉5 案，R8 由閘門與 demo `/source-set-explorer` 寬窄兩個面板、唯讀與一般模式各走一輪。

Files:

| File (package)                                                                   | Change                                                                                 |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `packages/react/src/components/source-set-explorer/tree.tsx`                     | `hideEntry?`；`renderDirBody` 以過濾後的清單畫列與判斷空目錄（T1）                     |
| `packages/react/src/components/source-set-explorer/source-set-file-explorer.tsx` | `hideEntry?` prop（JSDoc）並傳給樹；`menuSections` 最前面加導覽項目（T2）              |
| `packages/react/src/i18n.ts`                                                     | `sourceSetExplorer.open` / `.expand` / `.collapse` 三語（T3）                          |
| `packages/react/src/components/source-set-explorer/source-set-explorer.spec.tsx` | 新增 9 案（T4、T5）；R5 與 BUILD-064 兩案的預期加上導覽項目；`menuLabels` 三份合為一份 |
| `packages/react/README.md`                                                       | props 表加 `hideEntry`；新增〈Context menu〉（T6）                                     |
| `apps/react-demo/src/app/routes/source-set-explorer/volume-mock.ts`              | 加 `.git/`、`.env.example`、`skills/.cache/`（T7）                                     |
| `apps/react-demo/src/app/routes/source-set-explorer/source-set-explorer.tsx`     | 「hide . directories」開關與說明（T7）                                                 |

**公開 API 影響（§1.7）**：全部 additive。`SourceSetFileExplorerProps` 多一個選填 `hideEntry`；右鍵選單多一組內建導覽項目
（不傳任何 prop 就有），工具列不變。chat 版 `components/file-explorer/` 零變更。未 bump 版本。

---

## Execution Log

- 2026-10-01: BUILD task created from [asgard-sdk-pm#116](https://github.com/asgard-ai-platform/asgard-sdk-pm/issues/116)；#116 仍是 `To Do`、PM 未回兩題，經使用者決定先照 #116 提案與原型開工 (Status: `draft`).
- 2026-10-01: Plan confirmed; implementation started (Status: `draft → ready → in-progress`).
- 2026-10-01: 反向驗證（逐一改壞後跑 spec、再還原）：拿掉過濾 → 3 紅；空目錄判斷改回看原始清單 → 2 紅；拿掉導覽那一節 → 6 紅；
  導覽只在非唯讀時出現 → 2 紅；展開／收合標籤對調 → 2 紅。
- 2026-10-01: demo `/source-set-explorer`（zh-TW，寬 1010px／窄 318px 並排）：開「hide . directories」後兩邊的 `.git` 與
  `skills/.cache` 都消失、`.env.example` 仍在；一般模式右鍵檔案第一項「開啟」可開檔（有「切換為編輯」），右鍵資料夾「展開」→
  展開後變「收合」→ 收起；唯讀模式兩種寬度右鍵檔案為「開啟、下載、重新整理」，資料夾為「展開、下載（停用）、重新整理」，從右鍵
  開啟的檔案沒有「切換為編輯」；工具列兩種模式都與改前相同（一般 10 顆、唯讀 2 顆）。
- 2026-10-01: Build complete — lint（0 error；5 warnings 皆為既有、不在本 task 的檔案）/ format / typecheck / build / test
  （core 430、react 622）全綠 (Status: `in-progress → done`).
- 2026-10-02: 改編號 BUILD-086 → BUILD-087：同一天另一個 cycle（#484，freyr-pm#901 的 consent modal 替換）先以 BUILD-086 合入 `main`，由尚未合併的這邊讓號。
- 2026-10-02: 合入 `main`（`0.3.90`，含 #484）後重跑全部閘門：react 628 案全綠。
- 2026-10-02: 發版前 `/code-review`（high）找到 3 項需修、數項小問題，全部處理（細節見 REVIEW-087）：
  (1) 背景右鍵在已有選取時仍帶出導覽項目 → 選單記住是否開在列上，導覽項目只在列上出現；(2) 部分載入的目錄若載入到的
  全被隱藏，會顯示為空並吞掉 F-026 的「還有 N 項」→ 只在清單完整時顯示為空；(3) 選取的項目（或其上層）變成隱藏時仍是
  選取、工具列會作用在看不見的項目上 → 自動清掉選取（也涵蓋 `initialPath` 指進被隱藏處）。另：展開／收合合為一項、
  `menuSections` 的依賴改為實際用到的欄位、README `extraEntryActions` 一列的錯誤說明改正、測試檔剩餘兩處手寫選單讀取改用
  helper、補上右鍵分組與原型差異的決定。新增 4 案，反向驗證三項修正各自轉紅；閘門全綠（core 430、react 632）；demo 確認
  背景右鍵不帶「開啟」、選取 `.git` 後開啟隱藏刪除鈕即停用。
