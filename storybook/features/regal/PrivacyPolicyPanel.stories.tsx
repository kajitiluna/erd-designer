import type { Meta, StoryObj } from '@storybook/react';

import PrivacyPolicyPanel from '../../../src/features/regal/PrivacyPolicyPanel';

const meta: Meta<typeof PrivacyPolicyPanel> = {
  title: 'Features/Regal/PrivacyPolicyPanel',
  component: PrivacyPolicyPanel,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Panel displaying the privacy policy in both Japanese and English with markdown content.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Default privacy policy panel
export const Default: Story = {};