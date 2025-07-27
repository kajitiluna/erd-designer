import type { Meta, StoryObj } from '@storybook/react';

import RegalFooter from '../../../src/features/regal/RegalFooter';

const meta: Meta<typeof RegalFooter> = {
  title: 'Features/Regal/RegalFooter',
  component: RegalFooter,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Footer component with legal links and version information.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Default footer
export const Default: Story = {};