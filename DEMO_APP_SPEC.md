# Next.js Demo App 規格

取代 `apps/react-demo`（Vite + React Router），以 Next.js 16 + Tailwind v4 + shadcn/ui 重新建置於 `apps/demo/`。

## 技術棧

| 項目 | 選擇 |
|------|------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript |
| React | 19 |
| CSS | Tailwind CSS v4 |
| UI 元件庫 | shadcn/ui (new-york, zinc) |
| 圖標 | lucide-react |
| 多語系 | next-intl v4，`localePrefix: 'always'`，支援 en-US / zh-TW |
| Dark mode | next-themes，`attribute="class"` |
| 語法高亮 | shiki（雙主題 github-light / github-dark） |
| 環境變數驗證 | zod |

## 路由結構

URL 帶 locale 前綴（`/en-US/...`、`/zh-TW/...`）。Sidebar 分四組：

| 分組 | 頁面 | 路由 | 原路由 |
|------|------|------|--------|
| Getting Started | Home | `/[locale]` | `/` |
| | Fullscreen | `/[locale]/fullscreen` | `/fullscreen` |
| Templates | Templates | `/[locale]/templates` | `/templates` |
| Configuration | Features | `/[locale]/config/features` | `/features` |
| | Theme | `/[locale]/config/theme` | `/theme` |
| | Auth | `/[locale]/config/auth` | `/auth` |
| Advanced | Events | `/[locale]/advanced/events` | `/events` |
| | Custom Renderer | `/[locale]/advanced/custom-renderer` | `/custom-renderer` |
| | Dynamic Payload | `/[locale]/advanced/dynamic-payload` | `/dynamic-payload` |
| | Before Send | `/[locale]/advanced/before-send` | `/before-send-message` |
| | Custom Header | `/[locale]/advanced/custom-header` | `/custom-header` |
| | Auto Reset | `/[locale]/advanced/auto-reset` | `/auto-reset-channel` |
| | Markdown | `/[locale]/advanced/markdown` | `/markdown` |
| | Private | `/[locale]/advanced/private` | `/private` |

Fullscreen 使用獨立 layout（無 sidebar，`fixed inset-0`）。

## 關鍵設計決策

### Monorepo 整合

- tsconfig paths 指向 `packages/*/src/index.ts`（原始碼），搭配 `transpilePackages`
- Turbopack 自動偵測 monorepo root（via `package-lock.json`），SDK 修改即時 HMR
- 等同現有 react-demo 透過 `nxViteTsPaths()` 達成的效果

### i18n（參考 asgard-ai-auto-post-web）

- `proxy.ts`（Next.js 16 將 middleware 改名為 proxy）
- `routing.ts` 定義路由 + 匯出 `Link`/`useRouter`/`usePathname`
- 元件中用 `useTranslations('namespace')`

### SSR

- 所有使用 `Chatbot` 的頁面標記 `'use client'`
- `@asgard-js/react/style` 在 locale layout 引入一次

### 環境變數

`VITE_*` → `NEXT_PUBLIC_*`（SIMPLE/MARKDOWN/PRIVATE BOT_PROVIDER_ENDPOINT + API_KEY）

## 共用元件

| 元件 | 說明 |
|------|------|
| AppSidebar | shadcn Sidebar，四組導航 + Footer（dark mode 切換 + 語言切換） |
| DemoSection / DemoCard | 頁面標題描述 + shadcn Card 控制面板 |
| CodeBlock | shiki 語法高亮，可折疊，一鍵複製 |
| ThemeProvider | next-themes 包裝 |

## shadcn/ui 元件

button, card, badge, switch, tabs, sidebar, separator, scroll-area, collapsible, tooltip

## 遷移轉換規則

| 項目 | react-demo → demo |
|------|-------------------|
| 路由 | React Router → App Router 目錄結構 |
| 樣式 | SCSS Modules → Tailwind + shadcn/ui |
| 環境變數 | `import.meta.env.VITE_*` → `process.env.NEXT_PUBLIC_*` |
| 硬編碼文字 | 英文字串 → `useTranslations()` |
| Mock data | 原封搬遷至 `src/data/mock-messages.ts` |

## 根 package.json

```
新增  "serve:demo": "nx serve demo"
新增  "build:demo": "nx run demo:build"
移除  "serve:react-demo": "nx serve react-demo"
```

demo 的 `package.json` script 命名為 `serve`（`next dev --turbopack --port 4200`），對應 Nx 的 `serveTargetName`。

## 完成後

1. 刪除 `apps/react-demo/`
2. 驗證：`npm run serve:demo` 啟動、`npm run build:demo` 通過、14 頁功能正常、sidebar active state、fullscreen 無 sidebar、語言切換、dark mode、code block 折疊複製
