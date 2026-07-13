# BUILD-005 Tool-call i18n + Variants + Group Summary (F-005 / F-004 / F-006)

## Meta

- Task ID: `BUILD-005`
- Status: `done`
- Issue: `asgard-sdk-pm#5 (F-005) · #4 (F-004) · #6 (F-006)`
- Source spec: `references/asgard-sdk-pm/tracking/asgard-js-sdk/features/F-005-*.md`, `F-004-*.md`, `F-006-*.md` (UC-007, UC-008, UC-009, UC-010)
- Complexity: `L`

## Brief

Three tightly-coupled tool-call rendering features, delivered together (they share the `i18n` module + the tool-call pipeline in `chatbot-body.tsx` / `tool-call-group.tsx`), ported from the pinned prototype (`i18n.ts` + `ToolCallsBlock.tsx`):

- **F-005 (i18n)** — introduce a minimal react i18n (the SDK had none): `Locale` (`en-US`/`ja-JP`/`zh-TW`, default/fallback `en-US`), `t()` + param interpolation, a small catalog. New `locale` prop on `<Chatbot>` → `AsgardTemplateContext`.
- **F-004 (variants + label)** — label priority `reason → synthesized (native built-in) → toolName`; per-variant icons for the 7 native tools (Bash/Read/Write/Edit/Skill/WebFetch/WebSearch), generic otherwise; native vs platform disambiguation via `toolsetName === '' && toolName ∈ NATIVE`; Bash label uses `parameter.description` (not translated).
- **F-006 (grouping summary)** — dynamic localized group title `{n} steps · Used {s} skills · Processed {f} files` (s = Skill count, f = Read/Write/Edit count; a segment is dropped when its count is 0), replacing the static "Answer preparation steps".

## Acceptance Criteria (condensed)

- `R1` (F-005) `locale` prop threaded to tool-call rendering; default/fallback `en-US`; catalog + interpolation for en/ja/zh; Bash `description` bypasses i18n. → done
- `R2` (F-004) label priority reason → synthesized → toolName; native disambiguation; per-native icons; generic icon otherwise. → done
- `R3` (F-006) localized summary with the count formula + zero-segment hiding; replaces the static title. → done
- `R4` (Smoke) build green; demo tool-call group shows synthesized labels + variant icons + summary with no console errors. → done

## Coverage

Use Cases: UC-007, UC-008, UC-009, UC-010
Files:

- `packages/react/src/i18n/*` — new i18n module (`Locale`, `t`, `MESSAGES`, `isNativeBuiltin`, `toolLabel`, `groupSummary`, `toolDiff` [used by F-007]); exported from the package barrel.
- `packages/react/src/context/asgard-template-context.tsx` — `locale` on value + provider.
- `packages/react/src/components/chatbot/chatbot.tsx` — `locale` prop → provider.
- `packages/react/src/components/chatbot/chatbot-body/chatbot-body.tsx` — `toolCallToItemData` uses `toolLabel` + `variant`; group title = `groupSummary`.
- `packages/react/src/components/templates/tool-call-group/tool-call-group.tsx` (+ `.module.scss`) — `variant` on `ToolCallItemData` + `ToolVariantIcon` (7 native + generic).
- `apps/react-demo/src/mock-server/sse-mock.ts` — tool-call phase (5 native calls) before the answer (verification infra).

Verification: lint:packages ✅ · build:core + build:react ✅ · Playwright (screenshot `.github/screenshots/f004-tool-call/variants.png`): summary = "5 steps · Used 1 skills · Processed 3 files"; labels = Read index.ts / Searched "…" / Ran skill code-review / Wrote report.md / Edited plan.md; per-variant icons present; 0 console errors. (en-US verified live; ja-JP/zh-TW catalogs + `t()` fallback in the module.)

## Execution Log

- 2026-07-13: Ported prototype i18n + tool-call label/variant/summary logic; wired `locale` prop; added demo tool-call phase. Verified lint/build + Playwright. (Status: `in-progress → done`).
