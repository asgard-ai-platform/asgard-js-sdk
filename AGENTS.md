# AGENTS.md

Asgard JS SDK is a TypeScript monorepo that provides React components and core services for integrating AI chatbots with the Asgard AI platform:

- `@asgard-js/core` — Core client library for SSE communication with Asgard AI services.
- `@asgard-js/react` — React components providing ready-to-use chat interfaces.

## Commands

```bash
# Build (build core before react)
npm run build:core        # Build @asgard-js/core
npm run build:react       # Build @asgard-js/react

# Type check — the ONLY commands that fail on a type error (see "Type checking" below)
npm run typecheck           # core + react + react-demo (this is what pre-push runs)
npm run typecheck:packages  # core + react only
npm run typecheck:demo      # react-demo only

# Test
npm run test:packages     # Vitest for both core and react
npm run test:core         # Core only
npm run test:react        # React only

# Lint & format
npm run lint:packages     # Lint both core and react packages
npm run lint:core         # Lint core only
npm run lint:react        # Lint react only
npm run format            # Prettier --write
npm run format:check      # Prettier check only

# Watch mode
npm run watch:core        # Watch core package
npm run watch:react       # Watch react package

# Demo
npm run serve:react-demo  # react-demo dev server at http://localhost:4200

# Release (manual; see CLAUDE.local.md)
npm run release:core      # Publish @asgard-js/core to npm
npm run release:react     # Publish @asgard-js/react to npm
```

### Type checking

**`build:core` / `build:react` do not fail on type errors.** They are vite builds, and `vite-plugin-dts`
reports type errors on stdout while still exiting `0`. The GitHub Actions workflow that would otherwise
catch them is disabled (`.github/workflows/ci.yml`, `if: false`). Ten type errors once sat on `main`
undetected for exactly this reason.

`npm run typecheck` (`tsc --build` over `packages/core`, `packages/react` and `apps/react-demo`) is the
command that actually fails, and a husky `pre-push` hook runs it so a type error cannot reach the remote.
Use `git push --no-verify` only to share a knowingly broken WIP branch.

**Coverage is all three projects and all of their `src/`, `*.spec.*` included.** `apps/react-demo` is the
only real consumer of the public API inside this repo, so it doubles as the early warning that a type
change breaks downstream. `npm run typecheck:packages` (core + react) and `npm run typecheck:demo` are
narrower shortcuts for when you only touched one side.

> Two coverage holes used to sit here and are worth knowing about, because both looked like passing runs.
> **Spec files**: `tsc` always compiled them, but the Nx `typecheck` target inherited the `production`
> named input, which excludes `**/*.spec.*` — so editing a spec never invalidated the cache and Nx
> replayed a stale ✅. `nx.json` now pins `targetDefaults.typecheck.inputs` to `default` / `^default`.
> **The demo**: it was simply never in the `--projects` list, and had accumulated five type errors.
> If you ever need to confirm the gate is live, drop `const CANARY: number = 'x';` into any file it
> claims to cover and check that `npm run typecheck` fails **without** `--skip-nx-cache`.

Run it alongside lint and format before calling a task done:

```bash
npm run lint:packages && npm run format:check && npm run typecheck
npm run build:core && npm run build:react
npm run test:packages
```

`npm run typecheck` emits `.js` files into `packages/core/out-tsc/`, and `.prettierignore` does not exclude
that directory (prettier 2 does not read `.gitignore`). Running `format:check` after a typecheck in the same
working tree therefore fails on those build outputs, not on your code — delete `packages/core/out-tsc/` first.

## Tech Stack

- **Language**: TypeScript 5 (strict mode; no `any`, explicit return types, explicit type exports at module boundaries)
- **Monorepo**: Nx
- **Bundler**: Vite (core outputs ESM + CJS + UMD; react outputs ESM and externalizes react/react-dom)
- **Reactive**: RxJS (SSE streaming, event handling)
- **React package**: React 18 / 19 (peerDependencies), Streamdown (streaming markdown), Vega ecosystem (charts), browser speech recognition (voice input)
- **Lint/Format**: ESLint + Prettier
- **Test**: Vitest

## Project Structure

```
packages/
├── core/    @asgard-js/core — AsgardServiceClient (SSE), types, RxJS event handlers, auth
│   └── src/  lib/ (client) · types/ (sse-response.ts, contracts) · constants/ (enum.ts)
└── react/   @asgard-js/react — Chatbot component, message templates, context/theme providers
    └── src/  components/ (templates/, ...) · providers/ (service + theme context)
apps/
└── react-demo/   Interactive demo (Vite), dev server on port 4200
docs/     spec-driven-development.md (SDD rules)
requirements/  SDD source of truth (see Development Workflow below)
references/    git submodules — background only (see References below)
```

- **Package dependencies**: react depends on core. Core is framework-agnostic and must not import react/react-dom/DOM.
- Component files and message templates follow the existing patterns under `packages/react/src/components/templates/`.

## Conventions

### Endpoint configuration

Always use `botProviderEndpoint` instead of the deprecated `endpoint`:

```typescript
// Correct
config: {
  botProviderEndpoint: 'https://api.asgard-ai.com/ns/{namespace}/bot-provider/{botProviderId}';
}
// Deprecated (avoid)
config: {
  endpoint: 'https://api.asgard-ai.com/ns/{namespace}/bot-provider/{botProviderId}/message/sse';
}
```

### Type safety

- All TypeScript strict rules enforced; no `any` — use proper type definitions.
- Explicit return types for all exported functions; module boundaries have explicit type exports.

