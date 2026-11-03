# BUILD-099 Show file:// links as a copyable path instead of [blocked]

## Meta

- Task ID: `BUILD-099`
- Status: `done`
- Issue: [asgard-sindri-pm#350](https://github.com/asgard-ai-platform/asgard-sindri-pm/issues/350)（BUG-025；RD 評估與做法見 2026-11-03 [留言](https://github.com/asgard-ai-platform/asgard-sindri-pm/issues/350#issuecomment-6597785266)）
- Source spec: `asgard-sindri-pm` `tracking/asgard-sindri/bugs/BUG-025-agent-回覆中的-file-連結被渲染成-blocked-純文字-使用者拿不到可開的連結.md`（不在本 repo 的 submodule 裡，issue 與上述留言即規格）
- Complexity: `S`

---

## Brief

agent 回覆裡的 `[檔名](file://…)` markdown 連結，在 `@asgard-js/react` 的文字訊息裡被渲染成灰字「檔名 [blocked]」，看不到路徑、也點不開。原因在 streamdown 預設的 rehype 外掛鏈（`raw → katex → sanitize → harden`）：

1. `rehype-sanitize` 的預設 schema 只允許 `http`／`https`／`irc`／`ircs`／`mailto`／`xmpp` 協定的 href（`hast-util-sanitize/lib/schema.js:143`），`file:` 的 href 被整個拿掉。
2. `rehype-harden` 接著把沒有 href 的 `<a>` 換成 `<span title="Blocked URL: undefined">… [blocked]</span>`。就算 sanitize 放行，harden 也把 `file:` 寫死在永遠封鎖的清單（`rehype-harden/dist/index.js:60-63`），`allowedProtocols` 解不開。

瀏覽器本來就禁止從 http(s) 頁面導向 `file://`，所以就算做成 `<a>` 也點不開。這次改成：**`file://` 連結以「連結文字＋完整路徑＋複製按鈕」呈現**；網路磁碟路徑（`file://<host>/…`）複製出來轉成 Windows UNC（`\\host\share\…`），本機路徑（`file:///…`）照原樣複製 `file://` 網址。其他連結維持 harden 的過濾，行為不變。

做法：`StreamdownClient` 改傳自己的 `rehypePlugins`（streamdown 的 `rehypePlugins` prop 會整組覆蓋預設，和現有 `remarkPlugins` 同一個模式），把 sanitize 換成「預設 schema ＋ href 允許 `file`」，並在 sanitize 與 harden 之間插一個外掛，把 `file:` 的 `<a>` 轉成自訂元素 `asgard-file-link`（harden 只處理 `a`／`img`，不會碰它），再由 `streamdownComponents` 對應到新的 `FileLink` 元件。

注意：remark-rehype 會把 href 的非 ASCII 字元 percent-encode（`規格書.pdf` → `%E8%A6%8F…`），顯示與複製前要 decode。

**Already exists:** `text-template/streamdown-client.tsx`（只傳 `components`＋`remarkPlugins`）、`text-template/streamdown-components.tsx`（`A` 等元件對照表）、`file-explorer/icons.tsx` 的 `CopyIcon`／`CircleCheckIcon`、`i18n.ts` 的 `t(locale, key)` 與三語 catalog、`useAsgardTemplateContext().locale`、`text-template.spec.tsx`。

**依賴**：`@asgard-js/react` 新增直接依賴 `rehype-sanitize@^6.0.0`（取 `defaultSchema` 來擴充；版本與 streamdown 1.6.11 已帶進來的相同，不多裝一份）。

**不在範圍**：`utils/uri-validation.ts`（references 卡片的 `window.open`）——這次不做「點擊開啟」，不碰它。

---

## Relevant Rules

Distilled from `FRONTEND_RULE_COMMON.md`; builder reads this table instead of the full corpus.

| §    | Rule (summary)                                                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------------- |
| §1.1 | No `any` / `as any` — use precise types, generics, or `unknown` + narrowing                                    |
| §1.2 | No `@ts-ignore` / `eslint-disable` to bypass type or lint errors                                               |
| §1.3 | No `console.log` left in library code (gate behind an explicit debug option if needed)                         |
| §1.5 | Every RxJS subscription / EventSource / timer has teardown (`takeUntil` / `unsubscribe` / `useEffect` cleanup) |
| §1.7 | No breaking public-API change without `@deprecated` transition                                                 |
| §3.1 | Exported functions / methods declare explicit return types                                                     |
| §4.1 | React component props fully typed (no `any`)                                                                   |
| §4.2 | No hardcoded color values in components — theme via CSS variables / theme context                              |
| §4.4 | `react` / `react-dom` stay peerDependencies (not bundled)                                                      |
| §5   | `@asgard-js/core` and `@asgard-js/react` keep the same version number                                          |
| §6   | After implementation: extract repeated logic (≥2×), duplicate types, repeated JSX (≥3×)                        |
| §7   | No `setTimeout` mock delays, no `console.log`, no dead commented code, no untracked TODO / FIXME               |

---

## Acceptance Criteria

- `R1` When a bot message contains a markdown link whose href uses the `file:` protocol, the system shall render the link text, the full path, and a copy button, and shall not render the text `[blocked]`. → T2, T3
- `R2` When the `file:` link has a host (`file://192.168.0.10/share/規格書.pdf`), the system shall display and copy the path as a Windows UNC path (`\\192.168.0.10\share\規格書.pdf`), with percent-encoded characters decoded. → T1, T4
- `R3` When the `file:` link has no host or the host is `localhost` (`file:///tmp/test.txt`), the system shall display and copy the decoded `file://` URL unchanged otherwise (`file:///tmp/test.txt`). → T1, T4
- `R4` When the user clicks the copy button, the system shall write the R2/R3 path to the clipboard and show a localized "copied" state (en-US / ja-JP / zh-TW) that reverts after a short delay; the timer is cleared on unmount. → T3, T4
- `R5` When a message contains `http`/`https`/`mailto` links, the system shall render them exactly as before (`<a target="_blank" rel="noopener noreferrer">`); and when it contains `javascript:` or `data:` links, the system shall still render them as blocked. → T2, T4
- `R6` (Smoke check) When the developer runs `npm run build:core && npm run build:react` and renders the BUG-025 sample (two `file://` links + one https link) via Vitest and the react-demo (`npm run serve:react-demo -- -- --port 5101`, `/markdown-file-links`), the system shall show R1–R5 behavior with no build errors. → T5

---

## Implementation Tasks

- [x] T1 (R2, R3): `text-template/file-link.ts` — `toFileLinkPath`（UNC／原樣、`decodeURI`，壞掉的 escape 保留原字串）＋ `isFileHref`；`file-link.spec.ts`。
- [x] T2 (R1, R5): `text-template/rehype-file-links.ts` — `rehypeFileLinks` 把 `a[href^="file:"]` 轉成 `asgard-file-link`（`dataHref` → React 收到 `data-href`）；`withFileLinks(defaultRehypePlugins)` 依原順序保留預設外掛，`sanitize` 換成 href 多允許 `file` 的 schema，`harden` 前插 `rehypeFileLinks`。`streamdown-client.tsx` 傳 `rehypePlugins`；`packages/react/package.json` 加 `rehype-sanitize`。
- [x] T3 (R1, R4): `streamdown-components.tsx` 的 `FileLink`：連結文字＋空白＋路徑（沿用 `.code` 樣式，`overflow-wrap: anywhere`、`user-select: all`）＋複製按鈕（`CopyIcon` → `CircleCheckIcon`，1.5s 後還原，`useEffect` cleanup 清 timer）；`i18n.ts` 三語 `fileLink.copy` / `fileLink.copied`；autolink（文字即網址）只顯示一次路徑。
- [x] T4 (R2–R5): 新檔 `streamdown-file-links.spec.tsx`（走真正的 Streamdown pipeline，而不是放進 `text-template.spec.tsx`：那支用 `renderToStaticMarkup`，Streamdown 是 `useEffect` 動態載入，靜態渲染拿不到）。同一份 spec 在改動前跑：file:// 三條失敗、https／javascript: 那條通過。
- [x] T5-1: lint（0 error，5 個既有 warning 不在本次檔案）、format、typecheck（core ＋ react ＋ demo）、build core／react、test（core 458、react 764）全綠。
- [x] T5 (R6): react-demo 新增 `/markdown-file-links`（不是 `/templates`：該頁沒有 markdown 樣本），full-bleed 與 375×640 並排、locale 與 Default／Light 主題切換。Playwright 實測見 REVIEW-099 §3。

---

## Coverage

Use Cases: R1, R2, R3, R4, R5, R6

Files:

- `packages/react/src/components/templates/text-template/file-link.ts`（新）
- `packages/react/src/components/templates/text-template/file-link.spec.ts`（新）
- `packages/react/src/components/templates/text-template/rehype-file-links.ts`（新）
- `packages/react/src/components/templates/text-template/streamdown-file-links.spec.tsx`（新）
- `packages/react/src/components/templates/text-template/streamdown-client.tsx`
- `packages/react/src/components/templates/text-template/streamdown-components.tsx`
- `packages/react/src/components/templates/text-template/streamdown.module.scss`
- `packages/react/src/i18n.ts`
- `packages/react/package.json`、`package-lock.json`（`rehype-sanitize`）
- `apps/react-demo/src/app/routes/markdown-file-links/*`（新）、`apps/react-demo/src/app/app.tsx`、`apps/react-demo/src/app/components/layout/layout.tsx`

---

## Execution Log / Change Log

- 2026-11-03: BUILD task created from asgard-sindri-pm#350 (BUG-025) after the RD evaluation comment (Status: `draft`).
- 2026-11-03: Spec confirmed; implementation started (Status: `draft → ready → in-progress`).
- 2026-11-03: 窄版實測發現連結文字與路徑之間只有 margin、沒有空白字元，檔名與路徑開頭被當成同一個字，整段提早換行；改為真正的空白。
- 2026-11-03: All R# verified; lint/format/typecheck/build/test green; react-demo smoke check passed (Status: `in-progress → done`).
