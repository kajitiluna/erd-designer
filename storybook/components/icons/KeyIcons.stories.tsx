import type { Meta, StoryObj } from '@storybook/react';

import PrimaryKeyIcon from '../../../src/components/icons/PrimaryKeyIcon';
import ForeignKeyIcon from '../../../src/components/icons/ForeignKeyIcon';
import { Stack, Typography } from '@mui/material';

// Component wrapper to show both key icons
const KeyIconsDemo = ({ fontScale }: { fontScale: number }) => (
  <Stack direction="row" spacing={4} alignItems="center">
    <Stack alignItems="center" spacing={1}>
      <PrimaryKeyIcon fontScale={fontScale} />
      <Typography variant="caption">Primary Key</Typography>
    </Stack>
    <Stack alignItems="center" spacing={1}>
      <ForeignKeyIcon fontScale={fontScale} />
      <Typography variant="caption">Foreign Key</Typography>
    </Stack>
  </Stack>
);

const meta: Meta<typeof KeyIconsDemo> = {
  title: 'Components/Icons/KeyIcons',
  component: KeyIconsDemo,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Database key icons for representing primary and foreign keys in ERD diagrams. Icons are rotated and styled VPN key icons with different colors.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    fontScale: {
      description: 'Scale factor for icon size',
      control: { 
        type: 'range',
        min: 0.5,
        max: 3,
        step: 0.1,
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Default size
export const Default: Story = {
  args: {
    fontScale: 1,
  },
};

// Small size
export const Small: Story = {
  args: {
    fontScale: 0.7,
  },
};

// Large size
export const Large: Story = {
  args: {
    fontScale: 1.5,
  },
};

// Extra large size
export const ExtraLarge: Story = {
  args: {
    fontScale: 2.5,
  },
};

// Individual primary key icon story
const PrimaryKeyMeta: Meta<typeof PrimaryKeyIcon> = {
  title: 'Components/Icons/PrimaryKeyIcon',
  component: PrimaryKeyIcon,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    fontScale: {
      description: 'Scale factor for icon size',
      control: { 
        type: 'range',
        min: 0.5,
        max: 3,
        step: 0.1,
      },
    },
  },
};

export const PrimaryKeyDefault: StoryObj<typeof PrimaryKeyIcon> = {
  ...PrimaryKeyMeta,
  args: {
    fontScale: 1,
  },
};

// Individual foreign key icon story
const ForeignKeyMeta: Meta<typeof ForeignKeyIcon> = {
  title: 'Components/Icons/ForeignKeyIcon',
  component: ForeignKeyIcon,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    fontScale: {
      description: 'Scale factor for icon size',
      control: { 
        type: 'range',
        min: 0.5,
        max: 3,
        step: 0.1,
      },
    },
  },
};

export const ForeignKeyDefault: StoryObj<typeof ForeignKeyIcon> = {
  ...ForeignKeyMeta,
  args: {
    fontScale: 1,
  },
};