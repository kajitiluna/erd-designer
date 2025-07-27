import type { Meta, StoryObj } from '@storybook/react';
import { Button, IconButton } from '@mui/material';
import { Info, Help, Settings } from '@mui/icons-material';

import TopLeftTooltip from '../../src/components/TopLeftTooltip';

const meta: Meta<typeof TopLeftTooltip> = {
  title: 'Components/TopLeftTooltip',
  component: TopLeftTooltip,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A tooltip component that positions itself at the top-left of the target element with dynamic offset based on title length.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    title: {
      description: 'The tooltip text to display',
      control: { type: 'text' },
    },
    children: {
      description: 'The target element that triggers the tooltip',
      control: false,
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Short tooltip text with button
export const ShortText: Story = {
  args: {
    title: 'Save',
    children: <Button variant="contained">Hover me</Button>,
  },
};

// Medium tooltip text
export const MediumText: Story = {
  args: {
    title: 'Save your changes',
    children: <Button variant="outlined">Hover for medium tooltip</Button>,
  },
};

// Long tooltip text (affects offset calculation)
export const LongText: Story = {
  args: {
    title: 'Save your changes to the database and continue working',
    children: <Button variant="contained" color="secondary">Hover for long tooltip</Button>,
  },
};

// Very long tooltip text
export const VeryLongText: Story = {
  args: {
    title: 'This is a very long tooltip text that demonstrates how the offset calculation works based on the square root of the title length to position the tooltip appropriately',
    children: <Button variant="contained" color="warning">Very long tooltip</Button>,
  },
};

// Tooltip with icon button
export const WithIconButton: Story = {
  args: {
    title: 'Information',
    children: <IconButton><Info /></IconButton>,
  },
};

// Tooltip with different icon
export const WithHelpIcon: Story = {
  args: {
    title: 'Get help with this feature',
    children: <IconButton color="primary"><Help /></IconButton>,
  },
};

// Tooltip with settings icon and long text
export const SettingsWithLongText: Story = {
  args: {
    title: 'Open application settings and configuration options',
    children: <IconButton color="secondary"><Settings /></IconButton>,
  },
};

// Single character tooltip
export const SingleCharacter: Story = {
  args: {
    title: '?',
    children: <Button size="small">?</Button>,
  },
};

// Empty tooltip (edge case)
export const EmptyTooltip: Story = {
  args: {
    title: '',
    children: <Button variant="text">No tooltip</Button>,
  },
};