import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ColorValue from '~/models/ColorValue';
import TableViewModel from '~/models/TableViewModel';
import ColumnGroupModel from '~/models/database/ColumnGroupModel';
import ColumnModel from '~/models/database/ColumnModel';
import ColumnStructModel from '~/models/database/ColumnStructModel';
import TableModel from '~/models/database/TableModel';

const HEADER_COLOR = { background: ColorValue.WHITE, foreground: ColorValue.BLACK };

const initTableViewModel = (tableModel: TableModel): TableViewModel => {
    return new TableViewModel({
        tableModel,
        corner: { top: 0, left: 0 },
        headerColor: HEADER_COLOR
    });
};

const initDocument = (args: {
    tableModels: TableModel[],
    columnGroupModels?: ColumnGroupModel[],
    columnStructModels?: ColumnStructModel[],
    columnModels?: ColumnModel[]
}): ErdDocument => {
    return ErdDocument.create({
        documentName: 'test-document',
        erdSettingModel: ErdSettingModel.create('test-document'),
        databaseSettingModel: DatabaseSettingModel.create('bigquery'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: args.tableModels.map(tableModel => initTableViewModel(tableModel)),
        columnGroupModels: args.columnGroupModels ?? [],
        columnStructModels: args.columnStructModels ?? [],
        columnModels: args.columnModels ?? []
    });
};

describe('ErdDocument column struct integration', () => {
    describe('findColumnStructModel / getColumnStructModels', () => {
        test('should find registered struct model by id', () => {
            const structModel = new ColumnStructModel({ columnStructId: 'struct-1', physicalName: 'address' });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [{ modelType: 'struct', columnStructId: 'struct-1' }]
            });
            const document = initDocument({ tableModels: [tableModel], columnStructModels: [structModel] });

            expect(document.findColumnStructModel('struct-1')).not.toBeNull();
            expect(document.findColumnStructModel('unknown')).toBeNull();
        });

        test('should return struct models sorted by physicalName', () => {
            const structA = new ColumnStructModel({ columnStructId: 'struct-a', physicalName: 'zzz' });
            const structB = new ColumnStructModel({ columnStructId: 'struct-b', physicalName: 'aaa' });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: []
            });
            const document = initDocument({
                tableModels: [tableModel], columnStructModels: [structA, structB]
            });

            const sorted = document.getColumnStructModels();
            expect(sorted.map(model => model.physicalName)).toEqual(['aaa', 'zzz']);
        });
    });

    describe('toAllColumnsExceptStruct', () => {
        test('should exclude struct entries (return empty for struct-only columns)', () => {
            const singleColumn = new ColumnModel({ columnModelId: 'col-1', primaryKey: true });
            const structModel = new ColumnStructModel({
                columnStructId: 'struct-1', physicalName: 'address',
                columnEntries: [{ modelType: 'single', columnModelId: 'nested-col' }]
            });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [
                    { modelType: 'single', columnModelId: 'col-1' },
                    { modelType: 'struct', columnStructId: 'struct-1' }
                ]
            });
            const document = initDocument({
                tableModels: [tableModel],
                columnStructModels: [structModel],
                columnModels: [singleColumn]
            });

            const allColumns = document.toAllColumnsExceptStruct(tableModel);
            expect(allColumns).toHaveLength(1);
            expect(allColumns[0].columnModelId).toBe('col-1');
        });
    });

    describe('toDisplayColumnEntries', () => {
        test('should flatten column / struct / group entries appropriately', () => {
            const singleColumn = new ColumnModel({ columnModelId: 'col-1' });
            const groupMemberColumn = new ColumnModel({ columnModelId: 'group-member' });
            const groupModel = new ColumnGroupModel({
                columnGroupId: 'group-1', groupName: 'shared', columnModelIds: ['group-member']
            });
            const structModel = new ColumnStructModel({ columnStructId: 'struct-1', physicalName: 'address' });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [
                    { modelType: 'single', columnModelId: 'col-1' },
                    { modelType: 'group', columnGroupId: 'group-1' },
                    { modelType: 'struct', columnStructId: 'struct-1' }
                ]
            });
            const document = initDocument({
                tableModels: [tableModel],
                columnGroupModels: [groupModel],
                columnStructModels: [structModel],
                columnModels: [singleColumn, groupMemberColumn]
            });

            const entries = document.toColumnDetailEntries(tableModel);

            expect(entries).toHaveLength(3);
            expect(entries[0]).toEqual({ entryType: 'column', columnModel: singleColumn });
            expect(entries[1]).toEqual({ entryType: 'column', columnModel: groupMemberColumn });
            expect(entries[2]).toEqual({ entryType: 'struct', structModel: structModel, entries: [] });
        });

        test('should skip unresolved struct/group/single references', () => {
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [
                    { modelType: 'single', columnModelId: 'missing-col' },
                    { modelType: 'struct', columnStructId: 'missing-struct' },
                    { modelType: 'group', columnGroupId: 'missing-group' }
                ]
            });
            const document = initDocument({ tableModels: [tableModel] });

            const entries = document.toColumnDetailEntries(tableModel);

            expect(entries).toEqual([]);
        });
    });

    describe('updateColumnStruct', () => {
        test('should add a new struct model without affecting unrelated columns', () => {
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: []
            });
            const document = initDocument({ tableModels: [tableModel] });

            const newStruct = new ColumnStructModel({ columnStructId: 'struct-1', physicalName: 'address' });
            const nextDocument = document.updateColumnStruct(newStruct);

            expect(nextDocument.findColumnStructModel('struct-1')).not.toBeNull();
        });

        test('should delete removed member column when not referenced elsewhere', () => {
            const memberColumn = new ColumnModel({ columnModelId: 'member-1' });
            const previousStruct = new ColumnStructModel({
                columnStructId: 'struct-1', physicalName: 'address',
                columnEntries: [{ modelType: 'single', columnModelId: 'member-1' }]
            });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [{ modelType: 'struct', columnStructId: 'struct-1' }]
            });
            const document = initDocument({
                tableModels: [tableModel],
                columnStructModels: [previousStruct],
                columnModels: [memberColumn]
            });

            const updatedStruct = new ColumnStructModel({
                columnStructId: 'struct-1', physicalName: 'address', columnEntries: []
            });
            const nextDocument = document.updateColumnStruct(updatedStruct);

            expect(nextDocument.findColumnModel('member-1')).toBeNull();
        });

        test('should keep removed member column when referenced by another table', () => {
            const memberColumn = new ColumnModel({ columnModelId: 'member-1' });
            const previousStruct = new ColumnStructModel({
                columnStructId: 'struct-1', physicalName: 'address',
                columnEntries: [{ modelType: 'single', columnModelId: 'member-1' }]
            });
            const structTable = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [{ modelType: 'struct', columnStructId: 'struct-1' }]
            });
            const otherTable = new TableModel({
                tableModelId: 'table-2',
                physicalName: 'other',
                columnEntries: [{ modelType: 'single', columnModelId: 'member-1' }]
            });
            const document = initDocument({
                tableModels: [structTable, otherTable],
                columnStructModels: [previousStruct],
                columnModels: [memberColumn]
            });

            const updatedStruct = new ColumnStructModel({
                columnStructId: 'struct-1', physicalName: 'address', columnEntries: []
            });
            const nextDocument = document.updateColumnStruct(updatedStruct);

            expect(nextDocument.findColumnModel('member-1')).not.toBeNull();
        });

        test('should keep removed member column when referenced by a group', () => {
            const memberColumn = new ColumnModel({ columnModelId: 'member-1' });
            const groupModel = new ColumnGroupModel({
                columnGroupId: 'group-1', groupName: 'shared', columnModelIds: ['member-1']
            });
            const previousStruct = new ColumnStructModel({
                columnStructId: 'struct-1', physicalName: 'address',
                columnEntries: [{ modelType: 'single', columnModelId: 'member-1' }]
            });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [
                    { modelType: 'struct', columnStructId: 'struct-1' },
                    { modelType: 'group', columnGroupId: 'group-1' }
                ]
            });
            const document = initDocument({
                tableModels: [tableModel],
                columnGroupModels: [groupModel],
                columnStructModels: [previousStruct],
                columnModels: [memberColumn]
            });

            const updatedStruct = new ColumnStructModel({
                columnStructId: 'struct-1', physicalName: 'address', columnEntries: []
            });
            const nextDocument = document.updateColumnStruct(updatedStruct);

            expect(nextDocument.findColumnModel('member-1')).not.toBeNull();
        });

        test('should keep removed member column when referenced by another struct', () => {
            const memberColumn = new ColumnModel({ columnModelId: 'member-1' });
            const structA = new ColumnStructModel({
                columnStructId: 'struct-a', physicalName: 'address',
                columnEntries: [{ modelType: 'single', columnModelId: 'member-1' }]
            });
            const structB = new ColumnStructModel({
                columnStructId: 'struct-b', physicalName: 'billing_address',
                columnEntries: [{ modelType: 'single', columnModelId: 'member-1' }]
            });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [
                    { modelType: 'struct', columnStructId: 'struct-a' },
                    { modelType: 'struct', columnStructId: 'struct-b' }
                ]
            });
            const document = initDocument({
                tableModels: [tableModel],
                columnStructModels: [structA, structB],
                columnModels: [memberColumn]
            });

            const updatedStructA = new ColumnStructModel({
                columnStructId: 'struct-a', physicalName: 'address', columnEntries: []
            });
            const nextDocument = document.updateColumnStruct(updatedStructA);

            expect(nextDocument.findColumnModel('member-1')).not.toBeNull();
        });
    });

    describe('deleteColumnStruct', () => {
        test('should remove struct model and unreferenced member columns', () => {
            const memberColumn = new ColumnModel({ columnModelId: 'member-1' });
            const structModel = new ColumnStructModel({
                columnStructId: 'struct-1', physicalName: 'address',
                columnEntries: [{ modelType: 'single', columnModelId: 'member-1' }]
            });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [
                    { modelType: 'single', columnModelId: 'other-col' },
                    { modelType: 'struct', columnStructId: 'struct-1' }
                ]
            });
            const otherColumn = new ColumnModel({ columnModelId: 'other-col' });
            const document = initDocument({
                tableModels: [tableModel],
                columnStructModels: [structModel],
                columnModels: [memberColumn, otherColumn]
            });

            const nextDocument = document.deleteColumnStruct('struct-1');

            expect(nextDocument.findColumnStructModel('struct-1')).toBeNull();
            expect(nextDocument.findColumnModel('member-1')).toBeNull();

            const nextTableView = nextDocument.findTableViewModel('table-1');
            expect(nextTableView).not.toBeNull();
            expect(nextTableView?.tableModel.columnEntries).toEqual([
                { modelType: 'single', columnModelId: 'other-col' }
            ]);
        });

        test('should keep member column referenced by another table', () => {
            const memberColumn = new ColumnModel({ columnModelId: 'member-1' });
            const structModel = new ColumnStructModel({
                columnStructId: 'struct-1', physicalName: 'address',
                columnEntries: [{ modelType: 'single', columnModelId: 'member-1' }]
            });
            const structTable = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [{ modelType: 'struct', columnStructId: 'struct-1' }]
            });
            const otherTable = new TableModel({
                tableModelId: 'table-2',
                physicalName: 'other',
                columnEntries: [{ modelType: 'single', columnModelId: 'member-1' }]
            });
            const document = initDocument({
                tableModels: [structTable, otherTable],
                columnStructModels: [structModel],
                columnModels: [memberColumn]
            });

            const nextDocument = document.deleteColumnStruct('struct-1');

            expect(nextDocument.findColumnModel('member-1')).not.toBeNull();
        });

        test('should delete table entirely when it becomes empty after struct removal', () => {
            const structModel = new ColumnStructModel({ columnStructId: 'struct-1', physicalName: 'address' });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [{ modelType: 'struct', columnStructId: 'struct-1' }]
            });
            const document = initDocument({ tableModels: [tableModel], columnStructModels: [structModel] });

            const nextDocument = document.deleteColumnStruct('struct-1');

            expect(nextDocument.findTableViewModel('table-1')).toBeNull();
        });

        test('should remove references from other structs (nested struct reference)', () => {
            const nestedStruct = new ColumnStructModel({ columnStructId: 'struct-nested', physicalName: 'inner' });
            const outerStruct = new ColumnStructModel({
                columnStructId: 'struct-outer', physicalName: 'outer',
                columnEntries: [{ modelType: 'struct', columnStructId: 'struct-nested' }]
            });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [{ modelType: 'struct', columnStructId: 'struct-outer' }]
            });
            const document = initDocument({
                tableModels: [tableModel],
                columnStructModels: [nestedStruct, outerStruct]
            });

            const nextDocument = document.deleteColumnStruct('struct-nested');

            const survivedOuter = nextDocument.findColumnStructModel('struct-outer');
            expect(survivedOuter).not.toBeNull();
            expect(survivedOuter?.columnEntries).toEqual([]);
        });

        test('should return same instance when struct does not exist', () => {
            const tableModel = new TableModel({ tableModelId: 'table-1', physicalName: 'users', columnEntries: [] });
            const document = initDocument({ tableModels: [tableModel] });

            const nextDocument = document.deleteColumnStruct('unknown');

            expect(nextDocument).toBe(document);
        });
    });

    describe('deleteColumnGroup should also clean struct references', () => {
        test('should remove group reference and cascaded member references from struct columns', () => {
            const groupMemberColumn = new ColumnModel({ columnModelId: 'group-member' });
            const groupModel = new ColumnGroupModel({
                columnGroupId: 'group-1', groupName: 'shared', columnModelIds: ['group-member']
            });
            const structWithGroupRef = new ColumnStructModel({
                columnStructId: 'struct-1', physicalName: 'address',
                columnEntries: [
                    { modelType: 'group', columnGroupId: 'group-1' },
                    { modelType: 'single', columnModelId: 'group-member' }
                ]
            });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [
                    { modelType: 'group', columnGroupId: 'group-1' },
                    { modelType: 'struct', columnStructId: 'struct-1' }
                ]
            });
            const document = initDocument({
                tableModels: [tableModel],
                columnGroupModels: [groupModel],
                columnStructModels: [structWithGroupRef],
                columnModels: [groupMemberColumn]
            });

            const nextDocument = document.deleteColumnGroup('group-1');

            const survivedStruct = nextDocument.findColumnStructModel('struct-1');
            expect(survivedStruct).not.toBeNull();
            expect(survivedStruct?.columnEntries).toEqual([]);
        });
    });

    describe('updateColumnGroup should also clean struct references', () => {
        test('should remove struct references to members dropped from the group', () => {
            const keptMemberColumn = new ColumnModel({ columnModelId: 'kept-member' });
            const removedMemberColumn = new ColumnModel({ columnModelId: 'removed-member' });
            const groupModel = new ColumnGroupModel({
                columnGroupId: 'group-1', groupName: 'shared',
                columnModelIds: ['kept-member', 'removed-member']
            });
            const structModel = new ColumnStructModel({
                columnStructId: 'struct-1', physicalName: 'address',
                columnEntries: [
                    { modelType: 'single', columnModelId: 'kept-member' },
                    { modelType: 'single', columnModelId: 'removed-member' }
                ]
            });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [
                    { modelType: 'group', columnGroupId: 'group-1' },
                    { modelType: 'struct', columnStructId: 'struct-1' }
                ]
            });
            const document = initDocument({
                tableModels: [tableModel],
                columnGroupModels: [groupModel],
                columnStructModels: [structModel],
                columnModels: [keptMemberColumn, removedMemberColumn]
            });

            const shrunkGroupModel = new ColumnGroupModel({
                ...groupModel, columnModelIds: ['kept-member']
            });
            const shareStorage = document.getColumnShareModelStorage();
            const nextDocument = document.updateColumnGroup(
                shrunkGroupModel, [keptMemberColumn], shareStorage
            );

            const survivedStruct = nextDocument.findColumnStructModel('struct-1');
            expect(survivedStruct).not.toBeNull();
            expect(survivedStruct?.columnEntries).toEqual([
                { modelType: 'single', columnModelId: 'kept-member' }
            ]);
        });
    });

    describe('dangling reference cleanup on column deletion', () => {
        test('updateTableViewWithColumns should clean struct references when a single column is removed', () => {
            const memberColumn = new ColumnModel({ columnModelId: 'member-1' });
            const structModel = new ColumnStructModel({
                columnStructId: 'struct-1', physicalName: 'address',
                columnEntries: [{ modelType: 'single', columnModelId: 'member-1' }]
            });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [
                    { modelType: 'single', columnModelId: 'member-1' },
                    { modelType: 'struct', columnStructId: 'struct-1' }
                ]
            });
            const document = initDocument({
                tableModels: [tableModel],
                columnStructModels: [structModel],
                columnModels: [memberColumn]
            });

            const nextTableModel = new TableModel({
                ...tableModel,
                columnEntries: [{ modelType: 'struct', columnStructId: 'struct-1' }]
            });
            const nextTableView = new TableViewModel({
                tableModel: nextTableModel,
                corner: { top: 0, left: 0 },
                headerColor: HEADER_COLOR
            });

            const nextDocument = document.updateTableViewWithColumns(nextTableView, []);

            const survivedStruct = nextDocument.findColumnStructModel('struct-1');
            expect(survivedStruct).not.toBeNull();
            expect(survivedStruct?.columnEntries).toEqual([]);
        });

        test('deleteTable should clean struct references to columns owned by the deleted table', () => {
            const memberColumn = new ColumnModel({ columnModelId: 'member-1' });
            const structModel = new ColumnStructModel({
                columnStructId: 'struct-1', physicalName: 'address',
                columnEntries: [{ modelType: 'single', columnModelId: 'member-1' }]
            });
            const ownerTable = new TableModel({
                tableModelId: 'table-owner',
                physicalName: 'owner',
                columnEntries: [{ modelType: 'single', columnModelId: 'member-1' }]
            });
            const structTable = new TableModel({
                tableModelId: 'table-struct',
                physicalName: 'users',
                columnEntries: [{ modelType: 'struct', columnStructId: 'struct-1' }]
            });
            const document = initDocument({
                tableModels: [ownerTable, structTable],
                columnStructModels: [structModel],
                columnModels: [memberColumn]
            });

            const nextDocument = document.deleteTable('table-owner');

            const survivedStruct = nextDocument.findColumnStructModel('struct-1');
            expect(survivedStruct).not.toBeNull();
            expect(survivedStruct?.columnEntries).toEqual([]);
        });
    });

    describe('persistence roundtrip', () => {
        test('should preserve struct models through toJSON/toObject roundtrip', () => {
            const memberColumn = new ColumnModel({ columnModelId: 'member-1' });
            const structModel = new ColumnStructModel({
                columnStructId: 'struct-1', physicalName: 'address', logicalName: 'Address',
                isArray: true, notNull: true,
                columnEntries: [{ modelType: 'single', columnModelId: 'member-1' }]
            });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [{ modelType: 'struct', columnStructId: 'struct-1' }]
            });
            const document = initDocument({
                tableModels: [tableModel],
                columnStructModels: [structModel],
                columnModels: [memberColumn]
            });

            const json = document.toJSON();
            const deserialized = ErdDocument.toObject(JSON.parse(JSON.stringify(json)));

            expect(document.equals(deserialized)).toBe(true);
            expect(deserialized.findColumnStructModel('struct-1')).not.toBeNull();
        });

        test('should omit columnStructModels key when no struct models are registered', () => {
            const tableModel = new TableModel({ tableModelId: 'table-1', physicalName: 'users', columnEntries: [] });
            const document = initDocument({ tableModels: [tableModel] });

            const json = document.toJSON();

            expect(json).not.toHaveProperty('columnStructModels');
        });
    });
});
