import type { Meta, StoryObj } from '@storybook/react';

import ImportFromDdlView from '../../../src/features/editor/ImportFromDdlView';

const meta: Meta<typeof ImportFromDdlView> = {
  title: 'Features/Editor/ImportFromDdlView',
  component: ImportFromDdlView,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'A dialog component for importing DDL statements into the ERD designer. Allows users to paste DDL text and import table structures. (Experimental feature)',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    isOpen: {
      description: 'Whether the import dialog is open',
      control: { type: 'boolean' },
    },
    onClose: {
      description: 'Callback function called when the dialog is closed',
      action: 'dialog-closed',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Open import dialog
export const Open: Story = {
  args: {
    isOpen: true,
    onClose: () => {
      console.log('Import DDL dialog closed');
    },
  },
};

// Closed import dialog
export const Closed: Story = {
  args: {
    isOpen: false,
    onClose: () => {
      console.log('Import DDL dialog closed');
    },
  },
};