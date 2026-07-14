# BUILD-016 Sandbox Files component `<SandboxFiles>` (sandbox Files/Browser, part 3 — MVP)

## Meta

- Task ID: `BUILD-016`
- Status: `done`
- Source: user direction (2026-07-14). UI authority = Sindri prototype `FilesPanel`; data = `asgard-core` sandbox fs APIs.
- Complexity: `L` (MVP subset)
- Part: **3 of 3** (Foundation ✅ → Browser ✅ → **Files**). Stacks on BUILD-015.

## Brief

Render the channel's sandbox filesystem as an SDK component. `<SandboxFiles>` reads the sandbox name (`useSandboxName()`), lazily lists directories (`client.listSandboxFiles()` → `GET /sandbox/{name}/fs/list?path=`, one dir per expand) into a tree, and shows a selected file's text (`client.readSandboxFile()` → `GET .../fs/file?path=`, raw octet-stream → text). UI adapted from the Sindri prototype `FilesPanel` (tree + viewer subset). **MVP** — upload / download / edit (PUT) / search / rich preview are follow-ups. Renders a placeholder before the sandbox exists; owns its surface so it's readable on any host background.

## Acceptance Criteria

- `R1` `listSandboxFiles(name, path)` GETs `/sandbox/{name}/fs/list?path=` → `{ entries, truncated }` (defaults when sparse); `readSandboxFile(name, path)` GETs `/sandbox/{name}/fs/file?path=` → text; failures throw `HttpError`. → T1, T4
- `R2` `<SandboxFiles>` reads `useSandboxName()`; lists the root and shows a tree; directories lazy-load their children on first expand. → T2, T5
- `R3` clicking a file loads and shows its content in a viewer (loading / error / content states). → T2, T5
- `R4` before a sandbox exists → placeholder; the component provides its own surface (readable on any host bg). → T2, T5
- `R5` (Smoke) build + `/multi-panel` Files panel shows the mock tree + a file's content; tests green. → T3, T5

## Implementation Tasks

- [x] T1 (R1): `client.ts` `listSandboxFiles` / `readSandboxFile` + `sandboxBase`/`sandboxHeaders` helpers; `types/client.ts` `SandboxFsEntry` / `SandboxFsListResult` + interface methods.
- [x] T2 (R2-R4): `sandbox-files/{sandbox-files.tsx,.module.scss,index.ts}` — lazy tree + viewer + own surface; export from `components/index.ts`.
- [x] T3 (R5): `sse-mock.ts` `handleMockSandbox` fs/list + fs/file (mock tree + contents); `/multi-panel` Files panel via `<SandboxFiles>`.
- [x] T4 (R1): `client.spec.ts` +4 (fs/list path + parse + defaults, fs/file text, error).
- [x] T5 (R5): build + browser verify (tree lazy-expand + file viewer).

## Coverage

Files: `packages/core/src/lib/client.ts`, `types/client.ts`, `lib/client.spec.ts`; `packages/react/src/components/chatbot/sandbox-files/*`, `sandbox-browser/*.module.scss` (surface), `components/index.ts`; `apps/react-demo/src/mock-server/sse-mock.ts`, `routes/multi-panel/*`.

Verification: build:core + build:react ✅ · core **53/53** (client.spec +4) ✅ · prettier ✅. Browser `/multi-panel`: FILES panel (`SDK 元件`) shows the tree (README.md / outputs ▾ → 客服月報.xlsx lazy-loaded / uploads); clicking README.md renders its content via `readSandboxFile`. Screenshot: `.github/screenshots/f-sandbox-files/sandbox-files-tree-viewer.png`.

## Follow-ups

- Upload / download / edit (PUT `/fs/file`) / search / rich preview (md/html render) — deferred MVP scope.
- Real-sandbox verification (real file tree + Neko) needs a dev backend (with the BUILD-014/015 follow-up).

## Execution Log

- 2026-07-14: `<SandboxFiles>` (lazy tree + viewer) + `listSandboxFiles`/`readSandboxFile` + mock fs + demo panel; own-surface fix for dark hosts; core 53/53; browser-verified. **Completes the 3-part sandbox Files/Browser series.** (Status: `draft` → `done`).