### Theme priority (highest to lowest)

1. Props theme configuration
2. Bot provider metadata annotations
3. Default theme values

All theme properties support CSS variables. React/ReactDOM are externalized in the react build.

### Versioning

`@asgard-js/core` and `@asgard-js/react` always share the same version number (see `CLAUDE.local.md` for the manual release flow).

## Development Workflow (SDD)

This project uses lightweight Spec-Driven Development:

- **`requirements/` is the single source of truth for implementation**; `references/` is background material only, **do not implement directly from `references/`**.
- Task specs live in `requirements/tasks/TASK-*.md` using **Single-file SDD**; per-issue cycles use the `BUILD-*` / `REVIEW-*` pair. Acceptance criteria are tagged with EARS `R#` identifiers and map to implementation tasks and verification cases.
- Status flow: `draft → ready → in-progress → done` (**never use the underscore form `in_progress`**).
- When a task is `ready`, **do not start work without an explicit instruction**; if implementation must deviate from an agreed spec, stop and confirm, update the spec, then continue.
- Before starting a new task, read `requirements/_index.md`; see `requirements/README.md` for the full rules and read order, and `docs/spec-driven-development.md` for the complete SDD guidelines.
- The per-issue cycle is driven by the `feature-workflow` skill (resolve a PM issue → plan a BUILD/REVIEW pair → build per `FRONTEND_RULE_COMMON.md` → run the `review` skill for §1 static + §3 functional → done only on your authorization). The `spec-workflow` skill governs larger specs before coding.

## References (background material, not the implementation source)

The entries under `references/` are git submodules (pinned to specific commits). **Treat them as background reference only; do not implement directly from them**; when they conflict with implementation, the actual requirements take precedence. First clone / sync: `git submodule update --init --recursive`.

| Submodule                              | Role                                                                                    | How to use                                                                                                                                                                                                                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `references/asgard-sdk-pm`             | **PM spec repo** (source of feature requirements / use cases for the Asgard SDK family) | Spec source of truth for this repo lives under `tracking/asgard-js-sdk/` (`features/`, `use-cases/`, `tasks/`) and `docs/spec/asgard-js-sdk/`. Conventions in `CONVENTIONS.md`; entry in `AGENTS.md`. Open cross-team issues (API/spec gaps) in that repo's GitHub issues. |
| `references/asgard-chat-kit-prototype` | **Chat kit prototype** (Vite/React design & interaction prototype)                      | Visual / behavioral reference for chat UI and templates. Reference only, do not port line by line.                                                                                                                                                                         |

## Demo application

`apps/react-demo` provides interactive demonstrations:

- **Templates** — preview all message template types (Text, Button, Carousel, Image, Chart, Table, Math)
- **Features** — toggle SDK features (file upload, export, document upload)
- **Theme** — customize appearance with color presets / custom colors
- **Auth** — test auth states (authenticated, needApiKey, error, ...)
- **Events** — handle EMIT actions from button clicks
- **Fullscreen** — view the chatbot in fullscreen

To run: copy `apps/react-demo/.env.example` to `apps/react-demo/.env`, set `VITE_BOT_PROVIDER_ENDPOINT` / `VITE_API_KEY` (see `CLAUDE.local.md` for the full variable map), then `npm run serve:react-demo`.

### Verify at both widths — narrow AND wide

The default theme sizes the shell as a **375×640** mobile widget (`asgard-theme-context.tsx`), but every
first-party consumer (Mimir, Sindri, Odin) mounts it **full-bleed** with
`theme={{ chatbot: { width: '100%', height: '100%' } }}`. A demo route that does not override the theme
therefore verifies a 375px layout nobody ships, and one that only overrides it never sees the width where
things get clipped. **Walk every UI acceptance criterion at both sizes, and render them side by side** —
mount the shell twice on the route (`/prompt-suggestion` is the reference) rather than hiding one behind
a toggle: what matters is comparing the two, and a toggle makes you hold one of them in your head.
Give the second shell its own `customChannelId`, and have the mock match the channel by prefix so both
run the same scripts.

Two traps this has already cost time on:

- **A wrapper shorter than the shell does not clip it — the shell paints outside and covers whatever
  follows.** The default shell is a fixed 640px tall; a 560px wrapper leaks ~80px of composer over the
  next element. Size the wrapper to at least the shell, or use the full-bleed override and let flexbox
  size it (`flex: 1; min-height: 0` — without `min-height: 0` the shell refuses to shrink and pushes the
  composer below the fold).
- **`DemoWrapper`'s content area is a row flex.** A route that returns two top-level children gets them
  side by side, so the chatbot ends up squeezed to zero width. Wrap the route in one column stack, the
  way `all-features-wide` does.

## Common Development Tasks

### Adding a new message template

1. Define types in `packages/core/src/types/sse-response.ts`.
2. Add the new type to the `MessageTemplateType` enum in `packages/core/src/constants/enum.ts`.
3. Implement the component in `packages/react/src/components/templates/`.
4. Export it from `packages/react/src/components/templates/index.ts`.
5. Add theme configuration support.

### Updating the API client

1. Modify `packages/core/src/lib/client.ts`.
2. Update TypeScript definitions.
3. Ensure backward compatibility (deprecate with `@deprecated`, do not remove).
4. Update the react package if the interface changes.

## Local dev notes

Local verification habits, the manual release flow, `npm pack` local-install into consumer apps, and demo `.env` setup live in `CLAUDE.local.md`.
