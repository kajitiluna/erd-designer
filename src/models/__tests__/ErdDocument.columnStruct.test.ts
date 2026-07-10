import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ColorValue from '~/models/ColorValue';
import TableViewModel from '~/models/TableViewModel';
import ColumnModel from '~/models/database/ColumnModel';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import ColumnStructModel from '~/models/database/ColumnStructModel';
import ColumnType from '~/models/database/ColumnType';
import TableModel from '~/models/database/TableModel';

const HEADER_COLOR = { background: ColorValue.WHITE, foreground: ColorValue.BLACK };

const initTableViewModel = (tableModel: TableModel): TableViewModel => {
    return new TableViewModel({
        tableModel,
        corner: { top: 0, left: 0 },
        headerColor: HEADER_COLOR
    });
};

const initDocument = (): ErdDocument => {
    const structFieldColumn = new ColumnModel({
        columnModelId: 'struct-field-col', columnShareModelId: 'struct-field-share'
    });
    const structFieldShare = new ColumnShareModel({
        columnShareModelId: 'struct-field-share',
        physicalName: 'field_name',
        logicalName: 'Field Name',
        columnType: ColumnType.EMPTY
    });
    const parentColumn = new ColumnModel({ columnModelId: 'parent-col', columnShareModelId: 'parent-share' });
    const parentShare = new ColumnShareModel({
        columnShareModelId: 'parent-share',
        physicalName: 'struct_column',
        logicalName: 'Struct Column',
        columnType: ColumnType.EMPTY,
        columnStructId: 'struct-1'
    });
    const columnStruct = new ColumnStructModel({
        columnStructId: 'struct-1',
        structName: 'my_struct',
        columnModelIds: ['struct-field-col']
    });

    const tableModel = new TableModel({
        tableModelId: 'table-1',
        physicalName: 'table_with_struct',
        columns: [{ modelType: 'single', columnModelId: 'parent-col' }]
    });

    return ErdDocument.create({
        documentName: 'test-document',
        erdSettingModel: ErdSettingModel.create('test-document'),
        databaseSettingModel: DatabaseSettingModel.create('postgres'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [initTableViewModel(tableModel)],
        columnStructModels: [columnStruct],
        columnModels: [parentColumn, structFieldColumn],
        columnShareModels: [parentShare, structFieldShare]
    });
};

describe('ErdDocument column struct', () => {
    test('find/get で追加した ColumnStructModel を取得できる', () => {
        const document = initDocument();

        const found = document.findColumnStructModel('struct-1');
        expect(found).not.toBeNull();
        expect(found?.structName).toBe('my_struct');

        const all = document.getColumnStructModels();
        expect(all).toHaveLength(1);
        expect(all[0].columnStructId).toBe('struct-1');
    });

    test('find で存在しない columnStructId は null を返す', () => {
        const document = initDocument();

        expect(document.findColumnStructModel('not-exists')).toBeNull();
    });

    describe('updateColumnStruct', () => {
        test('新規追加できる', () => {
            const document = initDocument();
            const newFieldColumn = new ColumnModel({ columnModelId: 'new-field-col' });
            const newStruct = new ColumnStructModel({
                columnStructId: 'struct-2',
                structName: 'second_struct',
                columnModelIds: ['new-field-col']
            });

            const nextDocument = document.updateColumnStruct(newStruct, [newFieldColumn]);

            expect(nextDocument.findColumnStructModel('struct-2')).not.toBeNull();
            expect(nextDocument.findColumnModel('new-field-col')).not.toBeNull();
        });

        test('既存の struct を更新できる', () => {
            const document = initDocument();
            const updatedStruct = new ColumnStructModel({
                columnStructId: 'struct-1',
                structName: 'renamed_struct',
                columnModelIds: ['struct-field-col']
            });

            const nextDocument = document.updateColumnStruct(updatedStruct, []);

            expect(nextDocument.findColumnStructModel('struct-1')?.structName).toBe('renamed_struct');
        });

        test('メンバーから外れた ColumnModel は columnModelMap から削除される', () => {
            const document = initDocument();
            const updatedStruct = new ColumnStructModel({
                columnStructId: 'struct-1',
                structName: 'my_struct',
                columnModelIds: []
            });

            const nextDocument = document.updateColumnStruct(updatedStruct, []);

            expect(nextDocument.findColumnModel('struct-field-col')).toBeNull();
        });

        test('新規メンバーの ColumnModel が追加される', () => {
            const document = initDocument();
            const additionalFieldColumn = new ColumnModel({ columnModelId: 'additional-field-col' });
            const updatedStruct = new ColumnStructModel({
                columnStructId: 'struct-1',
                structName: 'my_struct',
                columnModelIds: ['struct-field-col', 'additional-field-col']
            });

            const nextDocument = document.updateColumnStruct(updatedStruct, [additionalFieldColumn]);

            expect(nextDocument.findColumnModel('additional-field-col')).not.toBeNull();
            expect(nextDocument.findColumnStructModel('struct-1')?.columnModelIds)
                .toEqual(['struct-field-col', 'additional-field-col']);
        });
    });

    describe('deleteColumnStruct', () => {
        test('struct とメンバー ColumnModel が削除される', () => {
            const document = initDocument();

            const nextDocument = document.deleteColumnStruct('struct-1');

            expect(nextDocument.findColumnStructModel('struct-1')).toBeNull();
            expect(nextDocument.findColumnModel('struct-field-col')).toBeNull();
        });

        test('参照していた ColumnShareModel の columnStructId がクリアされる', () => {
            const document = initDocument();

            const nextDocument = document.deleteColumnStruct('struct-1');

            const clearedShare = nextDocument.findColumnShareModel('parent-share');
            expect(clearedShare).not.toBeNull();
            expect(clearedShare?.columnStructId).toBe('');
        });

        test('存在しない columnStructId を指定した場合は変化がない', () => {
            const document = initDocument();

            const nextDocument = document.deleteColumnStruct('not-exists');

            expect(nextDocument).toBe(document);
        });
    });

    describe('後方互換 (columnStructModels 未指定)', () => {
        test('columnStructModels キーの無い JSON から toObject で復元できる', () => {
            const legacyJson = {
                documentName: 'legacy-doc',
                tableViewModels: [],
                columnModels: [],
                columnShareModels: [],
                relationViewModels: [],
                erdSettingModel: ErdSettingModel.create('legacy-doc').toJSON(),
                databaseSetting: DatabaseSettingModel.create('postgres').toJSON()
            };

            const document = ErdDocument.toObject(legacyJson);

            expect(document.getColumnStructModels()).toEqual([]);
        });

        test('struct 未使用ドキュメントの toJSON に struct 関連キーが一切現れない', () => {
            const document = ErdDocument.create({
                documentName: 'plain-doc',
                erdSettingModel: ErdSettingModel.create('plain-doc'),
                databaseSettingModel: DatabaseSettingModel.create('postgres'),
                schemaConfig: DbSchemaConfig.create()
            });

            const json = document.toJSON();

            expect('columnStructModels' in json).toBe(false);
            expect(JSON.stringify(json)).not.toContain('columnStructId');
            expect(JSON.stringify(json)).not.toContain('withStructFields');
        });
    });

    test('ドキュメント全体の toJSON → toObject 往復で ColumnStructModel が保存・復元される', () => {
        const document = initDocument();

        const json = document.toJSON();
        const restored = ErdDocument.toObject(json);

        expect(restored.getColumnStructModels()).toHaveLength(1);
        expect(restored.findColumnStructModel('struct-1')?.structName).toBe('my_struct');
        expect(restored.findColumnModel('struct-field-col')).not.toBeNull();
        expect(restored.findColumnShareModel('parent-share')?.columnStructId).toBe('struct-1');
        expect(restored.equals(document)).toBe(true);
    });
});
