import type { Meta, StoryObj } from '@storybook/react';
import { Save, Delete, Edit, Visibility, Download } from '@mui/icons-material';

import EdgedIconButton from '../../src/components/EdgedIconButton';

const meta: Meta<typeof EdgedIconButton> = {
  title: 'Components/EdgedIconButton',
  component: EdgedIconButton,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A styled icon button with optional tooltip support and text display. Features rounded borders and background styling.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    disabled: {
      description: 'Whether the button is disabled',
      control: { type: 'boolean' },
    },
    tooltip: {
      description: 'Tooltip text to display on hover',
      control: { type: 'text' },
    },
    withText: {
      description: 'Whether to display tooltip text alongside the button',
      control: { type: 'boolean' },
    },
    onClick: {
      description: 'Click handler function',
      action: 'clicked',
    },
    children: {
      description: 'Icon component to display inside the button',
      control: false,
    },
  },
  args: {
    onClick: (event) => {
      console.log('Button clicked:', event);
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Basic button with save icon
export const BasicSave: Story = {
  args: {
    children: <Save />,
    tooltip: 'Save',
  },
};

// Button with delete icon and tooltip
export const DeleteButton: Story = {
  args: {
    children: <Delete />,
    tooltip: 'Delete item',
  },
};

// Button with edit icon, tooltip, and text
export const EditWithText: Story = {
  args: {
    children: <Edit />,
    tooltip: 'Edit item',
    withText: true,
  },
};

// Disabled button
export const DisabledButton: Story = {
  args: {
    children: <Visibility />,
    tooltip: 'View details',
    disabled: true,
  },
};

// Disabled button with text
export const DisabledWithText: Story = {
  args: {
    children: <Download />,
    tooltip: 'Download file',
    disabled: true,
    withText: true,
  },
};

// Button without tooltip
export const NoTooltip: Story = {
  args: {
    children: <Save />,
  },
};

// Button with long tooltip text
export const LongTooltip: Story = {
  args: {
    children: <Download />,
    tooltip: 'Download the selected file to your computer in the specified format',
  },
};

// Button with long tooltip text and with text display
export const LongTooltipWithText: Story = {
  args: {
    children: <Download />,
    tooltip: 'Download the selected file to your computer',
    withText: true,
  },
};