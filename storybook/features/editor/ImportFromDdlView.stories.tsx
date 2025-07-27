import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';

import ImportFromDdlView from '../../../src/features/editor/ImportFromDdlView';
import { ErdDocumentsHolderContext, ErdDocumentsHolder } from '../../../src/context/ErdDocumentsHolderContext';
import { LocalSettingContext } from '../../../src/context/LocalSettingContext';
import ErdDocument from '../../../src/models/ErdDocument';
import LocalSettingModel from '../../../src/models/LocalSettingModel';

// Mock ErdDocument
const createMockErdDocument = (): ErdDocument => {
  const mockDocument = {
    // Basic mock methods needed for DDL import
    getTableViewModels: () => [],
    getRelationViewModels: () => [],
    getDatabaseSetting: () => ({
      database: 'MySQL',
    }),
  } as unknown as ErdDocument;
  
  return mockDocument;
};

// Mock ErdDocumentsHolder
const createMockDocumentsHolder = (): ErdDocumentsHolder => {
  const mockDocument = createMockErdDocument();
  
  const mockHolder = {
    current: () => mockDocument,
    replaceFromDdl: (tables: any[], relations: any[], lines: any[]) => {
      console.log('Document replaced from DDL:', { tables, relations, lines });
    },
  } as unknown as ErdDocumentsHolder;
  
  return mockHolder;
};

// Mock LocalSetting
const createMockLocalSetting = (): LocalSettingModel => {
  const mockSetting = {
    commentSeparator: '-- ',
  } as unknown as LocalSettingModel;
  
  return mockSetting;
};

// Context wrapper component
const ImportFromDdlViewWithContext: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const mockDocumentsHolder = createMockDocumentsHolder();
  const mockLocalSetting = createMockLocalSetting();
  
  return (
    <ErdDocumentsHolderContext.Provider value={mockDocumentsHolder}>
      <LocalSettingContext.Provider value={{ localSetting: mockLocalSetting, updateLocalSetting: () => {} }}>
        {children}
      </LocalSettingContext.Provider>
    </ErdDocumentsHolderContext.Provider>
  );
};

const meta: Meta<typeof ImportFromDdlView> = {
  title: 'Features/Editor/ImportFromDdlView',
  component: ImportFromDdlView,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A dialog component for importing database schema from DDL (Data Definition Language) text. Experimental feature that parses DDL and creates ERD elements.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ImportFromDdlViewWithContext>
        <div style={{ width: '100vw', height: '100vh' }}>
          <Story />
        </div>
      </ImportFromDdlViewWithContext>
    ),
  ],
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

// Default import dialog
export const Default: Story = {
  args: {
    isOpen: true,
    onClose: () => {
      console.log('Import DDL dialog closed');
    },
  },
};

// Closed state
export const Closed: Story = {
  args: {
    isOpen: false,
    onClose: () => {
      console.log('Import DDL dialog closed');
    },
  },
};

// Story with example DDL content (though the actual DDL parsing may not work in Storybook)
export const WithExampleContent: Story = {
  args: {
    isOpen: true,
    onClose: () => {
      console.log('Import DDL dialog with example content closed');
    },
  },
  render: (args) => {
    // Custom render to pre-populate with example DDL
    React.useEffect(() => {
      // Simulate user input with example DDL
      const textArea = document.querySelector('textarea[label="DDL"]') as HTMLTextAreaElement;
      if (textArea) {
        const exampleDdl = `CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  total DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);`;
        textArea.value = exampleDdl;
        textArea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, []);
    
    return <ImportFromDdlView {...args} />;
  },
};