/// <reference types='vitest' />
import { defineConfig } from 'vite';
import { defineConfig as defineVitestConfig, mergeConfig } from 'vitest/config';
import dts from 'vite-plugin-dts';
import * as path from 'path';

const viteConfig = defineConfig({
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
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },
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
      // Change this to the formats you want to support.
      // Don't forget to update your package.json as well.
      // formats: ['es', 'cjs', 'umd'],
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

const vitestConfig = defineVitestConfig({
  test: {
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8',
    },
  },
});

export default mergeConfig(viteConfig, vitestConfig);
