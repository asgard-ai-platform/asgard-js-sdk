# REVIEW-075 Review: host actions under readOnly, path highlight and auto-expand

## Meta

- Task ID: `REVIEW-075`
- Status: `ready`
- BUILD Task: `BUILD-075`
- Reviewed commit: `<git commit SHA>`
- Reviewed branch: `<branch-name>`

---

## §1 Static Code Review

Scan BUILD task `## Coverage` files against `FRONTEND_RULE_COMMON.md`. No server needed.

### §1.1 Checklist

| Check item                                                                                                    | Rule                           | Result  |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------- |
| SVG path strings inlined into components                                                                      | FRONTEND_RULE_COMMON §1.1      | ✅ / ❌ |
| Inline style magic numbers (e.g., `minHeight: 'calc(...)'`)                                                   | FRONTEND_RULE_COMMON §1.2      | ✅ / ❌ |
| Hardcoded color values (hex / rgba / oklch literal)                                                           | FRONTEND_RULE_COMMON §1.3      | ✅ / ❌ |
| `<style>` tag injected into JSX                                                                               | FRONTEND_RULE_COMMON §1.4      | ✅ / ❌ |
| Module-level mutable ID counters                                                                              | FRONTEND_RULE_COMMON §1.5      | ✅ / ❌ |
| Login backdoor outside `NODE_ENV === 'development'` guard                                                     | FRONTEND_RULE_COMMON §1.6      | ✅ / ❌ |
| Sensitive data passed through URL query strings                                                               | FRONTEND_RULE_COMMON §1.7      | ✅ / ❌ |
| `page.tsx` is thin (params + navigation only; no main UI JSX)                                                 | FRONTEND_RULE_COMMON §2.1      | ✅ / ❌ |
| Feature components in `src/components/{feature}/`; no `screens/` dir                                          | FRONTEND_RULE_COMMON §2.1      | ✅ / ❌ |
| TypeScript type (`src/types/`) and API module (`src/api/`) exist before first use                             | FRONTEND_RULE_COMMON §2.2      | ✅ / ❌ |
| API calls routed through `src/api/` domain module; no direct axios in components                              | FRONTEND_RULE_COMMON §3.2      | ✅ / ❌ |
| Server state via TanStack Query; `isLoading` / `isError` both handled                                         | FRONTEND_RULE_COMMON §3.3 §3.4 | ✅ / ❌ |
| Forms use RHF + Zod; no bare `useState` fields; field-level error messages                                    | FRONTEND_RULE_COMMON §3.5      | ✅ / ❌ |
| Zustand store does not hold server data                                                                       | FRONTEND_RULE_COMMON §2.1      | ✅ / ❌ |
| No `as any`; no `eslint-disable` / `@ts-ignore` to bypass type errors                                         | FRONTEND_RULE_COMMON §4.1 §4.2 | ✅ / ❌ |
| Shared types centralized in `src/types/`; no duplicate interfaces across files                                | FRONTEND_RULE_COMMON §4.3 §4.4 | ✅ / ❌ |
| Size magic numbers repeated ≥3× extracted to `src/constants/layout.ts`                                        | FRONTEND_RULE_COMMON §5.2      | ✅ / ❌ |
| Dates use dayjs + `src/constants/formats.ts` constants                                                        | FRONTEND_RULE_COMMON §5.2      | ✅ / ❌ |
| All user-facing text via `useTranslations()` / `t()`; synced to `messages/zh-TW.json` + `messages/en-US.json` | FRONTEND_RULE_COMMON §5.3      | ✅ / ❌ |
| Repeated Tailwind class groups (≥3×), JSX fragments (≥3×), logic (≥2×) extracted                              | FRONTEND_RULE_COMMON §6        | ✅ / ❌ |
| No `setTimeout` mock delays                                                                                   | FRONTEND_RULE_COMMON §7        | ✅ / ❌ |
| No `console.log` (except error boundary logging)                                                              | FRONTEND_RULE_COMMON §7        | ✅ / ❌ |
| No untracked TODO / FIXME                                                                                     | FRONTEND_RULE_COMMON §7        | ✅ / ❌ |

