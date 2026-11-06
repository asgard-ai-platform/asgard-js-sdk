# BUILD-NNN <Title in American English>

<!--
建立新 BUILD task 時：
1. 複製本檔為 requirements/tasks/BUILD-NNN-<slug>.md
2. 把所有 <...> 佔位符換成實際內容，移除說明用的 HTML 註解
3. 在 requirements/tasks/_index.md 登記一列，狀態 draft
狀態流：draft → ready → in-progress → done（不得使用 in_progress）
-->

## Meta

- Task ID: `BUILD-NNN`
- Status: `draft`
- Issue: `<GitHub issue URL on asgard-sdk-pm / ClickUp task ID>`
- Source spec: `references/asgard-sdk-pm/tracking/asgard-js-sdk/<features|use-cases|tasks>/<NNN-slug>.md`
- Complexity: `S` | `M` | `L`

---

## Brief

<2–5 sentences describing what to build, referencing the source spec. Focus on the developer-visible outcome and the changed packages / modules / components. Read the matching chapter in `requirements/spec/` first; cite `← spec/<ID>` only for a recorded design decision — existing behavior is cited from the PM spec or the code.>

**Already exists:** `<list files / modules / components this task reuses or extends; fill None if starting from scratch>`

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
Each criterion is mapped to one or more Implementation Tasks (→ T#).

- `R1` When <...>, the system shall <...>. → T1
- `R2` When <...>, the system shall <...>. → T2
- `RN` (Smoke check) When the developer runs `npm run build:core && npm run build:react` and exercises <feature> via Vitest and/or the react-demo (`npm run serve:react-demo`, http://localhost:4200), the system shall <expected observable behavior> with no build errors. → TN

---

## Implementation Tasks

Run in order; each task maps to the R# it satisfies.

- [ ] T1 (R1): Add / extend types + enums in `packages/core/src/types` / `constants` (before first use)
- [ ] T2 (R2): Implement core logic (`AsgardServiceClient` / RxJS stream) and/or react component in `packages/react/src/...`; keep the package boundary
- [ ] T3 (R1, R2): Export new public API from the package entry; add / update Vitest for core logic
- [ ] TN-1: Run `npm run lint:packages` + `npm run format:check` + `npm run build:core && npm run build:react`
- [ ] TN (RN): Smoke check — build, run relevant Vitest and/or `npm run serve:react-demo` (http://localhost:4200), walk through all R#; attach screenshot to `.github/screenshots/` if visually significant

---

## Coverage

Use Cases: [filled during build]
Files: [filled during build]

---

## Execution Log / Change Log

- YYYY-MM-DD: BUILD task created, paired with source spec (Status: `draft`).
- YYYY-MM-DD: Implementation started (Status: `draft → in-progress`).
- YYYY-MM-DD: All R# verified; lint/format/build green; smoke check passed (Status: `in-progress → done`).
