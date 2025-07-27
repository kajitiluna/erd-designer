import type { Meta, StoryObj } from '@storybook/react';

import TermsOfServicePanel from '../../../src/features/regal/TermsOfServicePanel';

const meta: Meta<typeof TermsOfServicePanel> = {
  title: 'Features/Regal/TermsOfServicePanel',
  component: TermsOfServicePanel,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Panel displaying the terms of service in both Japanese and English with markdown content.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Default terms of service panel
export const Default: Story = {};