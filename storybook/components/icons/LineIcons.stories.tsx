import type { Meta, StoryObj } from '@storybook/react';
import { Stack, Typography } from '@mui/material';

import LineStraightIcon from '../../../src/components/icons/LineStraightIcon';
import LineOrthogonalIcon from '../../../src/components/icons/LineOrthogonalIcon';
import LineSelectorIcon from '../../../src/components/icons/LineSelectorIcon';
import LineWidthIcon from '../../../src/components/icons/LineWidthIcon';

// Component wrapper to show all line icons
const LineIconsDemo = ({ size }: { size: 'small' | 'medium' | 'large' }) => {
  const iconStyle = {
    width: size === 'small' ? 16 : size === 'medium' ? 24 : 32,
    height: size === 'small' ? 16 : size === 'medium' ? 24 : 32,
  };

  return (
    <Stack direction="row" spacing={4} alignItems="center">
      <Stack alignItems="center" spacing={1}>
        <LineStraightIcon sx={iconStyle} />
        <Typography variant="caption">Straight Line</Typography>
      </Stack>
      <Stack alignItems="center" spacing={1}>
        <LineOrthogonalIcon sx={iconStyle} />
        <Typography variant="caption">Orthogonal Line</Typography>
      </Stack>
      <Stack alignItems="center" spacing={1}>
        <LineSelectorIcon sx={iconStyle} />
        <Typography variant="caption">Line Selector</Typography>
      </Stack>
      <Stack alignItems="center" spacing={1}>
        <LineWidthIcon sx={iconStyle} />
        <Typography variant="caption">Line Width</Typography>
      </Stack>
    </Stack>
  );
};

const meta: Meta<typeof LineIconsDemo> = {
  title: 'Components/Icons/LineIcons',
  component: LineIconsDemo,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Collection of line-related SVG icons for ERD designer tools.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      description: 'Size of the icons',
      control: { type: 'radio' },
      options: ['small', 'medium', 'large'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Small icons
export const Small: Story = {
  args: {
    size: 'small',
  },
};

// Medium icons (default)
export const Medium: Story = {
  args: {
    size: 'medium',
  },
};

// Large icons
export const Large: Story = {
  args: {
    size: 'large',
  },
};