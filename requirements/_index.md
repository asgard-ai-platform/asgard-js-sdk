# Requirements Index

This is the entrypoint for requirement navigation.

## Convention

- `requirements/` is the implementation source of truth.
- `references/` is background only.
- High-level requirements live in `requirements/requests/REQ-*.md`.
- Executable work lives in `requirements/tasks/` as BUILD/REVIEW pairs (`BUILD-NNN-*.md` + `REVIEW-NNN-*.md`, from `_build_template.md` / `_review_template.md`). `_template.md` (single-file `TASK-*.md`) is the older format.
- Design decisions, gaps with the PM spec and known limits live in `requirements/spec/` (current-state spec). Accepted tasks are folded in there and deleted.
- Acceptance criteria use `R#` identifiers and must map to implementation tasks and verification cases.
- Status values are `draft`, `ready`, `in-progress`, and `done`.

## Indexes

- Requests: `requirements/requests/_index.md`
- Tasks: `requirements/tasks/_index.md`
- Current-state spec: `requirements/spec/_index.md`

## Gates

- Do not implement from `references/` directly.
- Do not start implementation until the target task is `ready` and the user explicitly asks to begin.
- If implementation must deviate from a ready spec, stop, ask for confirmation, update the spec, then continue.

## Working from a PM issue

When given a GitHub issue link/number from `asgard-ai-platform/asgard-sdk-pm`:

1. `gh issue view <n> -R asgard-ai-platform/asgard-sdk-pm --json title,body,labels`.
2. The issue body cites its tracking spec (a `tracking/asgard-js-sdk/...` path, or a feature `F-NNN` / use-case `UC-NNN` number). Read it under `references/asgard-sdk-pm/tracking/asgard-js-sdk/`. If it is not there, the submodule may be behind its pin: `git submodule update --remote references/asgard-sdk-pm`, then retry (or search by number/title).
3. `references/` is background only. Distill the PM spec into a BUILD/REVIEW pair under `requirements/tasks/` (the `feature-workflow` skill), then follow the Gates above (BUILD `ready` + explicit go before coding).

## Implementation rules

asgard-js-sdk 的實際技術棧（以各 `package.json` 為準），實作時遵守。完整規則見 `.claude/skills/feature-workflow/FRONTEND_RULE_COMMON.md`；重點：

- **Monorepo**：Nx + Vite。`@asgard-js/core`（框架無關的 SSE / RxJS client、型別、認證）與 `@asgard-js/react`（React 元件庫、templates、theming）兩個 package。
- **Package 邊界**：`@asgard-js/react` 相依 `@asgard-js/core`；**core 不得** import `react` / `react-dom` / DOM API。react 只從 core 的公開進入點 import，不深挖 `core/src`。
- **TypeScript**：strict 全開，**禁止 `any` / `as any`**、禁止用 `@ts-ignore` / `eslint-disable` 規避型別；導出函式標明 explicit return type；module 邊界明確 `export type`。共用型別集中在 core `src/types/`。
- **RxJS**：SSE / stream 用 operator 組合；每個 subscription / EventSource / timer 都要 teardown（`takeUntil` / `unsubscribe` / `useEffect` cleanup），不可洩漏連線。
- **公開 API 相容性**：簽章 / props / 型別的破壞性變更先標 `@deprecated` 過渡，不直接移除；`botProviderEndpoint` 取代 deprecated 的 `endpoint`。
- **React 元件**：props 完整型別化；theming 走 CSS 變數與 theme context（優先序 props > bot provider metadata > default）；`react`/`react-dom` 走 peerDependencies（externalize，勿打包）。
- **版本**：`@asgard-js/core` 與 `@asgard-js/react` 永遠相同版本號。
- **驗證**：`npm run lint:packages`、`npm run format:check`、`npm run build:core && npm run build:react`（型別 + 產物）；功能驗收用 Vitest 與 react-demo（`npm run serve:react-demo`，http://localhost:4200，`/templates`）。

完整 SDD 規則見 `docs/spec-driven-development.md`。

這整個循環由 `feature-workflow` skill 驅動（resolve issue → 規劃 BUILD/REVIEW → build 照 FRONTEND_RULE_COMMON → 用 `review` skill 跑 §1+§3 → 你授權才 done）。直接叫 `feature-workflow` 即可。
