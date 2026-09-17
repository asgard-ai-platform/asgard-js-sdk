const nx = require('@nx/eslint-plugin');
const baseConfig = require('../../eslint.config.cjs');

module.exports = [
  ...baseConfig,
  ...nx.configs['flat/react'],
  {
    // Vendored third-party source, carried verbatim so it can still be diffed against upstream.
    // Linting it would mean restyling somebody else's Apache-2.0 file; see packages/react/src/vendor/README.md.
    ignores: ['src/vendor/guacamole-keyboard.js'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    // Override or add rules here
    rules: {},
  },
];
