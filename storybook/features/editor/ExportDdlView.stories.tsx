import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';

import ExportDdlView from '../../../src/features/editor/ExportDdlView';
import { ErdDocumentsHolder } from '../../../src/context/ErdDocumentsHolderContext';
import ErdDocument from '../../../src/models/ErdDocument';
import ErdSettingModel from '../../../src/models/ErdSettingModel';
import ExportDdlSettingModel from '../../../src/models/ExportDdlSettingModel';
import TableViewModel from '../../../src/models/TableViewModel';
import TableModel from '../../../src/models/database/TableModel';
import ColumnModel from '../../../src/models/database/ColumnModel';

// Mock helper functions
const createMockTableModel = (physicalName: string, hasColumns = true): TableModel => {
  const columns = hasColumns ? [
    new ColumnModel({
      columnModelId: `${physicalName}_col1`,
      columnShareModelId: 'share1',
      primaryKey: true,
      notNull: true,
      unique: false,
      physicalNameOverride: '',
      logicalNameOverride: '',
      description: '',
    }),
  ] : [];

  return new TableModel({
    tableModelId: `table_${physicalName}`,
    physicalName,
    logicalName: physicalName.charAt(0).toUpperCase() + physicalName.slice(1),
    columns,
    tableIndexModels: [],
    description: `Mock table: ${physicalName}`,
  });
};

const createMockTableViewModel = (tableModel: TableModel): TableViewModel => {
  return new TableViewModel({
    tableViewModel: tableModel,
    positionX: 100,
    positionY: 100,
    width: 200,
    height: 150,
  });
};

// Mock ErdDocument
const createMockErdDocument = (hasInvalidTables = false): ErdDocument => {
  const validTables = [
    createMockTableViewModel(createMockTableModel('users', true)),
    createMockTableViewModel(createMockTableModel('orders', true)),
  ];
  
  const invalidTables = hasInvalidTables ? [
    createMockTableViewModel(createMockTableModel('empty_table', false)),
  ] : [];
  
  const allTables = [...validTables, ...invalidTables];

  const mockErdSetting = new ErdSettingModel({
    exportDdlSetting: new ExportDdlSettingModel({
      fileName: 'database_schema',
      withTable: true,
      withIndex: true,
      withForeignKey: true,
      withComment: false,
    }),
  });

  const mockDocument = {
    erdSettingModel: mockErdSetting,
    getTableViewModels: () => allTables,
  } as unknown as ErdDocument;

  return mockDocument;
};

// Mock ErdDocumentsHolder
const createMockDocumentsHolder = (hasInvalidTables = false): ErdDocumentsHolder => {
  const mockDocument = createMockErdDocument(hasInvalidTables);
  
  const mockHolder = {
    current: () => mockDocument,
    updateSetting: (setting: ErdSettingModel) => {
      console.log('ERD setting updated:', setting);
    },
  } as unknown as ErdDocumentsHolder;
  
  return mockHolder;
};

const meta: Meta<typeof ExportDdlView> = {
  title: 'Features/Editor/ExportDdlView',
  component: ExportDdlView,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A dialog component for configuring and exporting DDL (Data Definition Language) files from the ERD document. Includes validation and customizable export options.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ width: '100vw', height: '100vh' }}>
        <Story />
      </div>
    ),
  ],
  argTypes: {
    documentsHolder: {
      description: 'ERD documents holder containing the current document and settings',
      control: false,
    },
    isViewOpen: {
      description: 'Whether the export dialog is open',
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

// Default export dialog
export const Default: Story = {
  args: {
    documentsHolder: createMockDocumentsHolder(false),
    isViewOpen: true,
    onClose: () => {
      console.log('Export dialog closed');
    },
  },
};

// Dialog with validation errors (empty tables)
export const WithValidationErrors: Story = {
  args: {
    documentsHolder: createMockDocumentsHolder(true), // Has invalid tables
    isViewOpen: true,
    onClose: () => {
      console.log('Export dialog closed');
    },
  },
};

// Closed state
export const Closed: Story = {
  args: {
    documentsHolder: createMockDocumentsHolder(false),
    isViewOpen: false,
    onClose: () => {
      console.log('Export dialog closed');
    },
  },
};

// Custom settings story with pre-configured options
export const CustomSettings: Story = {
  args: {
    documentsHolder: (() => {
      const holder = createMockDocumentsHolder(false);
      const document = holder.current();
      
      // Override the settings for this story
      const customSettings = new ErdSettingModel({
        exportDdlSetting: new ExportDdlSettingModel({
          fileName: 'custom_export_file.sql',
          withTable: true,
          withIndex: false,
          withForeignKey: false,
          withComment: true,
        }),
      });
      
      // Create a new mock document with custom settings
      const customDocument = {
        ...document,
        erdSettingModel: customSettings,
      } as ErdDocument;
      
      return {
        ...holder,
        current: () => customDocument,
      } as ErdDocumentsHolder;
    })(),
    isViewOpen: true,
    onClose: () => {
      console.log('Export dialog with custom settings closed');
    },
  },
};