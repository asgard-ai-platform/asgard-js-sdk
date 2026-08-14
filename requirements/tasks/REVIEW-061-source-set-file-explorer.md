# REVIEW-061 Review: mount the File Explorer on a SourceSet volume

## Meta

- Task ID: `REVIEW-061`
- Status: `draft`
- BUILD Task: `BUILD-061`
- Reviewed commit: `<git commit SHA>`
- Reviewed branch: `feat/f024-sourceset-volume-core-client`

---

## §1 Static Code Review

Scope: the files listed in BUILD-061 `## Coverage`. Unlike BUILD-060 this cycle is React, so the
generic checklist mostly applies as written.

### §1.1 Checklist

| Check item                                                                | Rule                           | Result  |
| ------------------------------------------------------------------------- | ------------------------------ | ------- |
| SVG path strings inlined into components                                  | FRONTEND_RULE_COMMON §1.1      | ✅ / ❌ |
| Inline style magic numbers (e.g., `minHeight: 'calc(...)'`)               | FRONTEND_RULE_COMMON §1.2      | ✅ / ❌ |
| Hardcoded color values (hex / rgba / oklch literal)                       | FRONTEND_RULE_COMMON §1.3      | ✅ / ❌ |
| `<style>` tag injected into JSX                                           | FRONTEND_RULE_COMMON §1.4      | ✅ / ❌ |
| Module-level mutable ID counters                                          | FRONTEND_RULE_COMMON §1.5      | ✅ / ❌ |
| Login backdoor outside `NODE_ENV === 'development'` guard                 | FRONTEND_RULE_COMMON §1.6      | ✅ / ❌ |
| Sensitive data passed through URL query strings                           | FRONTEND_RULE_COMMON §1.7      | ✅ / ❌ |
| Feature components in `src/components/{feature}/`; no `screens/` dir      | FRONTEND_RULE_COMMON §2.1      | ✅ / ❌ |
| TypeScript type and API module exist before first use                     | FRONTEND_RULE_COMMON §2.2      | ✅ / ❌ |
| API calls routed through a domain module; no ad-hoc `fetch` in components | FRONTEND_RULE_COMMON §3.2      | ✅ / ❌ |
| Loading and error states both handled                                     | FRONTEND_RULE_COMMON §3.3 §3.4 | ✅ / ❌ |
| No `as any`; no `eslint-disable` / `@ts-ignore` to bypass type errors     | FRONTEND_RULE_COMMON §4.1 §4.2 | ✅ / ❌ |
| Shared types centralized; no duplicate interfaces across files            | FRONTEND_RULE_COMMON §4.3 §4.4 | ✅ / ❌ |
| Size magic numbers repeated ≥3× extracted                                 | FRONTEND_RULE_COMMON §5.2      | ✅ / ❌ |
| All user-facing text via `t()`, synced across en-US / ja-JP / zh-TW       | FRONTEND_RULE_COMMON §5.3      | ✅ / ❌ |
| Repeated class groups (≥3×), JSX fragments (≥3×), logic (≥2×) extracted   | FRONTEND_RULE_COMMON §6        | ✅ / ❌ |
| No `setTimeout` mock delays                                               | FRONTEND_RULE_COMMON §7        | ✅ / ❌ |
| No `console.log`                                                          | FRONTEND_RULE_COMMON §7        | ✅ / ❌ |
| No untracked TODO / FIXME                                                 | FRONTEND_RULE_COMMON §7        | ✅ / ❌ |
| Every `useEffect` subscription / listener has cleanup                     | FRONTEND_RULE_COMMON §1.5      | ✅ / ❌ |
| Props fully typed; `react` / `react-dom` still externalized               | FRONTEND_RULE_COMMON §4.1 §4.4 | ✅ / ❌ |

### §1.1b Task-specific checks

This cycle deviates from F-025 deliberately (`asgard-sdk-pm#79`), so the checks that matter are the ones
that keep the deviation honest — additive only, and no regression to the shipped sandbox panel.

| Check item                                                                                                | R#     | Result  |
| --------------------------------------------------------------------------------------------------------- | ------ | ------- |
| Every change to `components/file-explorer/` is **additive** — no existing prop, type, or behavior altered | R13    | ✅ / ❌ |
| `readOnly` and `toolbarActions` both default to today's behavior when absent                              | R1, R2 | ✅ / ❌ |
| `readOnly` **hides** mutating actions, while nothing-selected still **disables**                          | R1     | ✅ / ❌ |
| `toolbarActions` render even under `readOnly` (navigation, not mutation)                                  | R2     | ✅ / ❌ |
| The shortfall line is absent when the provider reports no shortfall (sandbox path unchanged)              | R3     | ✅ / ❌ |
| No sandbox / Nudge vocabulary reachable from the SourceSet assembly                                       | R10    | ✅ / ❌ |
| The assembly reads no chat context (`useAsgardContext` and friends absent)                                | R4     | ✅ / ❌ |
| Absolute↔relative path conversion happens at the provider boundary only                                   | R5     | ✅ / ❌ |
| New i18n keys present in all three locales                                                                | R3, R9 | ✅ / ❌ |

### §1.2 Mechanical Grep

