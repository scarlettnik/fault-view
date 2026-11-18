import type { StorybookConfig } from '@storybook/react-vite';
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx'],
  addons: [],
  framework: '@storybook/react-vite',
  typescript: { reactDocgen: false },
  core: { disableTelemetry: true },
  viteFinal: async (config) => ({ ...config, base: './' }),
};
export default config;
