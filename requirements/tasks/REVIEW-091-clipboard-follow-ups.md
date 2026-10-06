# REVIEW-091 Review: keep the FileExplorer clipboard stable and attributed

## Meta

- Task ID: `REVIEW-091`
- Status: `done`
- BUILD Task: `BUILD-091`
- Reviewed commit: `128cff37`
- Reviewed branch: `fix/482-clipboard-follow-ups`

---

## §1 Static Code Review

Scope is `BUILD-091 ## Coverage`（`file-explorer-context.tsx`、`file-explorer-tree.tsx`、新增的 `clipboard-follow-ups.spec.tsx`）。
`lint` / `format` / `typecheck` / `build` / `test` run project-wide.

### §1.1 Checklist

| Check item                                           | Rule                         | Result |
| ---------------------------------------------------- | ---------------------------- | ------ |
| `any` / `as any`                                     | FRONTEND_RULE_COMMON §1.1    | ✅     |
| `@ts-ignore` / `eslint-disable`                      | FRONTEND_RULE_COMMON §1.2    | ✅     |
| `console.log`                                        | FRONTEND_RULE_COMMON §1.3 §7 | ✅     |
| Hardcoded key / endpoint / namespace                 | FRONTEND_RULE_COMMON §1.4    | ✅ n/a |
| Teardown for subscriptions / listeners / timers      | FRONTEND_RULE_COMMON §1.5    | ✅ n/a |
| react → core through the public entry only           | FRONTEND_RULE_COMMON §1.6    | ✅     |
| No breaking public-API change                        | FRONTEND_RULE_COMMON §1.7    | ✅ ¹   |
| Explicit return types on exported functions          | FRONTEND_RULE_COMMON §3.1    | ✅     |
| Component props fully typed                          | FRONTEND_RULE_COMMON §4.1    | ✅     |
| No hardcoded colour values                           | FRONTEND_RULE_COMMON §4.2    | ✅ ²   |
| UI verified at both widths                           | FRONTEND_RULE_COMMON §4.3+   | ✅     |
| core and react share a version number                | FRONTEND_RULE_COMMON §5      | ✅ ³   |
| `setTimeout` mock, dead code, untracked TODO / FIXME | FRONTEND_RULE_COMMON §7      | ✅     |
| No render loop from the fill effect                  | —                            | ✅ ⁴   |

¹ `Clipboard`、`setClipboard` 的型別不變；`setClipboard` 變成穩定參照、帶 `sourceId` 的物件不再被複製，都是消費端只會受益的變更。
² 命中 6 處，皆為測試檔的票號 `#482`／`#480`。
³ 未 bump。
⁴ 補完 `sourceId` 後條件 `clipboard.sourceId === undefined` 不再成立，effect 只多跑一次。

### §1.2 Mechanical grep（`main..HEAD` 新增行）

```text
[any]              0
[ignore]           0
[console]          0
[setTimeout]       0
[TODO/FIXME]       0
[color]            6 — 全為票號
[react → core/src] 0
```

### §1.4 Build / Lint / Format

```text
lint:packages: PASS — 0 errors；5 warnings 皆為既有
format:check:  PASS
typecheck:     PASS — core + react + react-demo
build:         PASS — core, react
test:          PASS — core 448、react 695（新增 6 案）
```

---

## §3 Functional Validation

| R#   | Result | Evidence                                                                                                                      |
| ---- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `R1` | ✅     | spec：切 B、切回 A 後 `setClipboard` 只有一個參照，依賴它的 effect 只跑一次；修正前跑了 3 次                                  |
| `R2` | ✅     | spec：帶 `sourceId` 的物件 `===` 原樣回傳；修正前是展開後的新物件                                                             |
| `R3` | ✅     | spec：同一個 handler `selectSource('b')` + `setClipboard` 記到 `b`（修正前記到 `a`）；分開的「在 a 設、之後切到 b」仍記在 `a` |
| `R4` | ✅     | spec：同一來源拿掉 `move` 後不再淡化、也不能貼；有 `move` 時照常淡化                                                          |
| `R5` | ✅     | 閘門全綠；demo #476 雙來源在 987px／343px 各自走過剪下 → 切唯讀 → 切回 → 貼進 `src`，行為與 #476 一致，無水平溢出             |

消費端：Heimdall 的 `new-chat-assets-panel.tsx` 只讀 `clipboard.entry.path`、effect 依賴 `setClipboard`，參照穩定後切來源不再重跑；Sindri 沒有用到剪貼簿。

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

- 剪貼簿剛設好的那一次 commit，`sourceId` 還是 `undefined`，要等 layout effect 補上。這段期間 `canPaste` 為 false，畫面在 paint 之前就補好；但 host 對 `clipboard` 下的 `useEffect` 可能先看到一次未補的值。現有消費端不看 `sourceId`。
- 設定剪貼簿時若沒有任何 active source，`sourceId` 會留空，等之後第一個 active source 出現才補上。沒有來源時拿不到可剪下的項目，實務上碰不到。
- #482 第 1 項（來源 id 重複使用／來源被移除時清空）不在本 task，仍開著。

---

## Execution Log

- 2026-10-06: REVIEW task created, paired with BUILD-091 (Status: `draft`).
- 2026-10-06: §1 — 14 項 ✅、0 違規；§3 — R1–R5 全 Pass；3 Minor 不改 (Status: `ready → in-progress → done`).
