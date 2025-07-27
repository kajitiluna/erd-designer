import type { Meta, StoryObj } from '@storybook/react';

import LocalApplication from '../../src/features/LocalApplication';

const meta: Meta<typeof LocalApplication> = {
  title: 'Features/LocalApplication',
  component: LocalApplication,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'The main local application component that manages local storage and document state.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Default local application
export const Default: Story = {};