import type { Meta, StoryObj } from '@storybook/react';

import App from '../src/App';

const meta: Meta<typeof App> = {
  title: 'App/Application',
  component: App,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'The main application component with routing for different views including local mode, Google Drive integration, and legal pages.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Default local application view
export const LocalApp: Story = {
  parameters: {
    backgrounds: { default: 'light' },
  },
};

// Google Drive application view - Note: This will show local app due to router constraints in Storybook
export const GoogleDriveApp: Story = {
  parameters: {
    backgrounds: { default: 'light' },
  },
};

// Terms of Service page - Note: This will show local app due to router constraints in Storybook
export const TermsOfService: Story = {
  parameters: {
    backgrounds: { default: 'light' },
  },
};

// Privacy Policy page - Note: This will show local app due to router constraints in Storybook
export const PrivacyPolicy: Story = {
  parameters: {
    backgrounds: { default: 'light' },
  },
};