import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';

import IndexViewTable from '../../../src/features/editor/IndexViewTable';
import { ColumnShareModelStorageContext } from '../../../src/context/ColumnShareModelStorageContext';
import ColumnShareModelStorage from '../../../src/models/ColumnShareModelStorage';
import ColumnModel from '../../../src/models/database/ColumnModel';
import ColumnShareModel from '../../../src/models/database/ColumnShareModel';
import ColumnType from '../../../src/models/database/ColumnType';
import TableIndexModel, { IndexColumnModel } from '../../../src/models/database/TableIndexModel';
import { ColumnWrapModel } from '../../../src/features/editor/support';
import { Database } from '../../../src/models/database';

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

const createMockIndexColumnModel = (columnModelId: string, sortOrder: 'ASC' | 'DESC' | '' = '', nullsOrder: 'FIRST' | 'LAST' | '' = ''): IndexColumnModel => {
  return new IndexColumnModel({
    columnModelId,
    sortOrderType: sortOrder,
    nullsOrderType: nullsOrder,
  });
};

const createMockTableIndexModel = (id: string, physicalName: string, indexColumns: IndexColumnModel[], indexType = '', clustered = false): TableIndexModel => {
  return new TableIndexModel({
    tableIndexModelId: id,
    physicalName,
    indexColumnModels: indexColumns,
    indexType: indexType as any,
    clustered,
    description: `Index on ${physicalName}`,
  });
};

// Mock data
const mockColumnShareModels = [
  createMockColumnShareModel('share1', 'id', 'ID', ColumnType.INT),
  createMockColumnShareModel('share2', 'name', 'Name', ColumnType.VARCHAR),
  createMockColumnShareModel('share3', 'email', 'Email', ColumnType.VARCHAR),
  createMockColumnShareModel('share4', 'created_at', 'Created At', ColumnType.TIMESTAMP),
  createMockColumnShareModel('share5', 'user_id', 'User ID', ColumnType.INT),
];

const mockColumnModels = [
  createMockColumnModel('col1', 'share1', true, true, true), // Primary key
  createMockColumnModel('col2', 'share2', false, true, false),
  createMockColumnModel('col3', 'share3', false, false, true), // Unique
  createMockColumnModel('col4', 'share4', false, true, false),
  createMockColumnModel('col5', 'share5', false, true, false), // Foreign key
];

const mockColumnWrapModels: ColumnWrapModel[] = mockColumnModels.map(col => ({
  modelType: 'single' as const,
  columnModel: col,
}));

const mockTableIndexModels = [
  createMockTableIndexModel('idx1', 'idx_users_email', [
    createMockIndexColumnModel('col3', 'ASC'),
  ], 'BTREE'),
  createMockTableIndexModel('idx2', 'idx_users_name_created', [
    createMockIndexColumnModel('col2', 'ASC'),
    createMockIndexColumnModel('col4', 'DESC', 'LAST'),
  ], 'BTREE'),
  createMockTableIndexModel('idx3', 'idx_users_foreign', [
    createMockIndexColumnModel('col5', 'ASC'),
  ], 'HASH'),
];

// Mock storage
const mockStorage = new ColumnShareModelStorage(mockColumnShareModels);

// Context wrapper component
const IndexViewTableWithContext: React.FC<{
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

const meta: Meta<typeof IndexViewTable> = {
  title: 'Features/Editor/IndexViewTable',
  component: IndexViewTable,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: 'A table component for managing database indexes with drag-and-drop reordering, column selection, and index configuration options.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <IndexViewTableWithContext>
        <div style={{ width: '100%', maxWidth: '1200px' }}>
          <Story />
        </div>
      </IndexViewTableWithContext>
    ),
  ],
  argTypes: {
    database: {
      description: 'Database type for index support configuration',
      control: false,
    },
    columnWrapModels: {
      description: 'Array of column models available for indexing',
      control: false,
    },
    tableIndexModels: {
      description: 'Array of existing table index models',
      control: false,
    },
    isChildRelation: {
      description: 'Function to check if a column is part of a child relation (foreign key)',
      control: false,
    },
    onUpdateTableIndexModels: {
      description: 'Callback function called when table index models are updated',
      action: 'indexes-updated',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Story with multiple indexes
export const WithMultipleIndexes: Story = {
  args: {
    database: Database.MYSQL,
    columnWrapModels: mockColumnWrapModels,
    tableIndexModels: mockTableIndexModels,
    isChildRelation: (columnId: string) => columnId === 'col5', // User ID is foreign key
    onUpdateTableIndexModels: (updateFn) => {
      console.log('Table indexes updated:', updateFn);
    },
  },
};

// Empty state with no indexes
export const EmptyState: Story = {
  args: {
    database: Database.MYSQL,
    columnWrapModels: mockColumnWrapModels,
    tableIndexModels: [],
    isChildRelation: () => false,
    onUpdateTableIndexModels: (updateFn) => {
      console.log('Empty indexes table updated:', updateFn);
    },
  },
};

// Story with single column index
export const SingleColumnIndex: Story = {
  args: {
    database: Database.POSTGRESQL,
    columnWrapModels: mockColumnWrapModels,
    tableIndexModels: [
      createMockTableIndexModel('idx1', 'idx_users_email_unique', [
        createMockIndexColumnModel('col3', 'ASC'),
      ], 'BTREE'),
    ],
    isChildRelation: () => false,
    onUpdateTableIndexModels: (updateFn) => {
      console.log('Single column index updated:', updateFn);
    },
  },
};

// Story with complex multi-column index
export const MultiColumnIndex: Story = {
  args: {
    database: Database.POSTGRESQL,
    columnWrapModels: mockColumnWrapModels,
    tableIndexModels: [
      createMockTableIndexModel('idx1', 'idx_users_complex', [
        createMockIndexColumnModel('col2', 'ASC'),
        createMockIndexColumnModel('col3', 'DESC', 'FIRST'),
        createMockIndexColumnModel('col4', 'ASC', 'LAST'),
      ], 'BTREE'),
    ],
    isChildRelation: () => false,
    onUpdateTableIndexModels: (updateFn) => {
      console.log('Multi-column index updated:', updateFn);
    },
  },
};

// Story with foreign key relationships
export const WithForeignKeyColumns: Story = {
  args: {
    database: Database.MYSQL,
    columnWrapModels: mockColumnWrapModels,
    tableIndexModels: [
      createMockTableIndexModel('idx1', 'idx_users_foreign_key', [
        createMockIndexColumnModel('col5', 'ASC'), // Foreign key column
      ], 'BTREE'),
      createMockTableIndexModel('idx2', 'idx_users_composite', [
        createMockIndexColumnModel('col2', 'ASC'),
        createMockIndexColumnModel('col5', 'ASC'), // Foreign key in composite
      ], 'BTREE'),
    ],
    isChildRelation: (columnId: string) => columnId === 'col5',
    onUpdateTableIndexModels: (updateFn) => {
      console.log('Indexes with foreign keys updated:', updateFn);
    },
  },
};

// Story with SQLite database (different index support)
export const SqliteDatabase: Story = {
  args: {
    database: Database.SQLITE,
    columnWrapModels: mockColumnWrapModels,
    tableIndexModels: [
      createMockTableIndexModel('idx1', 'idx_users_sqlite', [
        createMockIndexColumnModel('col2', 'ASC'),
        createMockIndexColumnModel('col3', 'DESC'),
      ]),
    ],
    isChildRelation: () => false,
    onUpdateTableIndexModels: (updateFn) => {
      console.log('SQLite indexes updated:', updateFn);
    },
  },
};