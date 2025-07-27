import type { Meta, StoryObj } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';

import GoogleDriveApplication from '../../src/features/GoogleDriveApplication';

const meta: Meta<typeof GoogleDriveApplication> = {
  title: 'Features/GoogleDriveApplication',
  component: GoogleDriveApplication,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'The Google Drive integrated application component with OAuth authentication.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/erd-designer/gdrive/']}>
        <Story />
      </MemoryRouter>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Default Google Drive application
export const Default: Story = {};