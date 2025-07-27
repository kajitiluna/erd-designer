import type { Meta, StoryObj } from '@storybook/react';
import { Stack, Typography, Paper } from '@mui/material';

import MySQLIcon from '../../../src/components/icons/MySQLIcon';
import PostgreSQLIcon from '../../../src/components/icons/PostgreSQLIcon';
import MsSQLServerIcon from '../../../src/components/icons/MsSQLServerIcon';

// Component wrapper to show all database icons
const DatabaseIconsDemo = ({ size }: { size: 'small' | 'medium' | 'large' }) => {
  const iconStyle = {
    width: size === 'small' ? 24 : size === 'large' ? 48 : 32,
    height: size === 'small' ? 24 : size === 'large' ? 48 : 32,
  };
  
  return (
    <Stack direction="row" spacing={4} alignItems="center">
      <Paper elevation={1} sx={{ padding: 2, textAlign: 'center' }}>
        <Stack alignItems="center" spacing={1}>
          <div style={iconStyle}>
            <MySQLIcon />
          </div>
          <Typography variant="caption">MySQL</Typography>
        </Stack>
      </Paper>
      
      <Paper elevation={1} sx={{ padding: 2, textAlign: 'center' }}>
        <Stack alignItems="center" spacing={1}>
          <div style={iconStyle}>
            <PostgreSQLIcon />
          </div>
          <Typography variant="caption">PostgreSQL</Typography>
        </Stack>
      </Paper>
      
      <Paper elevation={1} sx={{ padding: 2, textAlign: 'center' }}>
        <Stack alignItems="center" spacing={1}>
          <div style={iconStyle}>
            <MsSQLServerIcon />
          </div>
          <Typography variant="caption">MS SQL Server</Typography>
        </Stack>
      </Paper>
    </Stack>
  );
};

const meta: Meta<typeof DatabaseIconsDemo> = {
  title: 'Components/Icons/DatabaseIcons',
  component: DatabaseIconsDemo,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Database vendor icons for representing different database types in ERD diagrams. Includes MySQL, PostgreSQL, and MS SQL Server icons.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      description: 'Size of the database icons',
      control: { type: 'radio' },
      options: ['small', 'medium', 'large'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Default size
export const Default: Story = {
  args: {
    size: 'medium',
  },
};

// Small size
export const Small: Story = {
  args: {
    size: 'small',
  },
};

// Large size
export const Large: Story = {
  args: {
    size: 'large',
  },
};

// Individual MySQL icon story
const MySQLMeta: Meta<typeof MySQLIcon> = {
  title: 'Components/Icons/MySQLIcon',
  component: MySQLIcon,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'MySQL database icon with the official MySQL styling and colors.',
      },
    },
  },
  tags: ['autodocs'],
};

export const MySQLDefault: StoryObj<typeof MySQLIcon> = {
  ...MySQLMeta,
  render: () => (
    <Paper elevation={2} sx={{ padding: 3, textAlign: 'center' }}>
      <Stack alignItems="center" spacing={2}>
        <MySQLIcon />
        <Typography variant="h6">MySQL Database</Typography>
      </Stack>
    </Paper>
  ),
};

// Individual PostgreSQL icon story
const PostgreSQLMeta: Meta<typeof PostgreSQLIcon> = {
  title: 'Components/Icons/PostgreSQLIcon',
  component: PostgreSQLIcon,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'PostgreSQL database icon with the official PostgreSQL elephant logo styling.',
      },
    },
  },
  tags: ['autodocs'],
};

export const PostgreSQLDefault: StoryObj<typeof PostgreSQLIcon> = {
  ...PostgreSQLMeta,
  render: () => (
    <Paper elevation={2} sx={{ padding: 3, textAlign: 'center' }}>
      <Stack alignItems="center" spacing={2}>
        <PostgreSQLIcon />
        <Typography variant="h6">PostgreSQL Database</Typography>
      </Stack>
    </Paper>
  ),
};