Scope to the coverage files. **Assert the file list resolves before trusting an empty result** — under
zsh an unquoted list variable is not word-split, so `grep` silently receives one bad filename and every
pattern reports empty. This cost a false-clean pass in REVIEW-060.

```bash
for f in <coverage-files>; do [ -f "$f" ] || echo "MISSING $f"; done
```

```bash
# §1.3 hardcoded color values
grep -rn --include="*.tsx" --include="*.ts" '#[0-9a-fA-F]\{3,6\}\|rgba(\|oklch(' <coverage-dirs>
# §1.4 <style> tag injection
grep -rn --include="*.tsx" '<style>' <coverage-dirs>
# §4.1 / §4.2
grep -rn --include="*.tsx" --include="*.ts" 'as any' <coverage-dirs>
grep -rn --include="*.tsx" --include="*.ts" 'eslint-disable\|@ts-ignore' <coverage-dirs>
# §5.3 hardcoded Chinese or UI strings in JSX
grep -rn --include="*.tsx" '>[^\{<]*[一-鿿][^\{<]*<' <coverage-dirs>
# §7
grep -rn --include="*.tsx" --include="*.ts" 'console\.log\|setTimeout\|TODO\|FIXME' <coverage-dirs>
# R10 — sandbox vocabulary must not be reachable from the SourceSet assembly
grep -rni 'sandbox\|nudge' packages/react/src/components/source-set-explorer/
# R4 — no chat context
grep -rn 'useAsgardContext\|useChannel\|AsgardServiceClient' packages/react/src/components/source-set-explorer/
```

Grep results:

```
<paste output here>
```

### §1.3 TypeScript and Lint

`npm run lint:check` does not exist here; `lint:packages` is the read-only equivalent. `npm run typecheck`
supersedes `npx tsc --noEmit` and covers core + react + react-demo.

```
typecheck: PASS / FAIL — <paste>
lint:      PASS / FAIL — <paste>   (baseline: 0 errors, 4 pre-existing react warnings)
```

---

## §3 Functional Validation

Browser validation on `npm run serve:react-demo` (http://localhost:4200), route `/source-set-explorer`,
walked at **both** widths side by side, plus `/file-explorer` for the regression. Style review on
`/all-features-wide` under the **Crazy** theme.

### R# Result Matrix

| R#  | Description                                                                      | Result                | Note                               |
| --- | -------------------------------------------------------------------------------- | --------------------- | ---------------------------------- |
| R1  | `readOnly` hides mutating actions; absent = today's behavior                     | Pass / Fail / Blocked | `<actual vs expected if not Pass>` |
| R2  | `toolbarActions` before Refresh, `disabled` honoured, survives `readOnly`        | Pass / Fail / Blocked |                                    |
| R3  | "N more items not loaded" line; absent without a shortfall                       | Pass / Fail / Blocked |                                    |
| R4  | Renders and operates from `sourceSetEndpoint` alone, no chat context             | Pass / Fail / Blocked |                                    |
| R5  | Adapter: path conversion, `listAll`, image data URL, remove by `isDir`, download | Pass / Fail / Blocked |                                    |
| R6  | `rootPath` locks the tree                                                        | Pass / Fail / Blocked |                                    |
| R7  | `initialPath` expands ancestors and selects                                      | Pass / Fail / Blocked |                                    |
| R8  | `createOnly`; 409 → "already exists", nothing overwritten                        | Pass / Fail / Blocked |                                    |
| R9  | 400 / 403 / 404 / 409 show a sentence, not raw JSON; `onError` fires             | Pass / Fail / Blocked |                                    |
| R10 | No sandbox vocabulary, no Nudge, in any state                                    | Pass / Fail / Blocked |                                    |
| R11 | `locale` / `theme` apply without a Chatbot provider                              | Pass / Fail / Blocked |                                    |
| R12 | Large directory: loading during the walk, whole list after, responsive           | Pass / Fail / Blocked |                                    |
| R13 | Sandbox File Explorer unchanged — 11 spec files green + browser walk             | Pass / Fail / Blocked |                                    |
| R14 | Demo route: env-driven, both widths, real dev CRUD                               | Pass / Fail / Blocked |                                    |
| R15 | (Smoke) lint / format / typecheck / build / test; export in `dist`               | Pass / Fail / Blocked |                                    |

### §3.1 Acceptance

- [ ] All R# executed at **both** widths where they are visual
- [ ] Each R# marked Pass / Fail / Blocked with explanation
- [ ] Boundary conditions confirmed: empty directory, load error, 409 conflict, cap reached, read-only
- [ ] R13 regression walked in the browser, not inferred from green tests
- [ ] `dist` export check run after `--skip-nx-cache`

**R14 may legitimately come back `Blocked`.** It needs a dev volume endpoint and token that
`apps/react-demo/.env` does not currently hold. If they are still missing, record `Blocked` with the
reason — do not mark it Pass off a mock. BUILD-060 already carries the same gap: its whole suite mocks
`fetch`, so nothing in this batch has yet touched a real volume.

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

None.

---

## Execution Log

- 2026-08-14: REVIEW task created, paired with BUILD-061 (Status: `draft`).
