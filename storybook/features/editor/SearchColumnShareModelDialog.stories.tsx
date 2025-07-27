import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';

import SearchColumnShareModelDialog from '../../../src/features/editor/SearchColumnShareModelDialog';
import { ColumnShareModelStorageContext } from '../../../src/context/ColumnShareModelStorageContext';
import ColumnShareModelStorage from '../../../src/models/ColumnShareModelStorage';
import ColumnShareModel from '../../../src/models/database/ColumnShareModel';
import ColumnType from '../../../src/models/database/ColumnType';

// Mock helper functions
const createMockColumnShareModel = (id: string, physicalName: string, logicalName: string, columnType: ColumnType, description = ''): ColumnShareModel => {
  return new ColumnShareModel({
    columnShareModelId: id,
    physicalName,
    logicalName,
    columnType,
    precision: columnType === ColumnType.VARCHAR ? '255' : '',
    scale: columnType === ColumnType.DECIMAL ? '2' : '',
    unsigned: false,
    isArray: false,
    autoIncrement: columnType === ColumnType.INT && physicalName.includes('id'),
    defaultValue: '',
    description,
  });
};

// Mock data - comprehensive list of column share models
const mockColumnShareModels = [
  createMockColumnShareModel('share1', 'id', 'ID', ColumnType.INT, 'Primary key identifier'),
  createMockColumnShareModel('share2', 'user_id', 'User ID', ColumnType.INT, 'Foreign key to user table'),
  createMockColumnShareModel('share3', 'first_name', 'First Name', ColumnType.VARCHAR, 'User first name'),
  createMockColumnShareModel('share4', 'last_name', 'Last Name', ColumnType.VARCHAR, 'User last name'),
  createMockColumnShareModel('share5', 'email', 'Email Address', ColumnType.VARCHAR, 'User email address'),
  createMockColumnShareModel('share6', 'phone', 'Phone Number', ColumnType.VARCHAR, 'Contact phone number'),
  createMockColumnShareModel('share7', 'address', 'Address', ColumnType.TEXT, 'Full address'),
  createMockColumnShareModel('share8', 'created_at', 'Created At', ColumnType.TIMESTAMP, 'Record creation timestamp'),
  createMockColumnShareModel('share9', 'updated_at', 'Updated At', ColumnType.TIMESTAMP, 'Record update timestamp'),
  createMockColumnShareModel('share10', 'price', 'Price', ColumnType.DECIMAL, 'Product price'),
  createMockColumnShareModel('share11', 'quantity', 'Quantity', ColumnType.INT, 'Item quantity'),
  createMockColumnShareModel('share12', 'active', 'Active', ColumnType.BOOLEAN, 'Status flag'),
  createMockColumnShareModel('share13', 'description', 'Description', ColumnType.TEXT, 'Detailed description'),
  createMockColumnShareModel('share14', 'category_id', 'Category ID', ColumnType.INT, 'Product category'),
  createMockColumnShareModel('share15', 'product_name', 'Product Name', ColumnType.VARCHAR, 'Name of the product'),
];

// Create mock storage
const mockStorage = new ColumnShareModelStorage(mockColumnShareModels);

// Context wrapper component
const SearchColumnShareModelDialogWithContext: React.FC<{
  children: React.ReactNode;
  columnShareModels?: ColumnShareModel[];
}> = ({ children, columnShareModels = mockColumnShareModels }) => {
  const storage = new ColumnShareModelStorage(columnShareModels);
  
  return (
    <ColumnShareModelStorageContext.Provider
      value={{
        columnShareModelStorage: storage,
        updateStorage: () => {},
      }}
    >
      {children}
    </ColumnShareModelStorageContext.Provider>
  );
};

