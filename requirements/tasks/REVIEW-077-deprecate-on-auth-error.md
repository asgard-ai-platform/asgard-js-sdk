# REVIEW-077 Review: deprecate `onAuthError` in favour of `onSseError`

## Meta

- Task ID: `REVIEW-077`
- Status: `done`
- BUILD Task: `BUILD-077`
- Reviewed commit: `80e61a44`
- Reviewed branch: `fix/459-deprecate-on-auth-error`

---

## §1 Static Code Review

Scope is `BUILD-077 ## Coverage`. `typecheck` / `lint` / `build` run project-wide.

### §1.1 Checklist

| Check item                                           | Rule                           | Result |
| ---------------------------------------------------- | ------------------------------ | ------ |
| `any` / `as any`                                     | FRONTEND_RULE_COMMON §1.1      | ✅     |
| `@ts-ignore` / `eslint-disable`                      | FRONTEND_RULE_COMMON §1.2      | ✅     |
| `console.log`                                        | FRONTEND_RULE_COMMON §1.3 §7   | ✅     |
| Hardcoded key / endpoint / namespace                 | FRONTEND_RULE_COMMON §1.4      | ✅     |
| Teardown for subscriptions / listeners / timers      | FRONTEND_RULE_COMMON §1.5      | ✅ n/a |
| react → core through the public entry only           | FRONTEND_RULE_COMMON §1.6      | ✅     |
| core free of react / react-dom / DOM                 | FRONTEND_RULE_COMMON §1.6 §2.1 | ✅     |
| **Breaking public-API change carries `@deprecated`** | FRONTEND_RULE_COMMON §1.7      | ✅     |
| New public API exported from the package entry       | FRONTEND_RULE_COMMON §2.2      | ✅ n/a |
| Explicit return types on exported functions          | FRONTEND_RULE_COMMON §3.1      | ✅     |
| Component props fully typed                          | FRONTEND_RULE_COMMON §4.1      | ✅     |
| No hardcoded colour values                           | FRONTEND_RULE_COMMON §4.2      | ✅ n/a |
| core and react share a version number                | FRONTEND_RULE_COMMON §5        | ✅     |
| Repeated logic / types / JSX extracted               | FRONTEND_RULE_COMMON §6        | ✅ ¹   |
| `setTimeout` mock, dead code, untracked TODO / FIXME | FRONTEND_RULE_COMMON §7        | ✅     |
| #459 §2 的範圍沒有被擴大（執行期零變動）             | #459                           | ✅     |
| README 與型別同時更新                                | README drift 前科              | ✅     |

¹ The same `@deprecated` block is repeated at three declarations. That is duplication of a **comment**,
not of logic, and it is deliberate — the whole defect being fixed is that one of those declarations was
documented as working. A shared constant is not available for JSDoc, and a `{@link}` to one of the three
would leave the other two unmarked in an editor.

### §1.2 Mechanical Grep

Restricted to the lines this task adds.

```
### forbidden patterns in added lines
git diff -- '*.ts' '*.tsx' | grep '^+' | grep -E 'setTimeout|console\.log|: any|as any|@ts-ignore|eslint-disable|TODO|FIXME'
  → no output ✅

### runtime behaviour touched?
git diff -- packages/react/src/hooks/use-channel.ts | grep '^[+-]' | grep -v '^[+-][+-]' | grep -v '^\+ *\*' | grep -v '^\+ */\*\*'
  → only the added comment block; not one executable line ✅

### core touched?
git diff --stat -- packages/core/
  → empty ✅

### export surface
git diff --stat -- packages/react/src/index.ts
  → empty ✅
```

### §1.3 Build / Lint / Format

```
lint:packages:  PASS — 0 errors, 5 warnings, all pre-existing and none in a changed file
format:check:   PASS
typecheck:      PASS — core + react + react-demo
build:          PASS — build:core + build:react clean
test:packages:  PASS — 275 core + 439 react
emitted types:  `@deprecated Use {@link onSseError} instead…` present in
                packages/react/dist/components/chatbot/chatbot.d.ts, immediately above `onAuthError?:`
```

### §1.4 Static Review Acceptance

- [x] All §1.1 items checked and marked
- [x] No ❌ violations
- [x] All §1.2 greps run and output pasted
- [x] `npm run typecheck` and the builds — no TypeScript errors
- [x] `npm run lint:packages` — no ESLint errors

---

## §3 Functional Validation

No browser pass: this task changes no rendered output and no runtime path. The claim being validated is
the opposite one — that nothing moved — so the evidence is the unedited behaviour tests plus the diff.

### R# Result Matrix

| R#  | Description                                         | Result | Note                                                                                                                             |
| --- | --------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Editor shows it deprecated, names the replacement   | Pass   | Tag present in source and in the emitted `.d.ts` above the member                                                                |
| R2  | Every declaration marked, not only the public one   | Pass   | New case walks all three files and asserts on the comment block **immediately preceding** the member, so a stray tag cannot pass |
| R3  | README says deprecated and names `onSseError`       | Pass   | New case; verified by deliberately reverting the README line → test red, restore → green                                         |
| R4  | A custom client throwing the shape still reaches it | Pass   | `sse-error-exits.spec.tsx` R2 and `consent-reply-error.spec.tsx` R2 both pass **unedited** — they are the behaviour guarantee    |
| R5  | Smoke check                                         | Pass   | See §1.3                                                                                                                         |

### §3.1 Acceptance

- [x] Every R# executed
- [x] Each R# marked Pass
- [x] Vitest run and passing — 8 cases in `sse-error-exits.spec.tsx` (6 pre-existing + 2 new)
- [x] The "nothing moved" claim checked by diffing `use-channel.ts` for executable changes — none

---

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

1. **The prop's inline type is duplicated at all three declarations** (`{ isAuthError: boolean;
isBotProviderError: boolean; errorDetail?: unknown }`), while `use-channel.ts` already has a local
   `AuthShapedError` alias for the same shape. §3.2 would prefer one shared exported type. Left alone
   deliberately: extracting a type for a prop that is on its way out adds a public symbol that would
   itself need deprecating. Recorded so a later reader does not mistake it for an oversight.
2. **`#459` can be closed once this merges.** §1 and §3 shipped in #460 (0.3.77); §2 is this PR. Closing
   is the opener's obligation per `AGENTS.md`, not a permission question — but it should follow the
   merge, not precede it.

---

## Execution Log

- 2026-09-02: REVIEW task created, paired with BUILD-077 (Status: `draft → in-progress`).
- 2026-09-02: §1 — 17 checklist items, 17 ✅ / 0 ❌; greps confirm zero executable changes in
  `use-channel.ts`, zero changes in `packages/core/` and zero export-surface change.
- 2026-09-02: §3 — R1–R5 all Pass. The two pre-existing behaviour cases pass unedited, which is what
  makes "documentation only" a verified claim rather than an assertion. 0 BLOCKERs (Status: `done`).
