/// <reference types='vitest' />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

// Dev-only: 在 dev server 內攔截 POST `/mock-asgard/message/sse`，回傳 streaming SSE，
// 讓 demo 不需要真實 Asgard backend 也能測 send-message + bot streaming 行為。
function asgardSseMockPlugin(): Plugin {
  return {
    name: 'asgard-sse-mock',
    configureServer(server) {
      server.middlewares.use('/mock-asgard/message/sse', async (req, res, next) => {
        try {
          const { handleMockSse } = await import('./src/mock-server/sse-mock');

          await handleMockSse(req, res);
        } catch (err) {
          next(err as Error);
        }
      });

      // F-015: GET channel metadata probe (restore vs. reset/empty decision).
      server.middlewares.use('/mock-asgard/channel/metadata', async (req, res, next) => {
        try {
          const { handleMockChannelMetadata } = await import('./src/mock-server/sse-mock');

          await handleMockChannelMetadata(req, res);
        } catch (err) {
          next(err as Error);
        }
      });
    },
  };
}

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/react-demo',
  server: {
    port: 4200,
    host: 'localhost',
  },
  preview: {
    port: 4200,
    host: 'localhost',
  },
  plugins: [react(), svgr(), nxViteTsPaths(), asgardSseMockPlugin()],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
}));
