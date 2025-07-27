import type { Meta, StoryObj } from '@storybook/react';

import ExplanationPanel from '../../../src/features/regal/ExplanationPanel';

const meta: Meta<typeof ExplanationPanel> = {
  title: 'Features/Regal/ExplanationPanel',
  component: ExplanationPanel,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Panel displaying application explanation and features with markdown content.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Default explanation panel
export const Default: Story = {};