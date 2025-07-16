# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## First to read
- Always read the `docs/agent-rules.md` file first

## Project Overview

This is the Asgard JS SDK, a TypeScript monorepo that provides JavaScript/React integration with the Asgard AI platform. It consists of two main packages:
- `@asgard-js/core` - Core functionality for API communication, SSE handling, and conversation management
- `@asgard-js/react` - React components and hooks for building chat interfaces

## Development Commands

### Setup
```bash
yarn install
yarn build:core  # Must build core first as it's a dependency
```

### Development
```bash
yarn serve:react-demo   # Run React demo app (http://localhost:4200)
yarn watch:core        # Watch mode for core package
yarn watch:react       # Watch mode for React package
```

### Testing
```bash
yarn test:core         # Run core package tests
yarn test:react        # Run React package tests
yarn test:react-demo-e2e  # Run E2E tests with Playwright
```

### Linting
```bash
yarn lint:packages     # Lint both core and react packages
yarn lint:core        # Lint core package only
yarn lint:react       # Lint react package only
```

### Building
```bash
yarn build:core       # Build core package
yarn build:react      # Build React package
```

### Publishing
```bash
yarn release:core     # Publish core package to npm
yarn release:react    # Publish React package to npm
```

## Architecture Overview

### Core Package (`packages/core`)
The core package implements:
- **AsgardServiceClient**: Main client class for API communication
- **SSE Event Handling**: Real-time communication via Server-Sent Events using RxJS
- **Conversation Management**: Channel and Conversation classes for managing chat sessions
- **Type Definitions**: Comprehensive TypeScript types in `src/types/`

Key patterns:
- Event-driven architecture using EventEmitter
- Observable streams for handling SSE events
- Modular design with clear separation of concerns

### React Package (`packages/react`)
The React package provides:
- **Chatbot Component**: Main chat interface component with extensive customization
- **Template System**: Message templates (text, image, carousel, button, etc.)
- **Context Providers**: Service, theme, and template contexts for state management
- **Custom Hooks**: Reusable hooks for chat functionality
- **Theme System**: CSS variables-based theming with full customization support

Key patterns:
- Component composition with templates
- Context API for global state
- Custom hooks for encapsulating business logic
- SCSS modules for component styling

### Monorepo Structure
- Uses Nx 20.4 for build orchestration
- Shared TypeScript configuration
- Centralized dependency management
- Consistent linting and testing setup

## Testing Approach

- **Unit Tests**: Vitest with jsdom environment
- **Test Files**: Co-located with source files (`*.spec.ts`, `*.test.ts`)
- **E2E Tests**: Playwright for demo app testing
- **Coverage**: V8 provider with coverage reports

To run a single test file:
```bash
cd packages/core && yarn vitest run src/lib/client.spec.ts
cd packages/react && yarn vitest run src/components/chatbot.spec.tsx
```

## Code Style Requirements

The project enforces strict TypeScript and linting rules:
- Explicit return types required for all functions
- Module boundary types must be explicit
- No unused variables or parameters
- Console statements produce warnings
- Consistent padding lines around statements

## Important Technical Details

1. **SSE Implementation**: The core package handles Server-Sent Events for real-time communication. Tool calls and streaming responses are processed through RxJS observables.

2. **Template System**: React package implements a flexible template system. Each template type (text, image, carousel, etc.) has its own component and rendering logic.

3. **Theme Customization**: The Chatbot component supports extensive theming through CSS variables. All visual aspects can be customized via the theme prop.

4. **Build Dependencies**: Core package must be built before the React package as it's a peer dependency.

5. **Version Management**: Use `scripts/bump-version.js` for version updates across packages.

6. **Local Development**: Supports local npm registry (Verdaccio) for testing package installations.

## Common Development Tasks

### Adding a New Template Type
1. Create template component in `packages/react/src/components/templates/`
2. Add type definition in `packages/react/src/models/template.ts`
3. Update template factory in the templates directory
4. Add corresponding styles in SCSS

### Modifying API Communication
1. Update types in `packages/core/src/types/`
2. Modify client methods in `packages/core/src/lib/client.ts`
3. Update SSE event handling if needed
4. Ensure backward compatibility

### Testing SSE Events
The core package includes utilities for testing SSE event streams. Use the mock SSE server in tests to simulate real-time events.

## React-Markdown Migration Status

### ✅ Phase 1: Core Migration (Completed)
- Migrated from `marked` to `react-markdown` with `remark-gfm` support
- All basic markdown features working: headers, formatting, lists, links, images, tables, code blocks
- Maintained backward compatibility and existing styling
- 22 tests added covering core markdown functionality

### ✅ Phase 2: Math Support (Completed)
- Added KaTeX math rendering support with `remark-math` and `rehype-katex`
- Supports both inline math (`$...$`) and block math (`$$...$$`)
- Complex expressions: fractions, Greek letters, matrices, equations, integrals
- Smart streaming detection for incomplete math expressions
- 22 additional math-specific tests added
- Fixed demo content LaTeX escaping issues
- **Test Results**: 88/88 tests passing (100% success rate)

**Dependencies Added**:
- `remark-math`: ^6.0.0
- `rehype-katex`: ^7.0.1  
- `katex`: ^0.16.11

**Files Modified**:
- `use-react-markdown-renderer.tsx`: Core math rendering implementation with cache management
- `use-react-markdown-renderer.spec.tsx`: Comprehensive test suite (88 tests)
- `const.ts`: Fixed demo math content escaping
- `text-template.module.scss`: Table container styling

**Phase 2 Extensions**:
- **Cache Management**: MAX_CACHE_SIZE (100) with LRU eviction strategy
- **Memory Safety**: Prevents unlimited cache growth in production
- **Performance Optimization**: Maintains fast rendering with size limits
- **Test Coverage**: 6 additional cache management tests (88 total)

## Publishing Workflow

1. Ensure all tests pass: `yarn test:core && yarn test:react`
2. Update version: `node scripts/bump-version.js`
3. Build packages: `yarn build:core && yarn build:react`
4. Publish: `yarn release:core && yarn release:react`

Ensure `~/.npmrc` has proper npm authentication token before publishing.