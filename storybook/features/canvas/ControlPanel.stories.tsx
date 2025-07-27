import type { Meta, StoryObj } from '@storybook/react';

import ControlPanel from '../../../src/features/canvas/ControlPanel';
import EditModeContext from '../../../src/context/EditModeContext';
import { ErdDocumentsHolderContext } from '../../../src/context/ErdDocumentsHolderContext';
import { SelectEntityContext } from '../../../src/context/SelectEntityContext';
import { LocalSettingContext } from '../../../src/context/LocalSettingContext';
import ExportSpecificationContext from '../../../src/context/ExportSpecificationContext';
import ErdDocument from '../../../src/models/ErdDocument';
import EditMode, { EditModeType } from '../../../src/models/EditMode';
import ErdSettingModel from '../../../src/models/ErdSettingModel';

// Mock context providers for the story
const mockEditMode = {
  editMode: EditModeType.SELECT,
  changeEditMode: (mode: any) => console.log('changeEditMode', mode),
};

const mockErdDocuments = {
  erdDocument: new ErdDocument(),
  undoableEditErdDocument: (updater: any) => console.log('undoableEditErdDocument', updater),
  erdDocumentHistory: {
    canUndo: false,
    canRedo: false,
    undo: () => console.log('undo'),
    redo: () => console.log('redo'),
  },
};

const mockSelectEntity = {
  selectedItems: [],
  addSelected: (item: any) => console.log('addSelected', item),
  removeSelected: (item: any) => console.log('removeSelected', item),
  setSelected: (items: any) => console.log('setSelected', items),
  releaseAll: () => console.log('releaseAll'),
};

const mockLocalSetting = {
  setting: new ErdSettingModel(),
  setSetting: (setting: any) => console.log('setSetting', setting),
  updateSetting: (updater: any) => console.log('updateSetting', updater),
};

const mockExportSpecification = {
  imageContent: null,
  setImageContent: (content: any) => console.log('setImageContent', content),
};

const meta: Meta<typeof ControlPanel> = {
  title: 'Features/Canvas/ControlPanel',
  component: ControlPanel,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'The main control panel for the ERD canvas, providing tools for editing modes, undo/redo, and export functionality.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <EditModeContext.Provider value={mockEditMode}>
        <ErdDocumentsHolderContext.Provider value={mockErdDocuments}>
          <SelectEntityContext.Provider value={mockSelectEntity}>
            <LocalSettingContext.Provider value={mockLocalSetting}>
              <ExportSpecificationContext.Provider value={mockExportSpecification}>
                <Story />
              </ExportSpecificationContext.Provider>
            </LocalSettingContext.Provider>
          </SelectEntityContext.Provider>
        </ErdDocumentsHolderContext.Provider>
      </EditModeContext.Provider>
    ),
  ],
  argTypes: {
    erdExportable: {
      description: 'Whether the ERD can be exported',
      control: { type: 'boolean' },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Default control panel
export const Default: Story = {
  args: {
    erdExportable: true,
  },
};

// Control panel with export disabled
export const ExportDisabled: Story = {
  args: {
    erdExportable: false,
  },
};