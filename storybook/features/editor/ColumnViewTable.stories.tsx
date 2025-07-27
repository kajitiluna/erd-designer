import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';

import ColumnViewTable from '../../../src/features/editor/ColumnViewTable';
import { ColumnShareModelStorageContext } from '../../../src/context/ColumnShareModelStorageContext';
import ColumnShareModelStorage from '../../../src/models/ColumnShareModelStorage';
import ColumnModel from '../../../src/models/database/ColumnModel';
import ColumnShareModel from '../../../src/models/database/ColumnShareModel';
import ColumnType from '../../../src/models/database/ColumnType';
import ColumnGroupModel from '../../../src/models/database/ColumnGroupModel';
import { ColumnWrapModel } from '../../../src/features/editor/support';
import { Database } from '../../../src/models/database';

// Mock context providers and data
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

const createMockColumnGroupModel = (id: string, groupName: string, columnIds: string[]): ColumnGroupModel => {
  return new ColumnGroupModel({
    columnGroupId: id,
    groupName,
    columnModelIds: columnIds,
    description: `Description for ${groupName}`,
  });
};

// Create mock storage
const mockStorage = new ColumnShareModelStorage([
  createMockColumnShareModel('share1', 'id', 'ID', ColumnType.INT),
  createMockColumnShareModel('share2', 'name', 'Name', ColumnType.VARCHAR),
  createMockColumnShareModel('share3', 'email', 'Email', ColumnType.VARCHAR),
  createMockColumnShareModel('share4', 'created_at', 'Created At', ColumnType.TIMESTAMP),
  createMockColumnShareModel('share5', 'user_id', 'User ID', ColumnType.INT),
]);

// Create mock column models
const mockColumns = [
  createMockColumnModel('col1', 'share1', true, true, true), // Primary key
  createMockColumnModel('col2', 'share2', false, true, false),
  createMockColumnModel('col3', 'share3', false, false, true), // Unique
  createMockColumnModel('col4', 'share4', false, true, false),
];

// Create mock column group
const mockColumnGroup = createMockColumnGroupModel('group1', 'User Info', ['col2', 'col3']);

// Mock context provider wrapper
const ColumnViewTableWithContext: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  return (
    <ColumnShareModelStorageContext.Provider
      value={{
        columnShareModelStorage: mockStorage,
        updateStorage: () => {},
      }}
    >
      {children}
    </ColumnShareModelStorageContext.Provider>
  );
};

const meta: Meta<typeof ColumnViewTable> = {
  title: 'Features/Editor/ColumnViewTable',
  component: ColumnViewTable,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: 'A table component for displaying and editing database columns with drag-and-drop reordering, inline editing, and group support.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ColumnViewTableWithContext>
        <div style={{ width: '100%', maxWidth: '1000px' }}>
          <Story />
        </div>
      </ColumnViewTableWithContext>
    ),
  ],
  argTypes: {
    columnWrapModels: {
      description: 'Array of column models to display in the table',
      control: false,
    },
    availableColumnGroup: {
      description: 'Whether column group functionality is available',
      control: { type: 'boolean' },
    },
    isChildRelation: {
      description: 'Function to check if a column is part of a child relation (foreign key)',
      control: false,
    },
    isEditableColumnType: {
      description: 'Function to check if a column type is editable',
      control: false,
    },
    onUpdateColumnWrapModels: {
      description: 'Callback function called when column models are updated',
      action: 'columns-updated',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Base story with individual columns
export const WithIndividualColumns: Story = {
  args: {
    columnWrapModels: mockColumns.map(col => ({
      modelType: 'single' as const,
      columnModel: col,
    })),
    availableColumnGroup: true,
    isChildRelation: (columnId: string) => columnId === 'col5', // Mock foreign key
    isEditableColumnType: () => true,
    onUpdateColumnWrapModels: (updateFn) => {
      console.log('Columns updated via function:', updateFn);
    },
  },
};

// Story with column groups
export const WithColumnGroups: Story = {
  args: {
    columnWrapModels: [
      {
        modelType: 'single' as const,
        columnModel: mockColumns[0], // Primary key column
      },
      {
        modelType: 'group' as const,
        columnGroupModel: mockColumnGroup,
        columnModels: [mockColumns[1], mockColumns[2]], // Name and Email
      },
      {
        modelType: 'single' as const,
        columnModel: mockColumns[3], // Created At
      },
    ],
    availableColumnGroup: true,
    isChildRelation: () => false,
    isEditableColumnType: () => true,
    onUpdateColumnWrapModels: (updateFn) => {
      console.log('Columns with groups updated:', updateFn);
    },
  },
};

// Story with foreign key relationships
export const WithForeignKeys: Story = {
  args: {
    columnWrapModels: [
      ...mockColumns.map(col => ({
        modelType: 'single' as const,
        columnModel: col,
      })),
      {
        modelType: 'single' as const,
        columnModel: createMockColumnModel('col5', 'share5', false, true, false),
      },
    ],
    availableColumnGroup: true,
    isChildRelation: (columnId: string) => columnId === 'col5', // User ID is foreign key
    isEditableColumnType: (column: ColumnModel) => !column.primaryKey, // Primary keys not editable
    onUpdateColumnWrapModels: (updateFn) => {
      console.log('Columns with foreign keys updated:', updateFn);
    },
  },
};

// Empty state
export const EmptyState: Story = {
  args: {
    columnWrapModels: [],
    availableColumnGroup: true,
    isChildRelation: () => false,
    isEditableColumnType: () => true,
    onUpdateColumnWrapModels: (updateFn) => {
      console.log('Empty table updated:', updateFn);
    },
  },
};

// Story without column group support
export const WithoutColumnGroupSupport: Story = {
  args: {
    columnWrapModels: mockColumns.map(col => ({
      modelType: 'single' as const,
      columnModel: col,
    })),
    availableColumnGroup: false, // No group functionality
    isChildRelation: () => false,
    isEditableColumnType: () => true,
    onUpdateColumnWrapModels: (updateFn) => {
      console.log('Columns updated without group support:', updateFn);
    },
  },
};