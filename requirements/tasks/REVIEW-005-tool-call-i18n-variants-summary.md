# REVIEW-005 Tool-call i18n + Variants + Group Summary (F-005 / F-004 / F-006)

## Meta

- Task ID: `REVIEW-005`
- Status: `done`
- BUILD Task: `BUILD-005`
- Reviewed branch: `feat/stream-robustness-and-resume`

## §1 Static Code Review

- No `any`/`@ts-ignore`/`eslint-disable`/`console.log` in the change. ✅ (`parameter` read via a typed `str()` helper, not `as any`)
- i18n module is framework-agnostic pure functions; no React import in it. ✅
- Tool-call icons: inline SVG (matches the repo's no-lucide convention); `--asg-color-text-secondary` via scss class, no hardcoded color in the component. ✅
- New public API (`locale` prop, `Locale`, i18n helpers) exported from the package barrel with explicit types. ✅
- lint:packages ✅ · build:core + build:react ✅.

**§1: 0 violations.**

## §3 Functional Validation

| R#                                   | Result | Note                                                                                                                |
| ------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------- |
| R1 i18n locale threaded + fallback   | Pass   | `locale` prop → context → tool-call rendering; en-US verified live; catalog has en/ja/zh; `t()` falls back to en-US |
| R2 label priority + variants + icons | Pass   | labels synthesized (Read/Write/Edit/Skill/WebSearch), per-variant icons rendered (screenshot)                       |
| R3 group summary + zero-hiding       | Pass   | "5 steps · Used 1 skills · Processed 3 files" (5 calls, 1 Skill, 3 files)                                           |
| R4 build + demo smoke                | Pass   | builds green, 0 console errors, screenshot captured                                                                 |

**§3: all Pass.** Screenshot: `.github/screenshots/f004-tool-call/variants.png`.

## Findings

None. Minor: on the scroll-bug demo page a send renders the group twice (dev/StrictMode artifact, not an SDK issue). ja-JP/zh-TW localization verified by catalog inspection + `t()` logic, not a live locale switch (the demo doesn't set a non-default `locale`).

## Execution Log

- 2026-07-13: §1 0 violations; §3 R1–R4 Pass (Playwright + build + screenshot). 0 BLOCKERs (Status: `draft → done`).
