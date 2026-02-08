import { composePlugins, withNx } from '@nx/next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig = {
  nx: { svgr: false },
  turbopack: {
    resolveAlias: {
      '@asgard-js/core': '../../packages/core/dist/index.mjs',
      '@asgard-js/react': '../../packages/react/dist/index.js',
    },
  },
};

export default composePlugins(withNx, withNextIntl)(nextConfig);
