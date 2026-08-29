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

      // F-023 — stop-generation. `POST /message/suspend` is what "stop" actually calls; it only records
      // that a stop was asked for, and the run's own stream is what declares it stopped.
      server.middlewares.use('/mock-asgard/message/suspend', async (req, res, next) => {
        try {
          const { handleMockSuspend } = await import('./src/mock-server/sse-mock');

          await handleMockSuspend(req, res);
        } catch (err) {
          next(err as Error);
        }
      });

      // F-015 — join-init existence gate. Must be mounted so `GET /channel/metadata` reaches the mock
      // (defaults to 404) instead of the SPA fallback, which would break every Chatbot's mount gate.
      server.middlewares.use('/mock-asgard/channel/metadata', async (req, res, next) => {
        try {
          const { handleMockChannelMetadata } = await import('./src/mock-server/sse-mock');

          await handleMockChannelMetadata(req, res);
        } catch (err) {
          next(err as Error);
        }
      });

      // F-032 — `DELETE /channel`. Registered AFTER the metadata middleware above so `/channel/metadata`
      // still reaches that one: connect runs middlewares in registration order and `/channel` would
      // otherwise swallow it.
      server.middlewares.use('/mock-asgard/channel', async (req, res, next) => {
        try {
          const { handleMockChannelDelete } = await import('./src/mock-server/sse-mock');

          await handleMockChannelDelete(req, res);
        } catch (err) {
          next(err as Error);
        }
      });

      // Blob upload (`POST /blob`) — what `client.uploadFile()` calls when the composer has a pending
      // attachment. Mounted so the live send path completes without a real backend.
      server.middlewares.use('/mock-asgard/blob', async (req, res, next) => {
        try {
          const { handleMockBlobUpload } = await import('./src/mock-server/sse-mock');

          await handleMockBlobUpload(req, res);
        } catch (err) {
          next(err as Error);
        }
      });

      // F-021 — sandbox fs mock for the /file-explorer demo: list/file/stat + mutations
      // (mkdir/item/all/copy/move) + the `watch` SSE that drives the FileView's watch-and-reload.
      server.middlewares.use('/mock-asgard/sandbox', async (req, res, next) => {
        if (!/\/fs\/(list|file|stat|mkdir|item|all|copy|move|watch)/.test(req.url ?? '')) {
          next();

          return;
        }
        try {
          const { handleMockSandboxFs } = await import('./src/mock-server/sse-mock');

          await handleMockSandboxFs(req, res);
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
