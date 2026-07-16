import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ColorValue from '~/models/ColorValue';
import TableViewModel from '~/models/TableViewModel';
import ColumnGroupModel from '~/models/database/ColumnGroupModel';
import ColumnModel from '~/models/database/ColumnModel';
import SimpleColumnModel from '~/models/database/SimpleColumnModel';
import StructColumnModel from '~/models/database/StructColumnModel';
import StructColumnShareModel from '~/models/database/StructColumnShareModel';
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
    structColumnShareModels?: StructColumnShareModel[],
    columnModels?: ColumnModel[]
}): ErdDocument => {
    return ErdDocument.create({
        documentName: 'test-document',
        erdSettingModel: ErdSettingModel.create('test-document'),
        databaseSettingModel: DatabaseSettingModel.create('bigquery'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: args.tableModels.map(tableModel => initTableViewModel(tableModel)),
        columnGroupModels: args.columnGroupModels ?? [],
        structShareModels: args.structColumnShareModels ?? [],
        columnModels: args.columnModels ?? []
    });
};

// struct バリアントのラッパー ColumnModel を生成する。
// テーブル・group・struct 定義からは single エントリ (columnModelId = wrapper id) で参照する。
const initStructWrapper = (
    columnModelId: string, structColumnShareModelId: string, notNull: boolean = false
): StructColumnModel => {
    return new StructColumnModel({ columnModelId, structShareModelId: structColumnShareModelId, notNull });
};

describe('ErdDocument struct column share integration', () => {
    describe('findStructColumnShareModel / getStructColumnShareModels', () => {
        test('should find registered struct model by id', () => {
            const structModel = new StructColumnShareModel({ structShareModelId: 'struct-1', physicalName: 'address' });
            const wrapperColumn = initStructWrapper('wrapper-1', 'struct-1');
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-1' }]
            });
            const document = initDocument({
                tableModels: [tableModel],
                structColumnShareModels: [structModel],
                columnModels: [wrapperColumn]
            });

            expect(document.findStructColumnShareModel('struct-1')).not.toBeNull();
            expect(document.findStructColumnShareModel('unknown')).toBeNull();
        });

        test('should return struct models sorted by physicalName', () => {
            const structA = new StructColumnShareModel({ structShareModelId: 'struct-a', physicalName: 'zzz' });
            const structB = new StructColumnShareModel({ structShareModelId: 'struct-b', physicalName: 'aaa' });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: []
            });
            const document = initDocument({
                tableModels: [tableModel], structColumnShareModels: [structA, structB]
            });

            const sorted = document.getStructColumnShareModels();
            expect(sorted.map(model => model.physicalName)).toEqual(['aaa', 'zzz']);
        });
    });

    describe('toAllColumnsExceptStruct', () => {
        test('should exclude struct variant wrappers (keep simple columns only)', () => {
            const singleColumn = new SimpleColumnModel({ columnModelId: 'col-1', columnShareModelId: '', primaryKey: true });
            const wrapperColumn = initStructWrapper('wrapper-1', 'struct-1');
            const structModel = new StructColumnShareModel({
                structShareModelId: 'struct-1', physicalName: 'address',
                columnEntries: [{ modelType: 'single', columnModelId: 'nested-col' }]
            });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [
                    { modelType: 'single', columnModelId: 'col-1' },
                    { modelType: 'single', columnModelId: 'wrapper-1' }
                ]
            });
            const document = initDocument({
                tableModels: [tableModel],
                structColumnShareModels: [structModel],
                columnModels: [singleColumn, wrapperColumn]
            });

            const allColumns = document.toAllColumnsExceptStruct(tableModel);
            expect(allColumns).toHaveLength(1);
            expect(allColumns[0].columnModelId).toBe('col-1');
        });

        test('should exclude struct variant members expanded from a group', () => {
            const simpleMember = new SimpleColumnModel({ columnModelId: 'simple-member', columnShareModelId: '' });
            const wrapperMember = initStructWrapper('wrapper-member', 'struct-1');
            const groupModel = new ColumnGroupModel({
                columnGroupId: 'group-1', groupName: 'shared',
                columnModelIds: ['simple-member', 'wrapper-member']
            });
            const structModel = new StructColumnShareModel({ structShareModelId: 'struct-1', physicalName: 'address' });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [{ modelType: 'group', columnGroupId: 'group-1' }]
            });
            const document = initDocument({
                tableModels: [tableModel],
                columnGroupModels: [groupModel],
                structColumnShareModels: [structModel],
                columnModels: [simpleMember, wrapperMember]
            });

            const allColumns = document.toAllColumnsExceptStruct(tableModel);
            expect(allColumns).toHaveLength(1);
            expect(allColumns[0].columnModelId).toBe('simple-member');
        });
    });

    describe('toAllColumnsWithStruct', () => {
        test('should flatten single / group / struct variant entries in entry order', () => {
            const singleColumn = new SimpleColumnModel({ columnModelId: 'col-1', columnShareModelId: '' });
            const groupMemberColumn = new SimpleColumnModel({ columnModelId: 'group-member', columnShareModelId: '' });
            const wrapperColumn = initStructWrapper('wrapper-1', 'struct-1');
            const groupModel = new ColumnGroupModel({
                columnGroupId: 'group-1', groupName: 'shared', columnModelIds: ['group-member']
            });
            const structModel = new StructColumnShareModel({ structShareModelId: 'struct-1', physicalName: 'address' });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [
                    { modelType: 'single', columnModelId: 'col-1' },
                    { modelType: 'group', columnGroupId: 'group-1' },
                    { modelType: 'single', columnModelId: 'wrapper-1' }
                ]
            });
            const document = initDocument({
                tableModels: [tableModel],
                columnGroupModels: [groupModel],
                structColumnShareModels: [structModel],
                columnModels: [singleColumn, groupMemberColumn, wrapperColumn]
            });

            const columnModels = document.toAllColumnsWithStruct(tableModel);

            expect(columnModels).toHaveLength(3);
            expect(columnModels[0].columnModelId).toBe('col-1');
            expect(columnModels[0].entityType).toBe('simple');
            expect(columnModels[1].columnModelId).toBe('group-member');
            expect(columnModels[1].entityType).toBe('simple');
            const structColumn = columnModels[2];
            expect(structColumn.columnModelId).toBe('wrapper-1');
            expect(structColumn.entityType).toBe('struct');
            expect(ColumnModel.isStructColumn(structColumn) && structColumn.structShareModelId).toBe('struct-1');
        });

        test('should skip unresolved single / group references', () => {
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [
                    { modelType: 'single', columnModelId: 'missing-col' },
                    { modelType: 'group', columnGroupId: 'missing-group' }
                ]
            });
            const document = initDocument({ tableModels: [tableModel] });

            const columnModels = document.toAllColumnsWithStruct(tableModel);

            expect(columnModels).toEqual([]);
        });
    });

    describe('updateStructColumnShare', () => {
        test('should add a new struct model without affecting unrelated columns', () => {
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: []
            });
            const document = initDocument({ tableModels: [tableModel] });

            const newStruct = new StructColumnShareModel({ structShareModelId: 'struct-1', physicalName: 'address' });
            const nextDocument = document.updateStructColumnShare(newStruct);

            expect(nextDocument.findStructColumnShareModel('struct-1')).not.toBeNull();
        });

        test('should delete removed member column when not referenced elsewhere', () => {
            const memberColumn = new SimpleColumnModel({ columnModelId: 'member-1', columnShareModelId: '' });
            const wrapperColumn = initStructWrapper('wrapper-1', 'struct-1');
            const previousStruct = new StructColumnShareModel({
                structShareModelId: 'struct-1', physicalName: 'address',
                columnEntries: [{ modelType: 'single', columnModelId: 'member-1' }]
            });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-1' }]
            });
            const document = initDocument({
                tableModels: [tableModel],
                structColumnShareModels: [previousStruct],
                columnModels: [memberColumn, wrapperColumn]
            });

            const updatedStruct = new StructColumnShareModel({
                structShareModelId: 'struct-1', physicalName: 'address', columnEntries: []
            });
            const nextDocument = document.updateStructColumnShare(updatedStruct);

            expect(nextDocument.findColumnModel('member-1')).toBeNull();
        });

        test('should keep removed member column when referenced by another table', () => {
            const memberColumn = new SimpleColumnModel({ columnModelId: 'member-1', columnShareModelId: '' });
            const wrapperColumn = initStructWrapper('wrapper-1', 'struct-1');
            const previousStruct = new StructColumnShareModel({
                structShareModelId: 'struct-1', physicalName: 'address',
                columnEntries: [{ modelType: 'single', columnModelId: 'member-1' }]
            });
            const structTable = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-1' }]
            });
            const otherTable = new TableModel({
                tableModelId: 'table-2',
                physicalName: 'other',
                columnEntries: [{ modelType: 'single', columnModelId: 'member-1' }]
            });
            const document = initDocument({
                tableModels: [structTable, otherTable],
                structColumnShareModels: [previousStruct],
                columnModels: [memberColumn, wrapperColumn]
            });

            const updatedStruct = new StructColumnShareModel({
                structShareModelId: 'struct-1', physicalName: 'address', columnEntries: []
            });
            const nextDocument = document.updateStructColumnShare(updatedStruct);

            expect(nextDocument.findColumnModel('member-1')).not.toBeNull();
        });

        test('should keep removed member column when referenced by a group', () => {
            const memberColumn = new SimpleColumnModel({ columnModelId: 'member-1', columnShareModelId: '' });
            const wrapperColumn = initStructWrapper('wrapper-1', 'struct-1');
            const groupModel = new ColumnGroupModel({
                columnGroupId: 'group-1', groupName: 'shared', columnModelIds: ['member-1']
            });
            const previousStruct = new StructColumnShareModel({
                structShareModelId: 'struct-1', physicalName: 'address',
                columnEntries: [{ modelType: 'single', columnModelId: 'member-1' }]
            });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [
                    { modelType: 'single', columnModelId: 'wrapper-1' },
                    { modelType: 'group', columnGroupId: 'group-1' }
                ]
            });
            const document = initDocument({
                tableModels: [tableModel],
                columnGroupModels: [groupModel],
                structColumnShareModels: [previousStruct],
                columnModels: [memberColumn, wrapperColumn]
            });

            const updatedStruct = new StructColumnShareModel({
                structShareModelId: 'struct-1', physicalName: 'address', columnEntries: []
            });
            const nextDocument = document.updateStructColumnShare(updatedStruct);

            expect(nextDocument.findColumnModel('member-1')).not.toBeNull();
        });

        test('should keep removed member column when referenced by another struct', () => {
            const memberColumn = new SimpleColumnModel({ columnModelId: 'member-1', columnShareModelId: '' });
            const wrapperA = initStructWrapper('wrapper-a', 'struct-a');
            const wrapperB = initStructWrapper('wrapper-b', 'struct-b');
            const structA = new StructColumnShareModel({
                structShareModelId: 'struct-a', physicalName: 'address',
                columnEntries: [{ modelType: 'single', columnModelId: 'member-1' }]
            });
            const structB = new StructColumnShareModel({
                structShareModelId: 'struct-b', physicalName: 'billing_address',
                columnEntries: [{ modelType: 'single', columnModelId: 'member-1' }]
            });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [
                    { modelType: 'single', columnModelId: 'wrapper-a' },
                    { modelType: 'single', columnModelId: 'wrapper-b' }
                ]
            });
            const document = initDocument({
                tableModels: [tableModel],
                structColumnShareModels: [structA, structB],
                columnModels: [memberColumn, wrapperA, wrapperB]
            });

            const updatedStructA = new StructColumnShareModel({
                structShareModelId: 'struct-a', physicalName: 'address', columnEntries: []
            });
            const nextDocument = document.updateStructColumnShare(updatedStructA);

            expect(nextDocument.findColumnModel('member-1')).not.toBeNull();
        });
    });

    describe('deleteStructColumnShare', () => {
        test('should remove struct model, its wrapper and unreferenced member columns', () => {
            const memberColumn = new SimpleColumnModel({ columnModelId: 'member-1', columnShareModelId: '' });
            const wrapperColumn = initStructWrapper('wrapper-1', 'struct-1');
            const structModel = new StructColumnShareModel({
                structShareModelId: 'struct-1', physicalName: 'address',
                columnEntries: [{ modelType: 'single', columnModelId: 'member-1' }]
            });
            const otherColumn = new SimpleColumnModel({ columnModelId: 'other-col', columnShareModelId: '' });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [
                    { modelType: 'single', columnModelId: 'other-col' },
                    { modelType: 'single', columnModelId: 'wrapper-1' }
                ]
            });
            const document = initDocument({
                tableModels: [tableModel],
                structColumnShareModels: [structModel],
                columnModels: [memberColumn, wrapperColumn, otherColumn]
            });

            const nextDocument = document.deleteStructColumnShare('struct-1');

            expect(nextDocument.findStructColumnShareModel('struct-1')).toBeNull();
            expect(nextDocument.findColumnModel('member-1')).toBeNull();
            expect(nextDocument.findColumnModel('wrapper-1')).toBeNull();

            const nextTableView = nextDocument.findTableViewModel('table-1');
            expect(nextTableView).not.toBeNull();
            expect(nextTableView?.tableModel.columnEntries).toEqual([
                { modelType: 'single', columnModelId: 'other-col' }
            ]);
        });

        test('should keep member column referenced by another table', () => {
            const memberColumn = new SimpleColumnModel({ columnModelId: 'member-1', columnShareModelId: '' });
            const wrapperColumn = initStructWrapper('wrapper-1', 'struct-1');
            const structModel = new StructColumnShareModel({
                structShareModelId: 'struct-1', physicalName: 'address',
                columnEntries: [{ modelType: 'single', columnModelId: 'member-1' }]
            });
            const structTable = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-1' }]
            });
            const otherTable = new TableModel({
                tableModelId: 'table-2',
                physicalName: 'other',
                columnEntries: [{ modelType: 'single', columnModelId: 'member-1' }]
            });
            const document = initDocument({
                tableModels: [structTable, otherTable],
                structColumnShareModels: [structModel],
                columnModels: [memberColumn, wrapperColumn]
            });

            const nextDocument = document.deleteStructColumnShare('struct-1');

            expect(nextDocument.findColumnModel('member-1')).not.toBeNull();
        });

        test('should delete table entirely when it becomes empty after struct removal', () => {
            const wrapperColumn = initStructWrapper('wrapper-1', 'struct-1');
            const structModel = new StructColumnShareModel({ structShareModelId: 'struct-1', physicalName: 'address' });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-1' }]
            });
            const document = initDocument({
                tableModels: [tableModel],
                structColumnShareModels: [structModel],
                columnModels: [wrapperColumn]
            });

            const nextDocument = document.deleteStructColumnShare('struct-1');

            expect(nextDocument.findTableViewModel('table-1')).toBeNull();
        });

        test('should remove wrapper references from other structs (nested struct reference)', () => {
            const nestedWrapper = initStructWrapper('wrapper-nested', 'struct-nested');
            const outerWrapper = initStructWrapper('wrapper-outer', 'struct-outer');
            const nestedStruct = new StructColumnShareModel({ structShareModelId: 'struct-nested', physicalName: 'inner' });
            const outerStruct = new StructColumnShareModel({
                structShareModelId: 'struct-outer', physicalName: 'outer',
                columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-nested' }]
            });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-outer' }]
            });
            const document = initDocument({
                tableModels: [tableModel],
                structColumnShareModels: [nestedStruct, outerStruct],
                columnModels: [nestedWrapper, outerWrapper]
            });

            const nextDocument = document.deleteStructColumnShare('struct-nested');

            const survivedOuter = nextDocument.findStructColumnShareModel('struct-outer');
            expect(survivedOuter).not.toBeNull();
            expect(survivedOuter?.columnEntries).toEqual([]);
            expect(nextDocument.findColumnModel('wrapper-nested')).toBeNull();
        });

        test('should return same instance when struct does not exist', () => {
            const tableModel = new TableModel({ tableModelId: 'table-1', physicalName: 'users', columnEntries: [] });
            const document = initDocument({ tableModels: [tableModel] });

            const nextDocument = document.deleteStructColumnShare('unknown');

            expect(nextDocument).toBe(document);
        });
    });

    describe('deleteColumnGroup should also clean struct references', () => {
        test('should remove group reference and cascaded member references from struct columns', () => {
            const groupMemberColumn = new SimpleColumnModel({ columnModelId: 'group-member', columnShareModelId: '' });
            const wrapperColumn = initStructWrapper('wrapper-1', 'struct-1');
            const groupModel = new ColumnGroupModel({
                columnGroupId: 'group-1', groupName: 'shared', columnModelIds: ['group-member']
            });
            const structWithGroupRef = new StructColumnShareModel({
                structShareModelId: 'struct-1', physicalName: 'address',
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
                    { modelType: 'single', columnModelId: 'wrapper-1' }
                ]
            });
            const document = initDocument({
                tableModels: [tableModel],
                columnGroupModels: [groupModel],
                structColumnShareModels: [structWithGroupRef],
                columnModels: [groupMemberColumn, wrapperColumn]
            });

            const nextDocument = document.deleteColumnGroup('group-1');

            const survivedStruct = nextDocument.findStructColumnShareModel('struct-1');
            expect(survivedStruct).not.toBeNull();
            expect(survivedStruct?.columnEntries).toEqual([]);
        });
    });

    describe('updateColumnGroup should also clean struct references', () => {
        test('should remove struct references to members dropped from the group', () => {
            const keptMemberColumn = new SimpleColumnModel({ columnModelId: 'kept-member', columnShareModelId: '' });
            const removedMemberColumn = new SimpleColumnModel({ columnModelId: 'removed-member', columnShareModelId: '' });
            const wrapperColumn = initStructWrapper('wrapper-1', 'struct-1');
            const groupModel = new ColumnGroupModel({
                columnGroupId: 'group-1', groupName: 'shared',
                columnModelIds: ['kept-member', 'removed-member']
            });
            const structModel = new StructColumnShareModel({
                structShareModelId: 'struct-1', physicalName: 'address',
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
                    { modelType: 'single', columnModelId: 'wrapper-1' }
                ]
            });
            const document = initDocument({
                tableModels: [tableModel],
                columnGroupModels: [groupModel],
                structColumnShareModels: [structModel],
                columnModels: [keptMemberColumn, removedMemberColumn, wrapperColumn]
            });

            const shrunkGroupModel = new ColumnGroupModel({
                ...groupModel, columnModelIds: ['kept-member']
            });
            const shareStorage = document.getColumnShareModelStorage();
            const nextDocument = document.updateColumnGroup(
                shrunkGroupModel, [keptMemberColumn], shareStorage
            );

            const survivedStruct = nextDocument.findStructColumnShareModel('struct-1');
            expect(survivedStruct).not.toBeNull();
            expect(survivedStruct?.columnEntries).toEqual([
                { modelType: 'single', columnModelId: 'kept-member' }
            ]);
        });
    });

    describe('dangling reference cleanup on column deletion', () => {
        test('updateTableViewWithColumns should clean struct references when a single column is removed', () => {
            const memberColumn = new SimpleColumnModel({ columnModelId: 'member-1', columnShareModelId: '' });
            const wrapperColumn = initStructWrapper('wrapper-1', 'struct-1');
            const structModel = new StructColumnShareModel({
                structShareModelId: 'struct-1', physicalName: 'address',
                columnEntries: [{ modelType: 'single', columnModelId: 'member-1' }]
            });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [
                    { modelType: 'single', columnModelId: 'member-1' },
                    { modelType: 'single', columnModelId: 'wrapper-1' }
                ]
            });
            const document = initDocument({
                tableModels: [tableModel],
                structColumnShareModels: [structModel],
                columnModels: [memberColumn, wrapperColumn]
            });

            const nextTableModel = new TableModel({
                ...tableModel,
                columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-1' }]
            });
            const nextTableView = new TableViewModel({
                tableModel: nextTableModel,
                corner: { top: 0, left: 0 },
                headerColor: HEADER_COLOR
            });

            const nextDocument = document.updateTableViewWithColumns(nextTableView, [wrapperColumn]);

            const survivedStruct = nextDocument.findStructColumnShareModel('struct-1');
            expect(survivedStruct).not.toBeNull();
            expect(survivedStruct?.columnEntries).toEqual([]);
        });

        test('deleteTable should clean struct references to columns owned by the deleted table', () => {
            const memberColumn = new SimpleColumnModel({ columnModelId: 'member-1', columnShareModelId: '' });
            const wrapperColumn = initStructWrapper('wrapper-1', 'struct-1');
            const structModel = new StructColumnShareModel({
                structShareModelId: 'struct-1', physicalName: 'address',
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
                columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-1' }]
            });
            const document = initDocument({
                tableModels: [ownerTable, structTable],
                structColumnShareModels: [structModel],
                columnModels: [memberColumn, wrapperColumn]
            });

            const nextDocument = document.deleteTable('table-owner');

            const survivedStruct = nextDocument.findStructColumnShareModel('struct-1');
            expect(survivedStruct).not.toBeNull();
            expect(survivedStruct?.columnEntries).toEqual([]);
        });
    });

    describe('persistence roundtrip', () => {
        test('should preserve struct models through toJSON/toObject roundtrip', () => {
            const memberColumn = new SimpleColumnModel({ columnModelId: 'member-1', columnShareModelId: '' });
            const wrapperColumn = initStructWrapper('wrapper-1', 'struct-1', true);
            const structModel = new StructColumnShareModel({
                structShareModelId: 'struct-1', physicalName: 'address', logicalName: 'Address',
                isArray: true,
                columnEntries: [{ modelType: 'single', columnModelId: 'member-1' }]
            });
            const tableModel = new TableModel({
                tableModelId: 'table-1',
                physicalName: 'users',
                columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-1' }]
            });
            const document = initDocument({
                tableModels: [tableModel],
                structColumnShareModels: [structModel],
                columnModels: [memberColumn, wrapperColumn]
            });

            const json = document.toJSON();
            const deserialized = ErdDocument.toObject(JSON.parse(JSON.stringify(json)));

            expect(document.equals(deserialized)).toBe(true);
            expect(deserialized.findStructColumnShareModel('struct-1')).not.toBeNull();
        });

        test('should omit structColumnShareModels key when no struct models are registered', () => {
            const tableModel = new TableModel({ tableModelId: 'table-1', physicalName: 'users', columnEntries: [] });
            const document = initDocument({ tableModels: [tableModel] });

            const json = document.toJSON();

            expect(json).not.toHaveProperty('structColumnShareModels');
        });
    });
});
