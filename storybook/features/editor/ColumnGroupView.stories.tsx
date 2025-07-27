import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';

import ColumnGroupView from '../../../src/features/editor/ColumnGroupView';
import { ErdDocumentsHolderContext, ErdDocumentsHolder } from '../../../src/context/ErdDocumentsHolderContext';
import ErdDocument from '../../../src/models/ErdDocument';
import ColumnGroupModel from '../../../src/models/database/ColumnGroupModel';
import ColumnModel from '../../../src/models/database/ColumnModel';
import ColumnShareModel from '../../../src/models/database/ColumnShareModel';
import ColumnType from '../../../src/models/database/ColumnType';
import ColumnShareModelStorage from '../../../src/models/ColumnShareModelStorage';
import { ColumnWrapModel } from '../../../src/features/editor/support';

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
  createMockColumnShareModel('share1', 'id', 'ID', ColumnType.INT),
  createMockColumnShareModel('share2', 'name', 'Name', ColumnType.VARCHAR),
  createMockColumnShareModel('share3', 'email', 'Email', ColumnType.VARCHAR),
  createMockColumnShareModel('share4', 'created_at', 'Created At', ColumnType.TIMESTAMP),
  createMockColumnShareModel('share5', 'updated_at', 'Updated At', ColumnType.TIMESTAMP),
  createMockColumnShareModel('share6', 'phone', 'Phone Number', ColumnType.VARCHAR),
  createMockColumnShareModel('share7', 'address', 'Address', ColumnType.TEXT),
];

const mockColumnModels = [
  createMockColumnModel('col1', 'share1', true, true, true),
  createMockColumnModel('col2', 'share2', false, true, false),
  createMockColumnModel('col3', 'share3', false, false, true),
  createMockColumnModel('col4', 'share4', false, true, false),
  createMockColumnModel('col5', 'share5', false, false, false),
  createMockColumnModel('col6', 'share6', false, false, false),
  createMockColumnModel('col7', 'share7', false, false, false),
];

const mockColumnGroups = [
  createMockColumnGroupModel('group1', 'User Basic Info', ['col2', 'col3'], 'Basic user information including name and email'),
  createMockColumnGroupModel('group2', 'Timestamps', ['col4', 'col5'], 'Audit trail timestamps for record tracking'),
  createMockColumnGroupModel('group3', 'Contact Info', ['col6', 'col7'], 'Contact information including phone and address'),
];

// Mock ErdDocument
const createMockErdDocument = (): ErdDocument => {
  const mockStorage = new ColumnShareModelStorage(mockColumnShareModels);
  
  // Create a minimal mock document
  const mockDocument = {
    getColumnGroupModels: () => mockColumnGroups,
    findColumnModel: (id: string) => mockColumnModels.find(col => col.columnModelId === id),
    findColumnShareModel: (id: string) => mockColumnShareModels.find(share => share.columnShareModelId === id),
    getColumnShareModelStorage: () => mockStorage,
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
    deleteColumnGroup: (groupId: string) => {
      console.log('Column group deleted:', groupId);
    },
  } as unknown as ErdDocumentsHolder;
  
  return mockHolder;
};

// Context wrapper component
const ColumnGroupViewWithContext: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const mockDocumentsHolder = createMockDocumentsHolder();
  
  return (
    <ErdDocumentsHolderContext.Provider value={mockDocumentsHolder}>
      {children}
    </ErdDocumentsHolderContext.Provider>
  );
};

const meta: Meta<typeof ColumnGroupView> = {
  title: 'Features/Editor/ColumnGroupView',
  component: ColumnGroupView,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A dialog component for viewing, selecting, and managing column groups. Supports both selection mode for choosing existing groups and edit mode for full management.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ColumnGroupViewWithContext>
        <div style={{ width: '100vw', height: '100vh' }}>
          <Story />
        </div>
      </ColumnGroupViewWithContext>
    ),
  ],
  argTypes: {
    isOpen: {
      description: 'Whether the dialog is open',
      control: { type: 'boolean' },
    },
    viewMode: {
      description: 'Mode of the dialog - select for choosing groups, edit for full management',
      control: { type: 'radio' },
      options: ['select', 'edit'],
    },
    onSelect: {
      description: 'Callback function called when a column group is selected (in select mode)',
      action: 'group-selected',
    },
    onClose: {
      description: 'Callback function called when the dialog is closed',
      action: 'dialog-closed',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Selection mode story
export const SelectMode: Story = {
  args: {
    isOpen: true,
    viewMode: 'select',
    onSelect: (columnWrapModel: ColumnWrapModel) => {
      console.log('Selected column group:', columnWrapModel);
    },
    onClose: () => {
      console.log('Dialog closed');
    },
  },
};

// Edit mode story
export const EditMode: Story = {
  args: {
    isOpen: true,
    viewMode: 'edit',
    onSelect: (columnWrapModel: ColumnWrapModel) => {
      console.log('Selected column group:', columnWrapModel);
    },
    onClose: () => {
      console.log('Dialog closed');
    },
  },
};

// Closed state (for completeness)
export const Closed: Story = {
  args: {
    isOpen: false,
    viewMode: 'select',
    onSelect: (columnWrapModel: ColumnWrapModel) => {
      console.log('Selected column group:', columnWrapModel);
    },
    onClose: () => {
      console.log('Dialog closed');
    },
  },
};

// Empty state with no column groups
const ColumnGroupViewEmptyContext: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const mockErdDocument = {
    getColumnGroupModels: () => [], // Empty array
    findColumnModel: () => null,
    findColumnShareModel: () => null,
    getColumnShareModelStorage: () => new ColumnShareModelStorage([]),
  } as unknown as ErdDocument;
  
  const mockDocumentsHolder = {
    current: () => mockErdDocument,
    updateColumnGroup: () => {},
    deleteColumnGroup: () => {},
  } as unknown as ErdDocumentsHolder;
  
  return (
    <ErdDocumentsHolderContext.Provider value={mockDocumentsHolder}>
      {children}
    </ErdDocumentsHolderContext.Provider>
  );
};

export const EmptyState: Story = {
  args: {
    isOpen: true,
    viewMode: 'edit',
    onSelect: (columnWrapModel: ColumnWrapModel) => {
      console.log('Selected column group:', columnWrapModel);
    },
    onClose: () => {
      console.log('Dialog closed');
    },
  },
  decorators: [
    (Story) => (
      <ColumnGroupViewEmptyContext>
        <div style={{ width: '100vw', height: '100vh' }}>
          <Story />
        </div>
      </ColumnGroupViewEmptyContext>
    ),
  ],
};