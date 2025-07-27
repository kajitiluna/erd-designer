import type { Meta, StoryObj } from '@storybook/react';

import InitializeDatabaseDialog from '../../../src/features/start_up/InitializeDatabaseDialog';

const meta: Meta<typeof InitializeDatabaseDialog> = {
  title: 'Features/StartUp/InitializeDatabaseDialog',
  component: InitializeDatabaseDialog,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A dialog for creating a new ERD document with database type selection.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    isOpen: {
      description: 'Whether the dialog is open',
      control: { type: 'boolean' },
    },
    onCreate: {
      description: 'Callback function called when a new ERD document is created',
    },
    onClose: {
      description: 'Callback function called when the dialog is closed',
    },
  },
  args: {
    onCreate: (erdDocument: any) => console.log('onCreate', erdDocument),
    onClose: () => console.log('onClose'),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Dialog open state
export const Open: Story = {
  args: {
    isOpen: true,
  },
};

// Dialog closed state
export const Closed: Story = {
  args: {
    isOpen: false,
  },
};