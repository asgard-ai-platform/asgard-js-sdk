# REVIEW-098 Review: recording formats in the default document list

## Meta

- Task ID: `REVIEW-098`
- Status: `done`
- BUILD Task: `BUILD-098`
- Reviewed commit: `c37ecd96`
- Reviewed branch: `feat/496-audio-document-types`

---

## §1 Static Code Review

Scope is `BUILD-098 ## Coverage`（react `utils/file-validation.ts` 與新增的 spec）. `lint` / `format` / `typecheck` / `build` / `test` run project-wide.

### §1.1 Checklist

| Check item                                           | Rule                         | Result |
| ---------------------------------------------------- | ---------------------------- | ------ |
| `any` / `as any`                                     | FRONTEND_RULE_COMMON §1.1    | ✅     |
| `@ts-ignore` / `eslint-disable`                      | FRONTEND_RULE_COMMON §1.2    | ✅     |
| `console.log`                                        | FRONTEND_RULE_COMMON §1.3 §7 | ✅     |
| No hardcoded API key / endpoint / namespace          | FRONTEND_RULE_COMMON §1.4    | ✅     |
| Teardown for subscriptions / listeners / timers      | FRONTEND_RULE_COMMON §1.5    | ✅ ¹   |
| core has no react / DOM import                       | FRONTEND_RULE_COMMON §1.6    | ✅     |
| react → core through the public entry only           | FRONTEND_RULE_COMMON §1.6    | ✅     |
| No breaking public-API change                        | FRONTEND_RULE_COMMON §1.7    | ✅ ²   |
| New public API exported from the entry               | FRONTEND_RULE_COMMON §2.2    | ✅ ²   |
| `botProviderEndpoint`, not `endpoint`                | FRONTEND_RULE_COMMON §2.4    | ✅     |
| Explicit return types on exported functions          | FRONTEND_RULE_COMMON §3.1    | ✅     |
| Shared types centralized, no duplicates              | FRONTEND_RULE_COMMON §3.2    | ✅     |
| React props fully typed                              | FRONTEND_RULE_COMMON §4.1    | ✅     |
| No hardcoded colour values                           | FRONTEND_RULE_COMMON §4.2    | ✅ ³   |
| UI verified at both widths                           | FRONTEND_RULE_COMMON §4.3+   | ✅     |
| core and react share a version number                | FRONTEND_RULE_COMMON §5      | ✅ ⁴   |
| Repeated logic extracted (≥2×)                       | FRONTEND_RULE_COMMON §6      | ✅     |
| `setTimeout` mock, dead code, untracked TODO / FIXME | FRONTEND_RULE_COMMON §7      | ✅     |

¹ 沒有新增訂閱、listener 或 timer。
² 沒有新 API。改的是兩份既有的預設清單（`SUPPORTED_DOCUMENT_TYPES`、`SUPPORTED_DOCUMENT_EXTENSIONS`）只增不減；它們不在 react 的公開進入點。
³ 色值 grep 的兩筆命中是註解裡的 issue 編號 `#496`，不是色值。
⁴ 皆為 `0.3.96`，未 bump。

### §1.2 Mechanical grep

Run over the lines the branch adds relative to `main`.

```text
any / as any            : (empty)
ts-ignore / eslint-dis. : (empty)
console.log             : (empty)
core → react            : (empty)
react → core/src        : (empty)
colour (added)          : 2 — both the comment text "#496"（見 ³）
setTimeout              : (empty)
TODO / FIXME            : (empty)
```

### §1.4 Build / Lint / Format

```text
lint:packages: PASS — 0 errors；5 warnings 皆為既有
format:check:  PASS
typecheck:     PASS — core + react + react-demo
build:         PASS — core, react
test:          PASS — core 458、react 796（+41：file-validation.spec.ts）
```

---

## §3 Functional Validation

驗證手段：Vitest（jsdom；新 spec 先寫，41 案中 34 案在改清單前為紅）＋ ffmpeg 產的真錄音檔，在 react-demo（port 5100）以 Playwright 實際挑檔上傳：`/fullscreen` 連 dev bot provider 拿真的 blobId（Chromium、Playwright WebKit 26.0 各一輪，用路徑挑檔，`file.type` 由瀏覽器自己判定）；寬度看 `/fullscreen`（1280px 全寬）與 `/composer` 的 360px 窄版 shell。

| R#   | Result | Evidence                                                                                                                                                                                                                                         |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `R1` | ✅     | spec：表格 15 個 MIME 各一案，副檔名用 `.bin` 仍通過。瀏覽器實際回報：Chromium wav `audio/wav`、m4a `audio/x-m4a`、ogg `audio/ogg`、flac `audio/flac`；WebKit m4a `audio/x-m4a`、wav `audio/x-wav`、aac `audio/aac`、aiff `audio/x-aiff`，皆通過 |
| `R2` | ✅     | spec：10 個副檔名 × MIME `''`／`application/octet-stream` 各一案，另有大寫副檔名一案。瀏覽器：WebKit 對 `.weba` 回報空 MIME，靠副檔名通過並上傳                                                                                                  |
| `R3` | ✅     | spec：預設 `accept` 含全部 MIME 與副檔名。demo：`/fullscreen` 的 `accept` 屬性實際含 `audio/x-m4a`、`.m4a`、`.weba` 等全部項目                                                                                                                   |
| `R4` | ✅     | spec：`setup.exe`、`tune.mid`（`audio/midi`）被擋且錯誤訊息不變；`allowedDocumentMimeTypes` 仍只比對 MIME、`accept` 只含傳入值。瀏覽器：WebKit 挑 `tune.mid` 跳出「tune.mid: 不支援的檔案格式。請選擇 PDF、Office 文件、音訊、影片或文字檔案。」 |
| `R5` | ✅     | 見 §1.4。Chromium：wav／m4a／ogg／flac 各拿到 blobId（HTTP 200）；WebKit：m4a／wav／aac／aiff／weba 各拿到 blobId；同一個 m4a 兩個瀏覽器都通過。全寬（`/fullscreen`）四個音檔 chip 排一列、窄版（360px）排兩列，檔名都沒截斷，頁面無水平溢出     |

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

1. 後端（edge server）依收到的 MIME 決定 blob 的 `fileType`：`audio/wav`、`audio/x-m4a`、`audio/ogg` 回 `AUDIO`；`audio/x-wav`、`audio/flac`、`audio/aac`、`audio/x-aiff`、`application/octet-stream` 回 `BINARY`。上傳都成功，但 Direct 模式會不會把 `BINARY` 的 blob 交給模型，SDK 這邊看不到。屬後端，不在本票範圍，留給開票人判斷。

---

## Execution Log

- 2026-11-03: REVIEW task created, paired with BUILD-098 (Status: `draft`).
- 2026-11-03: BUILD-098 done (Status: `draft → ready`).
- 2026-11-03: §1 18/18、§3 R1–R5 全 Pass；0 Critical、0 Important、1 Minor（後端 `fileType`，不在範圍） (Status: `ready → in-progress → done`).
