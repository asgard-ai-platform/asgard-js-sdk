# REVIEW-100 Review: Converge Accepted Tasks Into a Current-State Spec

## Meta

- Task ID: `REVIEW-100`
- Status: `ready`
- BUILD Task: `BUILD-100`
- Reviewed branch: `docs/converge-done-tasks-into-spec`
- Reviewed commit: —

> Documentation-only change: no package code changes, so the §1 checklist for library code does not apply line by line. The review checks the spec against the code and the mechanical invariants of the convergence instead.

## §1 Static Review

| Check                                                                              | Result                                                            |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `packages/` and `apps/` unchanged (`git diff origin/main --stat -- packages apps`) | ✅ empty                                                          |
| `npm run typecheck`                                                                | ✅ exit 0                                                         |
| `npm run test:packages`                                                            | ✅ core 458/458, react 805/805                                    |
| `npm run format:check`                                                             | ✅                                                                |
| No personal names, e-mail addresses or local absolute paths in the added text      | ✅                                                                |
| `requirements/spec/` is tracked (not hit by the root `spec/` ignore rule)          | ✅ `git check-ignore requirements/spec/README.md` returns nothing |

## §3 Functional Validation

| R#  | Check                                                                                                                | Result |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------ |
| R1  | `_index.md` lists eight chapters; each has the five sections and stable row IDs                                      | Pass   |
| R2  | 66 archive rows; `git cat-file -e` 66/66; every SHA is an ancestor of `origin/main`                                  | Pass   |
| R3  | Step 2.1 command on the branch returns `BUILD-100` → next is `BUILD-101`                                             | Pass   |
| R4  | `review` skill §3a sends a converged number to `converged-tasks.md` and stops                                        | Pass   |
| R5  | Dead relative links: 8 on the branch, the same 8 on `main`; deleted file names occur only in the archive             | Pass   |
| R6  | Every backticked path and identifier in the chapters resolves in the tree (chapter codes and backend names excepted) | Pass   |

## Findings

### Critical (must fix before done)

None.

### Important (should fix in this cycle)

None.

### Minor (nice to have)

1. **Most chapter rows are「待驗收」.** 54 of the 64 remaining BUILDs wait on PM acceptance (sdk-pm board, mostly In review). The chapters are complete as an index of current behavior, but most of the detail still lives in those BUILDs until they converge.
2. **`spec-workflow` still describes the single-file task format.** Same as the other front-end repos; left for a separate decision.
3. **Pre-existing dead links** (unchanged by this task): `packages/{core,react}/README.md` → `../../CONTRIBUTING.md`, `../../LICENSE`; `REVIEW-012`～`REVIEW-015` → `none`.
