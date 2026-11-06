# FOLLOWUP (F-002) — background-tab `openWhenHidden` + `detach` cursor rejoin

## Meta

- Type: follow-up (deferred from BUILD-002 / F-002)
- Status: `deferred` — needs a real dev backend to verify without regressing bug #2.
- Source: `references/asgard-sdk-pm/.../F-002-…` AC R4 / R5 (清理項目).

## Why deferred

BUILD-002 lands the core resume (UC-003 transparent resume + UC-004 no-cursor guard), verifiable with a scoped demo mock. Two F-002 acceptance items **cannot be safely verified with a mock** and are deferred to a real-backend regression pass:

- **R4 — `openWhenHidden`**: `create-sse-observable.ts` sets `openWhenHidden: true` (a pre-resume workaround for the "background tab display broken" bug, commit `844d3fb`). F-002 says return it to the library default **only after confirming no regression**. Confirming needs a real background-tab → foreground cycle against a backend that resumes from the cursor — a mock that drops on demand cannot reproduce the visibility-driven reconnect the bug was about.
- **R5 — `detach` → cursor rejoin**: `client.ts` `detach()` keeps the connection open up to a timeout so a run finishes on the backend. F-002 suggests reworking this to a **GET rejoin** (reconnect by cursor instead of long-holding). This is a larger refactor whose correctness (no dropped/duplicated run, orphaned-connection cleanup) needs real-backend + real navigation to validate.

## What to do (when a dev backend is available)

1. Against dev backend: background the tab mid-run, wait, foreground → confirm the stream resumes correctly and the "display broken" bug does **not** reappear. Then remove `openWhenHidden: true` (back to library default).
2. Evaluate replacing `detach`'s long-hold with a GET rejoin (reconnect via cursor). Keep the current teardown guarantees (close on settle / safety timeout).
3. Regression-check both against `keepConnectionOnUnmount` consumers.

## Do NOT

- Do not remove `openWhenHidden` or rewrite `detach` blindly on a mock — that risks re-introducing bug #2 (background display broken) with no way to catch it locally.
