import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  "stories": [
    "../storybook/**/*.mdx",
    "../storybook/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [
    "@storybook/addon-docs",
    "@storybook/addon-onboarding"
  ],
  "framework": {
    "name": "@storybook/react-vite",
    "options": {}
  },
  "core": {
    "disableTelemetry": true
  },
  "typescript": {
    "reactDocgen": "react-docgen-typescript"
  }
};
export default config;