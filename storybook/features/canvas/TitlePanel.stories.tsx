import type { Meta, StoryObj } from '@storybook/react';

import TitlePanel from '../../../src/features/canvas/TitlePanel';
import { ErdDocumentsHolderContext } from '../../../src/context/ErdDocumentsHolderContext';
import ErdDocument from '../../../src/models/ErdDocument';
import DatabaseSettingModel from '../../../src/models/DatabaseSettingModel';

// Mock context provider for the story
const createMockErdDocuments = (databaseType: 'postgres' | 'mysql' | 'ms_sqlserver' = 'postgres', documentName = 'Sample ERD') => {
  const erdDocument = new ErdDocument();
  erdDocument.documentName = documentName;
  erdDocument.databaseSettingModel = new DatabaseSettingModel();
  erdDocument.databaseSettingModel.databaseType = databaseType;

  return {
    current: () => erdDocument,
    updateDocumentName: (name: string) => console.log('updateDocumentName', name),
    undoableEditErdDocument: (updater: any) => console.log('undoableEditErdDocument', updater),
    erdDocumentHistory: {
      canUndo: false,
      canRedo: false,
      undo: () => console.log('undo'),
      redo: () => console.log('redo'),
    },
  };
};

const meta: Meta<typeof TitlePanel> = {
  title: 'Features/Canvas/TitlePanel',
  component: TitlePanel,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'The title panel for the ERD canvas, showing database type icon, editable document name, and settings menu.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

// PostgreSQL database
export const PostgreSQL: Story = {
  decorators: [
    (Story) => (
      <ErdDocumentsHolderContext.Provider value={createMockErdDocuments('postgres', 'PostgreSQL ERD')}>
        <Story />
      </ErdDocumentsHolderContext.Provider>
    ),
  ],
};

// MySQL database  
export const MySQL: Story = {
  decorators: [
    (Story) => (
      <ErdDocumentsHolderContext.Provider value={createMockErdDocuments('mysql', 'MySQL ERD')}>
        <Story />
      </ErdDocumentsHolderContext.Provider>
    ),
  ],
};

// SQL Server database
export const SQLServer: Story = {
  decorators: [
    (Story) => (
      <ErdDocumentsHolderContext.Provider value={createMockErdDocuments('ms_sqlserver', 'SQL Server ERD')}>
        <Story />
      </ErdDocumentsHolderContext.Provider>
    ),
  ],
};

// Default with long document name
export const LongDocumentName: Story = {
  decorators: [
    (Story) => (
      <ErdDocumentsHolderContext.Provider value={createMockErdDocuments('postgres', 'Very Long Document Name That Should Be Editable')}>
        <Story />
      </ErdDocumentsHolderContext.Provider>
    ),
  ],
};