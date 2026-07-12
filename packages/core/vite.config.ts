/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import * as path from 'path';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/packages/core',
  resolve: {
    alias: {
      src: path.resolve(__dirname, 'src'),
    },
  },
  plugins: [
    dts({
      entryRoot: 'src',
      tsconfigPath: path.join(__dirname, 'tsconfig.lib.json'),
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
  // Configuration for building your library.
  // See: https://vitejs.dev/guide/build.html#library-mode
  build: {
    outDir: './dist',
    minify: 'esbuild',
    emptyOutDir: true,
    reportCompressedSize: true,
    sourcemap: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    lib: {
      // Could also be a dictionary or array of multiple entry points.
      entry: 'src/index.ts',
      name: '@asgard-js/core',
      fileName: 'index',
    },
    rollupOptions: {
      // External packages that should not be bundled into your library.
      external: [],
      output: [
        {
          format: 'es',
          dir: 'dist',
          entryFileNames: 'index.mjs',
        },
        {
          format: 'cjs',
          dir: 'dist',
          entryFileNames: 'index.cjs',
        },
        {
          format: 'umd',
          name: '@asgard-js/core',
          dir: 'dist',
          entryFileNames: 'index.js',
        },
      ],
    },
  },
});