const meta: Meta<typeof SearchColumnShareModelDialog> = {
  title: 'Features/Editor/SearchColumnShareModelDialog',
  component: SearchColumnShareModelDialog,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A dialog component for searching and selecting column share models with filtering capabilities. Supports real-time search by physical name, logical name, type, and description.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <SearchColumnShareModelDialogWithContext>
        <div style={{ width: '100vw', height: '100vh' }}>
          <Story />
        </div>
      </SearchColumnShareModelDialogWithContext>
    ),
  ],
  argTypes: {
    isOpen: {
      description: 'Whether the search dialog is open',
      control: { type: 'boolean' },
    },
    associateColumnModel: {
      description: 'Callback function called when a column share model is selected',
      action: 'column-associated',
    },
    onClose: {
      description: 'Callback function called when the dialog is closed',
      action: 'dialog-closed',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Default search dialog with full data
export const Default: Story = {
  args: {
    isOpen: true,
    associateColumnModel: (columnShareModel) => {
      console.log('Column share model selected:', columnShareModel);
    },
    onClose: () => {
      console.log('Search dialog closed');
    },
  },
};

// Dialog with limited data
export const LimitedData: Story = {
  args: {
    isOpen: true,
    associateColumnModel: (columnShareModel) => {
      console.log('Column share model selected:', columnShareModel);
    },
    onClose: () => {
      console.log('Search dialog closed');
    },
  },
  decorators: [
    (Story) => (
      <SearchColumnShareModelDialogWithContext
        columnShareModels={[
          createMockColumnShareModel('share1', 'id', 'ID', ColumnType.INT, 'Primary key'),
          createMockColumnShareModel('share2', 'name', 'Name', ColumnType.VARCHAR, 'Item name'),
          createMockColumnShareModel('share3', 'created_at', 'Created At', ColumnType.TIMESTAMP, 'Creation time'),
        ]}
      >
        <div style={{ width: '100vw', height: '100vh' }}>
          <Story />
        </div>
      </SearchColumnShareModelDialogWithContext>
    ),
  ],
};

// Empty state
export const EmptyState: Story = {
  args: {
    isOpen: true,
    associateColumnModel: (columnShareModel) => {
      console.log('Column share model selected:', columnShareModel);
    },
    onClose: () => {
      console.log('Search dialog closed');
    },
  },
  decorators: [
    (Story) => (
      <SearchColumnShareModelDialogWithContext columnShareModels={[]}>
        <div style={{ width: '100vw', height: '100vh' }}>
          <Story />
        </div>
      </SearchColumnShareModelDialogWithContext>
    ),
  ],
};

// Closed state
export const Closed: Story = {
  args: {
    isOpen: false,
    associateColumnModel: (columnShareModel) => {
      console.log('Column share model selected:', columnShareModel);
    },
    onClose: () => {
      console.log('Search dialog closed');
    },
  },
};

// Story with specific column types for demonstration
export const TypeSpecificData: Story = {
  args: {
    isOpen: true,
    associateColumnModel: (columnShareModel) => {
      console.log('Column share model selected:', columnShareModel);
    },
    onClose: () => {
      console.log('Search dialog closed');
    },
  },
  decorators: [
    (Story) => (
      <SearchColumnShareModelDialogWithContext
        columnShareModels={[
          createMockColumnShareModel('share1', 'varchar_field', 'Text Field', ColumnType.VARCHAR, 'Variable character field'),
          createMockColumnShareModel('share2', 'int_field', 'Number Field', ColumnType.INT, 'Integer field'),
          createMockColumnShareModel('share3', 'decimal_field', 'Decimal Field', ColumnType.DECIMAL, 'Decimal number field'),
          createMockColumnShareModel('share4', 'boolean_field', 'Flag Field', ColumnType.BOOLEAN, 'Boolean flag'),
          createMockColumnShareModel('share5', 'timestamp_field', 'Time Field', ColumnType.TIMESTAMP, 'Timestamp field'),
          createMockColumnShareModel('share6', 'text_field', 'Long Text', ColumnType.TEXT, 'Long text field'),
        ]}
      >
        <div style={{ width: '100vw', height: '100vh' }}>
          <Story />
        </div>
      </SearchColumnShareModelDialogWithContext>
    ),
  ],
};