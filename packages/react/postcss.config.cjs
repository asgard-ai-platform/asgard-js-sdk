/* eslint-disable @typescript-eslint/explicit-function-return-type */
const prefixSelector = require('postcss-prefix-selector');

/**
 * Custom plugin to unwrap @layer directives for library distribution.
 * This plugin is necessary because Tailwind CSS v4 generates @layer directives
 * that are not compatible with environments without Tailwind (e.g., Docusaurus).
 */
const unwrapLayers = () => {
  return {
    postcssPlugin: 'unwrap-layers',
    /**
     * Process CSS root and unwrap all @layer directives
     * @type {(root: any) => void}
     */
    Once: root => {
      root.walkAtRules('layer', rule => {
        // Replace @layer with its contents
        rule.replaceWith(rule.nodes);
      });
    },
  };
};

unwrapLayers.postcss = true;

/**
 * Scope all Tailwind utilities to .asgard-chatbot
 * This prevents SDK styles from affecting consumer's global styles
 *
 * IMPORTANT: Only apply to Tailwind CSS files, NOT CSS modules!
 * CSS modules files (.module.scss) should NOT be prefixed because:
 * 1. PostCSS runs BEFORE CSS modules
 * 2. If we add .asgard-chatbot prefix, CSS modules will hash it too
 * 3. Result: ._asgard-chatbot_xxx (CSS) vs .asgard-chatbot (HTML) = mismatch!
 */
const scopeUtilities = prefixSelector({
  prefix: '.asgard-chatbot',
  transform(prefix, selector, prefixedSelector, filePath, rule) {
    // Skip CSS modules files - they should NOT be prefixed
    // Because PostCSS runs before CSS modules, the prefix would get hashed
    if (filePath && filePath.includes('.module.')) {
      return selector;
    }
    // Skip CSS Variables definitions
    if (selector.includes(':root') || selector.includes(':host')) {
      return selector;
    }
    // Skip selectors that already have .asgard-chatbot
    if (selector.includes('.asgard-chatbot')) {
      return selector;
    }
    // Skip @keyframes internal rules
    if (rule.parent?.type === 'atrule' && rule.parent.name === 'keyframes') {
      return selector;
    }
    return prefixedSelector;
  },
});

module.exports = {
  plugins: [scopeUtilities, unwrapLayers],
};