### §1.2 Mechanical Grep

Run the commands below against directories listed in BUILD task `## Coverage`. Empty output = ✅, any output = ❌.

```bash
# §1.3 hardcoded color values
grep -rn --include="*.tsx" --include="*.ts" '#[0-9a-fA-F]\{3,6\}\|rgba(\|oklch(' <coverage-dirs>

# §1.4 <style> tag injection
grep -rn --include="*.tsx" '<style>' <coverage-dirs>

# §1.7 sensitive data in URL query strings
grep -rn --include="*.tsx" --include="*.ts" 'router\.push.*email=\|router\.push.*token=\|router\.push.*password=\|searchParams.*token' <coverage-dirs>

# §4.1 as any
grep -rn --include="*.tsx" --include="*.ts" 'as any' <coverage-dirs>

# §4.2 eslint-disable / ts-ignore
grep -rn --include="*.tsx" --include="*.ts" 'eslint-disable\|@ts-ignore' <coverage-dirs>

# §5.3 hardcoded Chinese or common UI strings in JSX
grep -rn --include="*.tsx" '>[^\{<]*[一-鿿][^\{<]*<' <coverage-dirs>

# §7 console.log
grep -rn --include="*.tsx" --include="*.ts" 'console\.log' <coverage-dirs>

# §7 setTimeout mock
grep -rn --include="*.tsx" --include="*.ts" 'setTimeout' <coverage-dirs>
```

Grep results:

```
<paste output here>
```

### §1.3 TypeScript and Lint

```bash
npx tsc --noEmit
npm run lint:check （唯讀審查用 lint:check；REVIEW_RULE §1.4 對應的 npm run lint 為含 auto-fix 的變體）
```

Results:

```
tsc:  PASS / FAIL — <paste output if any errors>
lint: PASS / FAIL — <paste output if any errors>
```

### §1.4 Static Review Acceptance

- [ ] All §1.1 items checked and marked ✅/❌
- [ ] All ❌ violations listed with file path and line number
- [ ] All §1.2 grep commands run and output pasted
- [ ] `npx tsc --noEmit` run — no TypeScript errors
- [ ] `npm run lint:check` run — no ESLint errors

Any ❌ violation → report BLOCKER to BUILD task; re-run §1 after fix.

---

## §3 Functional Validation

Validate each R# from BUILD task against the running app (`npm run dev -- -p <本地 dev port，見 CLAUDE.local.md>`).

### R# Result Matrix

| R#  | Description                           | Result                | Note                               |
| --- | ------------------------------------- | --------------------- | ---------------------------------- |
| R1  | `<criterion summary from BUILD task>` | Pass / Fail / Blocked | `<actual vs expected if not Pass>` |
| R2  | `<criterion summary>`                 | Pass / Fail / Blocked |                                    |
| RN  | (Browser smoke test) `<summary>`      | Pass / Fail / Blocked |                                    |

### §3.1 Acceptance

- [ ] All R# in BUILD task `## Coverage` executed (Step 1 static read + Step 2 browser operation + Step 3 boundary conditions)
- [ ] Each R# marked Pass / Fail / Blocked with explanation
- [ ] If e2e spec exists for changed routes: `npm run test:e2e` run and passed
- [ ] Loading, error, and empty-state boundary conditions confirmed

Any Fail → BLOCKER to BUILD task; describe [actual behavior] vs [expected behavior].

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

- 2026-09-01: REVIEW task created, paired with BUILD-075 (Status: `draft`).
- YYYY-MM-DD: §1 Static review started (Status: `draft → in-progress`).
- YYYY-MM-DD: §1 complete — N ✅ / N ❌; §3 Functional validation complete — all R# Pass (Status: `in-progress → done`).
