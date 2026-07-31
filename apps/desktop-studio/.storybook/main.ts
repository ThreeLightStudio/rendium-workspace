import { resolve } from 'node:path';
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/renderer/src/**/*.stories.@(ts|tsx)', '../src/renderer/src/**/*.mdx'],

  addons: ['@storybook/addon-essentials', '@storybook/addon-interactions'],

  framework: {
    name: '@storybook/react-vite',
    options: {},
  },

  async viteFinal(config) {
    const { mergeConfig } = await import('vite');

    return mergeConfig(config, {
      resolve: {
        alias: {
          // tsconfig.web.json paths와 1:1 대응
          '@styled-system': resolve(__dirname, '../styled-system'),
          '@renderer': resolve(__dirname, '../src/renderer/src'),
        },
      },
      css: {
        postcss: resolve(__dirname, '../postcss.config.cjs'),
      },
    });
  },
};

export default config;
