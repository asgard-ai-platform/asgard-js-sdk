const nx = require('@nx/eslint-plugin');

module.exports = [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      // Build outputs
      '**/dist/**',
      '**/build/**',
      '**/out/**',
      '**/.next/**',
      '**/coverage/**',

      // Dependencies & cache
      '**/node_modules/**',
      '**/.nx/**',
      '**/.cache/**',

      // Config files
      '**/eslint.config.cjs',
      '**/eslint.config.mjs',
      '**/vite.config.ts',
      '**/vitest.config.ts',
      '**/vitest.workspace.ts',
      '**/playwright.config.ts',
      '**/next.config.ts',
      '**/next.config.js',
      '**/next.config.mjs',
      '**/tailwind.config.js',
      '**/tailwind.config.ts',
      '**/postcss.config.js',
      '**/postcss.config.mjs',

      // Generated files
      '**/*.generated.*',
      '**/*.d.ts',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.cjs', '**/*.mjs'],
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-console': 'warn',
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: 'return' },
        { blankLine: 'always', prev: '*', next: 'break' },
        { blankLine: 'always', prev: 'block', next: '*' },
        { blankLine: 'always', prev: 'block-like', next: '*' },
        { blankLine: 'always', prev: 'if', next: '*' },
      ],
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?js$'],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
    },
  },
];
