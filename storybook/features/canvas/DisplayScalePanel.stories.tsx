import type { Meta, StoryObj } from '@storybook/react';

import DisplayScalePanel from '../../../src/features/canvas/DisplayScalePanel';

const meta: Meta<typeof DisplayScalePanel> = {
  title: 'Features/Canvas/DisplayScalePanel',
  component: DisplayScalePanel,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A zoom control panel with zoom in/out buttons and a scale dropdown selector.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    scale: {
      description: 'Current zoom scale (0.05 to 2)',
      control: { 
        type: 'select',
        options: [0.05, 0.1, 0.25, 0.5, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]
      },
    },
    onChangeScale: {
      description: 'Callback function called when scale changes',
    },
  },
  args: {
    onChangeScale: (scale: number) => console.log('scale-changed', scale),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Default scale (100%)
export const Default: Story = {
  args: {
    scale: 1,
  },
};

// Minimum scale (5%)
export const MinimumScale: Story = {
  args: {
    scale: 0.05,
  },
};

// Maximum scale (200%)
export const MaximumScale: Story = {
  args: {
    scale: 2,
  },
};

// Common scales
export const FiftyPercent: Story = {
  args: {
    scale: 0.5,
  },
};

export const SeventyFivePercent: Story = {
  args: {
    scale: 0.75,
  },
};

export const OneHundredTwentyFivePercent: Story = {
  args: {
    scale: 1.25,
  },
};

export const OneHundredFiftyPercent: Story = {
  args: {
    scale: 1.5,
  },
};