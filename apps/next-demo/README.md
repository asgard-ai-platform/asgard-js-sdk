# Next.js Demo App

This is a Next.js demo application for the Asgard JS SDK.

## Features

- Next.js 15 with App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Path aliases with `~/*`
- ESLint configuration

## Getting Started

First, run the development server:

```bash
# From the root of the monorepo
npm run serve:next-demo

# Or directly in this directory
npm run dev
```

Open [http://localhost:4300](http://localhost:4300) with your browser to see the result.

## Project Structure

```
apps/next-demo/
├── src/
│   ├── app/          # App Router pages
│   └── components/   # Reusable components
├── public/           # Static assets
└── ...config files
```

## Path Aliases

This project uses `~/*` as a path alias for the `src/` directory:

```typescript
import Component from '~/components/Component';
import { utils } from '~/lib/utils';
```
