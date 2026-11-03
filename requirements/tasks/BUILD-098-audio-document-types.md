# BUILD-098 Accept common recording formats in the default document list

## Meta

- Task ID: `BUILD-098`
- Status: `done`
- Issue: [asgard-js-sdk#496](https://github.com/asgard-ai-platform/asgard-js-sdk/issues/496)（issue 開在本 repo，無 PM tracking spec；issue body 即規格）
- Source spec: issue body〈希望的行為〉的格式表與〈驗收〉四條。對齊對象是 asgard-core Direct 模式接受的音檔清單（asgard-ai-platform/asgard-core#426）。
- Complexity: `S`

---

## Brief

文件上傳的預設清單只收一種音檔（`audio/mpeg`／`.mp3`），所以 wav、m4a、ogg、flac 這些錄音格式在檔案選擇器就被擋下，送不到 core 的 Direct 模式做語音轉文字。

做法：在 `packages/react/src/utils/file-validation.ts` 的 `SUPPORTED_DOCUMENT_TYPES` 與 `SUPPORTED_DOCUMENT_EXTENSIONS` 補上 issue 表格列的格式，MIME 連同各瀏覽器實際回報的別名一起列（例：m4a 在 macOS 上常是 `audio/x-m4a`）。檔案選擇器的 `accept`（`use-attachment-upload.ts`）與 `validateDocumentFile` 都讀這兩份清單，不必另外改。

**不動**：`allowedDocumentMimeTypes` 的覆寫語意（有傳就只比對 MIME）、`MAX_FILE_SIZE`（20 MB，與 core Direct 模式的附件合計上限一致）、錯誤訊息（已寫「音訊」）。react README 沒有列出預設清單，不用改。

**Already exists:** 兩份預設清單、預設模式的副檔名 fallback、`use-attachment-upload.ts` 的 `accept` 組裝、demo `/features` 的文件上傳（連 dev 的 bot provider，上傳會拿到真的 blobId）。

---

## Relevant Rules

Distilled from `FRONTEND_RULE_COMMON.md`; builder reads this table instead of the full corpus.

| §    | Rule (summary)                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------- |
| §1.1 | No `any` / `as any` — use precise types, generics, or `unknown` + narrowing                                               |
| §1.2 | No `@ts-ignore` / `eslint-disable` to bypass type or lint errors                                                          |
| §1.3 | No `console.log` left in library code (gate behind an explicit debug option if needed)                                    |
| §1.4 | No hardcoded API key / endpoint / namespace — pass via `config`                                                           |
| §1.5 | Every RxJS subscription / EventSource / timer has teardown (`takeUntil` / `unsubscribe` / `useEffect` cleanup)            |
| §1.6 | `@asgard-js/core` never imports `react` / `react-dom` / DOM; react imports core via its public entry only (no `core/src`) |
| §1.7 | No breaking public-API change without `@deprecated` transition                                                            |
| §2.2 | New public types / functions / components exported from the package entry with explicit `export type`                     |
| §2.3 | Template type (`core/src/types/sse-response.ts`) + enum (`core/src/constants/enum.ts`) exist before the react component   |
| §2.4 | Use `botProviderEndpoint`, not the deprecated `endpoint`                                                                  |
| §3.1 | Exported functions / methods declare explicit return types                                                                |
| §3.2 | Shared types centralized in `core/src/types/`; no duplicate interfaces across files                                       |
| §4.1 | React component props fully typed (no `any`)                                                                              |
| §4.2 | No hardcoded color values in components — theme via CSS variables / theme context                                         |
| §4.4 | `react` / `react-dom` stay peerDependencies (not bundled)                                                                 |
| §5   | `@asgard-js/core` and `@asgard-js/react` keep the same version number                                                     |
| §6   | After implementation: extract repeated logic (≥2×), duplicate types, repeated JSX (≥3×)                                   |
| §7   | No `setTimeout` mock delays, no `console.log`, no dead commented code, no untracked TODO / FIXME                          |

---

## Acceptance Criteria

EARS form: `When <event/condition>[, while <state>], the system shall <observable behavior>`.

格式表（issue〈希望的行為〉）：

| 格式      | MIME                                     | 副檔名          |
| --------- | ---------------------------------------- | --------------- |
| WAV       | `audio/wav`、`audio/x-wav`、`audio/wave` | `.wav`          |
| MP3       | `audio/mpeg`（已有）、`audio/mp3`        | `.mp3`（已有）  |
| M4A       | `audio/mp4`、`audio/x-m4a`、`audio/m4a`  | `.m4a`          |
| AAC       | `audio/aac`                              | `.aac`          |
| Ogg       | `audio/ogg`                              | `.ogg`、`.oga`  |
| FLAC      | `audio/flac`、`audio/x-flac`             | `.flac`         |
| AIFF      | `audio/aiff`、`audio/x-aiff`             | `.aif`、`.aiff` |
| WebM 音訊 | `audio/webm`                             | `.weba`         |

- `R1` When `allowedDocumentMimeTypes` is not given and a file's MIME is any MIME in the table, `validateDocumentFile` shall accept it, whatever its extension. → T1, T2
- `R2` When `allowedDocumentMimeTypes` is not given and a file's MIME is empty or unrecognised but its extension is in the table, `validateDocumentFile` shall accept it. → T1, T2
- `R3` When document upload is on without `allowedDocumentMimeTypes`, the file input's `accept` shall contain every MIME and extension in the table. → T1, T2
- `R4` When a file matches neither list (e.g. `.exe`, `audio/midi` + `.mid`), it shall still be rejected with the existing message; and when `allowedDocumentMimeTypes` is given, validation shall stay MIME-only against that list. → T1
- `R5` When the developer runs lint / format / typecheck / build / `test:packages` and, in the react-demo `/features` against the dev bot provider, picks real `.wav`, `.m4a`, `.ogg` and `.flac` files, each shall pass the picker and validation and upload to a `blobId`; the same `.m4a` shall pass in Chromium (`audio/x-m4a`) and in Playwright WebKit. → T3, T4

---

## Implementation Tasks

- [x] T1 (R1–R4): Vitest first — new `file-validation.spec.ts`: one MIME hit per table MIME, one extension-only hit per table extension (MIME `''` and `application/octet-stream`), unsupported `.exe` / `audio/midi` rejected, `allowedDocumentMimeTypes` still MIME-only; plus an `accept` case in `use-attachment-upload.spec.ts`. Confirm the new-format cases fail before T2.
- [x] T2 (R1–R3): `file-validation.ts` — add the table's MIME types and extensions to the two default lists.
- [x] T3-1: Run `npm run lint:packages` + `npm run format:check` + `npm run typecheck` + `npm run build:core && npm run build:react` + `npm run test:packages`
- [x] T3 (R5): Generate short test recordings with ffmpeg (outside the repo); in the react-demo `/features` (port 5100) upload each against the dev endpoint and confirm a `blobId`; read `file.type` the browser reports for each; repeat the `.m4a` in Playwright WebKit. Walk at both the narrow and the full-bleed width. Screenshots go to the local verification handover, not the repo.
- [x] T4: Fill Coverage and the Execution Log.

---

## Coverage

Use Cases: R1, R2, R3, R4, R5

Files:

- `packages/react/src/utils/file-validation.ts`（react）— `SUPPORTED_DOCUMENT_TYPES` 補 14 個音訊 MIME（含別名）、`SUPPORTED_DOCUMENT_EXTENSIONS` 補 9 個副檔名
- `packages/react/src/utils/file-validation.spec.ts`（react，新增）— R1–R4，41 案（含 `accept` 兩案）

---

## Execution Log / Change Log

- 2026-11-03: BUILD task created from [asgard-js-sdk#496](https://github.com/asgard-ai-platform/asgard-js-sdk/issues/496) (Status: `draft`).
- 2026-11-03: Plan confirmed (Status: `draft → ready → in-progress`).
- 2026-11-03: `file-validation.spec.ts` written first: 34 of 41 cases fail before the list change (every new MIME, every new extension, the default `accept`); the 7 that pass are mp3, the two rejections, MIME-only mode and the constrained `accept`. All 41 pass after. Full gate green (core 458, react 796; lint 0 errors; typecheck incl. demo; build) (Status: `in-progress → done`).
- 2026-11-03: Real uploads with ffmpeg-made recordings. Chromium `/fullscreen` against the dev bot provider: wav / m4a / ogg / flac each get a `blobId`; Chromium reports m4a as `audio/x-m4a`. Playwright WebKit 26.0: m4a `audio/x-m4a`, wav `audio/x-wav`, aac `audio/aac`, aiff `audio/x-aiff` all upload; `.weba` arrives with an empty MIME and passes through the extension fallback; `tune.mid` (`audio/midi`) is rejected with the existing message. `/composer` at 1600px and the 360px shell: four audio chips, no overflow.
- 2026-11-03: Observed, not in scope: the edge server sets the blob's `fileType` from the MIME it receives — `audio/wav`, `audio/x-m4a`, `audio/ogg` come back `AUDIO`, while `audio/x-wav`, `audio/flac`, `audio/aac`, `audio/x-aiff` and `application/octet-stream` come back `BINARY`. Whether Direct mode still hands a `BINARY` blob to the model is a backend question; left for the issue owner, not worked around here.
