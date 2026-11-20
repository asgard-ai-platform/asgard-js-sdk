---
name: spec-workflow
description: Use when medium-to-large work needs requirements, design, task planning, readiness checks, and implementation governance before coding. Language-neutral.
version: 1.0.0-template
alwaysApply: false
---

# Spec Workflow

Use this skill to turn unclear work into implementable, reviewable specs before code changes.

## When To Use

- New feature, new page/flow, cross-module change, integration, architecture/design task, or migration.
- Acceptance criteria, UI/UX behavior, API contracts, permissions, or rollout expectations are unclear.
- The user asks to define, review, confirm, or refine requirements before implementation.

## When To Skip

- Small bug fix with clear scope.
- One-file documentation/config update.
- User provided exact implementation details and no behavior is ambiguous.

## Before You Start — Refresh design references（每次開工先執行）

在讀取 `references/` 下任何 PM spec 或 prototype 之前，先把它們更新到遠端最新，確保對到的是最新設計：

```bash
# 逐個把 submodule 更新到遠端最新（一個失敗不連坐其他）
git config -f .gitmodules --get-regexp '^submodule\..*\.path$' | awk '{print $2}' | while read -r m; do
  git submodule update --init --remote "$m" || echo "FAILED: $m"
  git -C "$m" submodule update --init --recursive || echo "FAILED (nested): $m"
done

# 驗收（必跑）：確認上面沒有 FAILED，且每個 submodule 都有 SHA
git submodule status
```

**不要圖快改用 `git submodule update --init --recursive --remote references`。** `--remote` 需要知道要追哪個分支，`.gitmodules` 沒設 `branch` 時會 fallback 到該 clone 的 `origin/HEAD`；巢狀 submodule 常常沒有 `origin/HEAD`，會噴 `fatal: Unable to find refs/remotes/origin/HEAD revision in submodule path ...`，而 git 遇到這個是**直接中止整趟迭代**——排在後面的 submodule 靜默沒被更新，你會拿舊 spec 開工。

**跑完不要再補一條不帶 `--remote` 的 `git submodule update`。** 那條的語意是「把每個 submodule reset 回父 repo 記錄的 pin」，會把剛才 `--remote` 的成果整個倒退回去。巢狀 submodule 已經由上面 `git -C "$m" ...` 那行補齊了。

驗收怎麼看：`git submodule status` 的 `+` 前綴代表 checkout 已超前父 repo 的 pin（`--remote` 生效）；沒有 `+` 代表 pin 本來就是最新——兩者都正常。`-` 前綴才是沒初始化。

註：`--remote` 會把 submodule checkout 到遠端最新，父 repo 的 pin 會顯示為已變更。這個 pin bump commit 進 feature 分支**完全無妨、也不影響開發**——`references/` 只是背景參考（不被 app 編譯，實作以 distill 進 `requirements/` 的內容為準），且 CI 未開 `submodules: true`。因此就讓 pin 始終浮到最新、bump 自然留在分支即可，不必刻意避免 commit。

## Repository Convention Discovery

Before writing specs, inspect the repo source of truth:

- `AGENTS.md`, `docs/spec-driven-development.md`, `requirements/_index.md`, `requirements/README.md`.
- `requirements/requests/_index.md` and `requirements/tasks/_index.md`.
- `profiles/README.md`, `profiles/<framework_profile>/README.md` when framework-specific work is involved.
- `references/` only for background context; do not implement directly from references.

## Required Spec Content

- `Meta`: ID, status, priority, spec mode, related request/reference links.
- `1) Requirements`: background, goal, in scope, out of scope, known context, open questions/decisions, EARS acceptance criteria.
- `2) Design`: UI/UX decisions, component structure, data dependencies, API contracts, auth/permission, acceptance test matrix, test plan.
- `3) Implementation Tasks`: reviewable tasks mapped to acceptance criteria.
- `4) Execution Log / Change Log`: spec creation, decisions, status changes, implementation notes, verification results.

## Readiness Gate

Do not implement until all pass:

- Blocking questions are answered.
- Scope and non-goals are explicit.
- UI/UX behavior, form validation, error states, and loading states are defined where relevant.
- API/data/security/operational behavior is defined where relevant.
- Each `R#` acceptance criterion maps to at least one implementation task and one verification case.
- No conflicting source documents remain unresolved.
- The new text passes the four wording checks below.
- User confirms readiness when the change affects behavior, contracts, data, deployment, or prototype fidelity.

Use status flow `draft` -> `ready` -> `in-progress` -> `done`. Do not use `in_progress`, and do not move `ready` to `in-progress` without explicit implementation instruction.

## Wording Checks（用語檢查）

BUILD 是寫給 agent 實作用的。agent 讀到有兩種讀法的句子時，通常不會停下來問，而是選一種寫成程式。所以 BUILD 從 `draft` 移到 `ready` 之前，用下面四項檢查這次新寫的文字（`Brief`、`R#`）。已經寫好的舊文字不必回頭改。

1. **一個東西只用一個名稱。** 同一份 BUILD 裡，同一個東西不可以換名稱。PM 規格、介面文字、程式識別字、API 用的名稱不一樣時，在第一次出現的地方寫出對照，例如「工單（介面：Ticket；API：case）」。對照的內容以 `requirements/glossary.md`（名稱對照表）為準。表裡沒有、但你發現它有不只一個名稱時，在表裡加一組：一張表，欄位是地方、名稱、出處。還沒有這個檔案就建立它。對照表不選正式名稱；要統一名稱是 PM 的決定。
2. **寫出是誰做的。** 每個動作都寫出動作者：使用者、消費端（使用 SDK 的應用程式）、SDK、後端或引擎。`R#` 的 `the system shall` 只用在 SDK 自己做的事。由消費端、後端或引擎做的事，寫出是哪一個。
3. **否定句寫清楚範圍。** 寫「不影響」「不顯示」「不保留」時，寫出否定的是哪些東西、在哪些狀態下成立。例如「刪除分類不影響檔案」有兩種讀法：檔案不會被刪除，或檔案的一切都不變（包括還屬於這個分類）。必須寫明是哪一種。
4. **情態詞只用固定的五個。** 中文表示要求時，只用「必須」「不可以」「可以」「不必」「無法」，不用「應」「需」「要」「不用」「不能」。例如「不用指派負責人」可以讀成「不必指派」，也可以讀成「不可以指派」，兩種讀法的實作相反。英文 `R#` 維持只用 `shall`／`shall not`。

檢查時常會發現自己也答不出來，例如不知道「不影響」包不包括分類關係。那就是待確認的問題：停下來問（見 `.claude/skills/feature-workflow/SKILL.md` 〈When to Stop and Ask〉），不要自己補一個看起來合理的答案。

## Deviation Protocol

If implementation needs to differ from an approved spec:

1. Stop the deviating part of the work.
2. Explain the proposed deviation, reason, impact, and risk.
3. Get explicit confirmation.
4. Update the spec/tasks/verification notes.
5. Resume only after the change is accepted.

## Done Gate

- Acceptance criteria are satisfied.
- Verification commands/checks are run or explicitly documented as not runnable.
- Generated/config/deployment artifacts are updated when required.
- No unapproved spec deviations remain.
- `requirements/tasks/_index.md` and the task spec `Meta` status are synchronized when task status changes.
- `.agents/skills/clean-code` or equivalent self-review is applied to changed application code before marking the task done.
