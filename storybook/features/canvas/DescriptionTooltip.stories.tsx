import type { Meta, StoryObj } from '@storybook/react';
import { Button, Typography } from '@mui/material';

import DescriptionTooltip from '../../../src/features/canvas/DescriptionTooltip';

const meta: Meta<typeof DescriptionTooltip> = {
  title: 'Features/Canvas/DescriptionTooltip',
  component: DescriptionTooltip,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A wrapper around MUI Tooltip that formats multi-line text descriptions with line breaks.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    title: {
      description: 'Tooltip text content',
      control: { type: 'text' },
    },
    placement: {
      description: 'Tooltip placement',
      control: { type: 'select' },
      options: ['top', 'bottom', 'left', 'right', 'top-start', 'top-end', 'bottom-start', 'bottom-end'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Single line tooltip
export const SingleLine: Story = {
  args: {
    title: 'This is a simple tooltip',
    placement: 'top',
    children: <Button variant="contained">Hover for tooltip</Button>,
  },
};

// Multi-line tooltip
export const MultiLine: Story = {
  args: {
    title: 'This is a multi-line tooltip\nSecond line\nThird line',
    placement: 'top',
    children: <Button variant="contained">Hover for multi-line tooltip</Button>,
  },
};

// With different placements
export const BottomPlacement: Story = {
  args: {
    title: 'Bottom tooltip',
    placement: 'bottom',
    children: <Button variant="outlined">Bottom tooltip</Button>,
  },
};

export const LeftPlacement: Story = {
  args: {
    title: 'Left tooltip',
    placement: 'left',
    children: <Button variant="outlined">Left tooltip</Button>,
  },
};

export const RightPlacement: Story = {
  args: {
    title: 'Right tooltip',
    placement: 'right',
    children: <Button variant="outlined">Right tooltip</Button>,
  },
};

// With different child components
export const WithTypography: Story = {
  args: {
    title: 'Tooltip on text component',
    placement: 'top',
    children: <Typography variant="h6">Hover over this text</Typography>,
  },
};