import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';

import ColumnGroupEditDialog from '../../../src/features/editor/ColumnGroupEditDialog';
import { ErdDocumentsHolderContext, ErdDocumentsHolder } from '../../../src/context/ErdDocumentsHolderContext';
import { ColumnShareModelStorageContext } from '../../../src/context/ColumnShareModelStorageContext';
import ErdDocument from '../../../src/models/ErdDocument';
import ColumnGroupModel from '../../../src/models/database/ColumnGroupModel';
import ColumnModel from '../../../src/models/database/ColumnModel';
import ColumnShareModel from '../../../src/models/database/ColumnShareModel';
import ColumnType from '../../../src/models/database/ColumnType';
import ColumnShareModelStorage from '../../../src/models/ColumnShareModelStorage';

// Mock helper functions
const createMockColumnShareModel = (id: string, physicalName: string, logicalName: string, columnType: ColumnType): ColumnShareModel => {
  return new ColumnShareModel({
    columnShareModelId: id,
    physicalName,
    logicalName,
    columnType,
    precision: '',
    scale: '',
    unsigned: false,
    isArray: false,
    autoIncrement: false,
    defaultValue: '',
    description: '',
  });
};

const createMockColumnModel = (id: string, shareModelId: string, primaryKey = false, notNull = false, unique = false): ColumnModel => {
  return new ColumnModel({
    columnModelId: id,
    columnShareModelId: shareModelId,
    primaryKey,
    notNull,
    unique,
    physicalNameOverride: '',
    logicalNameOverride: '',
    description: '',
  });
};

const createMockColumnGroupModel = (id: string, groupName: string, columnIds: string[], description = ''): ColumnGroupModel => {
  return new ColumnGroupModel({
    columnGroupId: id,
    groupName,
    columnModelIds: columnIds,
    description,
  });
};

// Mock data
const mockColumnShareModels = [
  createMockColumnShareModel('share1', 'first_name', 'First Name', ColumnType.VARCHAR),
  createMockColumnShareModel('share2', 'last_name', 'Last Name', ColumnType.VARCHAR),
  createMockColumnShareModel('share3', 'email', 'Email Address', ColumnType.VARCHAR),
  createMockColumnShareModel('share4', 'phone', 'Phone Number', ColumnType.VARCHAR),
];

const mockColumnModels = [
  createMockColumnModel('col1', 'share1', false, true, false),
  createMockColumnModel('col2', 'share2', false, true, false),
  createMockColumnModel('col3', 'share3', false, false, true),
  createMockColumnModel('col4', 'share4', false, false, false),
];

const mockColumnGroup = createMockColumnGroupModel(
  'group1',
  'Contact Information',
  ['col1', 'col2', 'col3'],
  'Personal contact information including name and email'
);

// Mock ErdDocument
const createMockErdDocument = (): ErdDocument => {
  const mockStorage = new ColumnShareModelStorage(mockColumnShareModels);
  
  const mockDocument = {
    getColumnShareModelStorage: () => mockStorage,
    findColumnModel: (id: string) => mockColumnModels.find(col => col.columnModelId === id),
    findColumnShareModel: (id: string) => mockColumnShareModels.find(share => share.columnShareModelId === id),
  } as unknown as ErdDocument;
  
  return mockDocument;
};

// Mock ErdDocumentsHolder
const createMockDocumentsHolder = (): ErdDocumentsHolder => {
  const mockDocument = createMockErdDocument();
  
  const mockHolder = {
    current: () => mockDocument,
    updateColumnGroup: (columnGroup: ColumnGroupModel, columnModels: ColumnModel[], storage: ColumnShareModelStorage) => {
      console.log('Column group updated:', { columnGroup, columnModels, storage });
    },
  } as unknown as ErdDocumentsHolder;
  
  return mockHolder;
};

// Context wrapper component
const ColumnGroupEditDialogWithContext: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const mockDocumentsHolder = createMockDocumentsHolder();
  
  return (
    <ErdDocumentsHolderContext.Provider value={mockDocumentsHolder}>
      {children}
    </ErdDocumentsHolderContext.Provider>
  );
};

const meta: Meta<typeof ColumnGroupEditDialog> = {
  title: 'Features/Editor/ColumnGroupEditDialog',
  component: ColumnGroupEditDialog,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A dialog component for editing column group details including name, description, and associated columns. Provides a table view of columns within the group.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ColumnGroupEditDialogWithContext>
        <div style={{ width: '100vw', height: '100vh' }}>
          <Story />
        </div>
      </ColumnGroupEditDialogWithContext>
    ),
  ],
  argTypes: {
    isOpen: {
      description: 'Whether the edit dialog is open',
      control: { type: 'boolean' },
    },
    columnGroup: {
      description: 'The column group model to edit',
      control: false,
    },
    onClose: {
      description: 'Callback function called when the dialog is closed',
      action: 'dialog-closed',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Default edit dialog
export const Default: Story = {
  args: {
    isOpen: true,
    columnGroup: mockColumnGroup,
    onClose: () => {
      console.log('Column group edit dialog closed');
    },
  },
};

// Empty column group
export const EmptyGroup: Story = {
  args: {
    isOpen: true,
    columnGroup: createMockColumnGroupModel('group2', 'Empty Group', [], 'An empty column group'),
    onClose: () => {
      console.log('Empty group edit dialog closed');
    },
  },
};

// Large column group
export const LargeGroup: Story = {
  args: {
    isOpen: true,
    columnGroup: createMockColumnGroupModel(
      'group3',
      'Comprehensive User Profile',
      ['col1', 'col2', 'col3', 'col4'],
      'A comprehensive set of user profile information including all contact details and personal information'
    ),
    onClose: () => {
      console.log('Large group edit dialog closed');
    },
  },
};

// Closed state
export const Closed: Story = {
  args: {
    isOpen: false,
    columnGroup: mockColumnGroup,
    onClose: () => {
      console.log('Column group edit dialog closed');
    },
  },
};