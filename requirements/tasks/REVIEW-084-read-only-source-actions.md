# REVIEW-084 Review: gate clipboard and source editing on the source's providers

## Meta

- Task ID: `REVIEW-084`
- Status: `done`
- BUILD Task: `BUILD-084`
- Reviewed commit: `c8ff9ed3`
- Reviewed branch: `fix/476-read-only-source-actions`

---

## §1 Static Code Review

Scope is `BUILD-084 ## Coverage` (four react source files, two specs, the react README, one demo route; core untouched).
`typecheck` / `lint` / `build` run project-wide.

### §1.1 Checklist

| Check item                                               | Rule                           | Result |
| -------------------------------------------------------- | ------------------------------ | ------ |
| `any` / `as any`                                         | FRONTEND_RULE_COMMON §1.1      | ✅     |
| `@ts-ignore` / `eslint-disable`                          | FRONTEND_RULE_COMMON §1.2      | ✅     |
| `console.log`                                            | FRONTEND_RULE_COMMON §1.3 §7   | ✅     |
| Hardcoded key / endpoint / namespace                     | FRONTEND_RULE_COMMON §1.4      | ✅ n/a |
| Teardown for subscriptions / listeners / timers          | FRONTEND_RULE_COMMON §1.5      | ✅ ¹   |
| react → core through the public entry only               | FRONTEND_RULE_COMMON §1.6      | ✅     |
| core free of react / react-dom / DOM                     | FRONTEND_RULE_COMMON §1.6 §2.1 | ✅ n/a |
| **No breaking public-API change**                        | FRONTEND_RULE_COMMON §1.7      | ✅ ²   |
| New public type exported from the package entry          | FRONTEND_RULE_COMMON §2.2      | ✅ ³   |
| Explicit return types on exported functions              | FRONTEND_RULE_COMMON §3.1      | ✅     |
| Shared types centralized; no duplicates                  | FRONTEND_RULE_COMMON §3.2      | ✅     |
| Component props fully typed                              | FRONTEND_RULE_COMMON §4.1      | ✅     |
| No hardcoded colour values                               | FRONTEND_RULE_COMMON §4.2      | ✅ ⁴   |
| core and react share a version number                    | FRONTEND_RULE_COMMON §5        | ✅ ⁵   |
| Repeated logic extracted (≥2×)                           | FRONTEND_RULE_COMMON §6        | ✅ ⁶   |
| `setTimeout` mock, dead code, untracked TODO / FIXME     | FRONTEND_RULE_COMMON §7        | ✅ ¹   |
| `setClipboard({ op, entry })` 既有呼叫照樣編譯、照樣運作 | #476                           | ✅ ⁷   |
| 不動 `SourceSetFileExplorer`                             | #476                           | ✅     |

¹ `setTimeout` 兩處命中：`file-view.tsx` 既有的 400ms 存檔 debounce（unmount 時 `clearTimeout`，未改動）、新 spec 的
`settle()` 等待（與 `paste-dedupe.spec.tsx` 既有寫法相同，用來斷言「沒有呼叫」）。皆非模擬延遲。
² `Clipboard.sourceId` 選填；`FileExplorerContextValue` 多 `canCopy`／`canCut`／`canPaste` 三個欄位，只有自行實作整個
context value 的呼叫端會受影響（與 BUG-009 加 `clearSelection` 同一類 additive）。行為變更只落在「沒給對應 provider」的 host。
³ 兩個型別都經既有的 `FileExplorerContextValue` 導出，新欄位隨之露出。
⁴ 變更中唯一的 `#xxx` 命中是註解與測試名稱裡的票號 `#476`；demo 沿用既有 inline style 慣例，未新增色值。
⁵ 未 bump 版本（兩者仍為 `0.3.87`）。
⁶ 三個入口共用 context 上的 `canCopy`／`canCut`／`canPaste`，工具列與兩種右鍵選單不再各自判斷。
⁷ `read-only-source-actions.spec.tsx` R5 一案以 `setClipboard({ op: 'cut', entry })` 走完貼上。

### §1.2 Mechanical grep

```text
[any]              (empty)
[ignore]           (empty)
[console]          (empty)
[setTimeout]       file-view.tsx:127,131（既有 debounce）；read-only-source-actions.spec.tsx:112（settle）  ← 見 ¹
[TODO/FIXME]       (empty)
[core → react]     (empty)
[react → core/src] (empty)
[color, react]     僅票號 #476 誤報
```

### §1.4 Build / Lint / Format

```text
lint:packages: PASS — core 0；react 5 warnings（皆為 main 既有，file-view.tsx 的 scheduleSave deps 警告行號隨新增兩行順移）
format:check:  PASS
typecheck:     PASS — core + react + react-demo
build:         PASS — core, react
```

---

## §3 Functional Validation

| R#   | Result | Evidence                                                                                                                                                                                                                                     |
| ---- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `R1` | ✅     | spec：無 `copy`／`move` 時工具列、檔案選單、資料夾選單的複製／剪下皆停用；只給 `copy` 時複製可用、剪下停用。demo 寬窄兩面板切到唯讀來源，工具列與檔案／資料夾選單的複製、剪下皆停用                                                          |
| `R2` | ✅     | spec：跨來源時工具列、資料夾選單、空白處選單的貼上皆停用；剪下但來源只有 `copy` 時停用。demo 唯讀來源三處貼上皆停用                                                                                                                          |
| `R3` | ✅     | spec：跨來源與「剪下但無 `move`」兩案直接呼叫 `actPaste`，`copy`／`move` 皆未被呼叫                                                                                                                                                          |
| `R4` | ✅     | spec：往返後可貼上且以原來源呼叫；另一來源同路徑不變淡、標籤不帶檔名。demo：可寫來源剪下 → 唯讀來源貼上標籤為「貼上」→ 切回後為「貼上「notes.txt」」、仍變淡，貼到 `src` 成功（`/home/user/project/src/notes.txt`）                          |
| `R5` | ✅     | spec：`setClipboard({ op: 'cut', entry })` 不帶來源，貼上以 active source 呼叫 `move`                                                                                                                                                        |
| `R6` | ✅     | spec 三案（改動前皆失敗）：無 `onSaveFile` 時無切換鈕且 `contenteditable=false`；markdown 維持渲染；編輯中拿掉 provider 退回唯讀。demo：唯讀來源開檔只有「重新載入檔案」「下載」、編輯器 `contenteditable=false`；可寫來源仍有「切換為編輯」 |
| `R7` | ✅     | lint / format / typecheck / build 全綠；Vitest core 430、react 606；demo 寬（full-bleed）與窄（343px）兩個面板各走一輪，結果一致                                                                                                             |

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

- `file-view.tsx`：`onSaveFile` 被拿掉後又回來時，檢視會回到先前選的 edit 模式（`chosenMode` 保留著）。本票現場是切換來源，
  各來源的開檔狀態本來就分開，走不到這條；只有 host 在同一個來源上來回切換 provider 才會發生。不擋。

---

## Execution Log

- 2026-09-24: REVIEW task created, paired with BUILD-084 (Status: `draft`).
- 2026-09-24: BUILD-084 done (Status: `draft → ready`).
- 2026-09-24: §1 — 18 項 ✅、0 違規；§3 — R1–R7 全 Pass；1 Minor (Status: `ready → in-progress → done`).
