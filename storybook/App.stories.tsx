import type { Meta, StoryObj } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';

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
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/']}>
        <Story />
      </MemoryRouter>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Default local application view
export const LocalApp: Story = {
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/']}>
        <Story />
      </MemoryRouter>
    ),
  ],
};

// Google Drive application view
export const GoogleDriveApp: Story = {
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/erd-designer/gdrive/']}>
        <Story />
      </MemoryRouter>
    ),
  ],
};

// Terms of Service page
export const TermsOfService: Story = {
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/erd-designer/terms_of_service']}>
        <Story />
      </MemoryRouter>
    ),
  ],
};

// Privacy Policy page
export const PrivacyPolicy: Story = {
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/erd-designer/privacy_policy']}>
        <Story />
      </MemoryRouter>
    ),
  ],
};