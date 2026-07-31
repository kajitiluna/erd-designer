import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ColorValue from '~/models/ColorValue';
import LineViewModel from '~/models/LineViewModel';
import MemoViewModel from '~/models/MemoViewModel';
import RectangleViewModel from '~/models/RectangleViewModel';
import RelationViewModel from '~/models/RelationViewModel';
import TableViewModel from '~/models/TableViewModel';
import { findDatabaseColumns } from '~/models/database/columns';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import RelationModel from '~/models/database/RelationModel';
import RelationPair from '~/models/database/RelationPair';
import SimpleColumnModel from '~/models/database/SimpleColumnModel';
import TableModel from '~/models/database/TableModel';

const HEADER_COLOR = { background: ColorValue.WHITE, foreground: ColorValue.BLACK };

const initTableViewModel = (tableModel: TableModel): TableViewModel => {
    return new TableViewModel({
        tableModel,
        corner: { top: 0, left: 0 },
        headerColor: HEADER_COLOR
    });
};

const initRelationViewModel = (relationModel: RelationModel): RelationViewModel => {
    return new RelationViewModel({
        relationModel,
        lineViewModel: new LineViewModel({})
    });
};

const initMemoViewModel = (): MemoViewModel => {
    const rectangle = new RectangleViewModel({ positionX: 0, positionY: 0, width: 100, height: 100 });
    return MemoViewModel.create(rectangle, { background: ColorValue.WHITE, foreground: ColorValue.BLACK });
};

// テーブル A のPKカラムはカラム共有モデルを参照し、columnShareStorage の再利用を検証できるようにする
const sharedColumnShareModel = new ColumnShareModel({
    columnShareModelId: 'share-a-pk', physicalName: 'id', logicalName: 'ID',
    columnType: findDatabaseColumns('postgres')[0]
});
const tableAPkColumn = new SimpleColumnModel({
    columnModelId: 'col-a-pk', columnShareModelId: 'share-a-pk', primaryKey: true
});
const tableBOwnColumn = new SimpleColumnModel({ columnModelId: 'col-b-own', columnShareModelId: '' });

const tableAModel = new TableModel({
    tableModelId: 'table-a', physicalName: 'table_a',
    columnEntries: [{ modelType: 'single', columnModelId: 'col-a-pk' }]
});
const tableBModel = new TableModel({
    tableModelId: 'table-b', physicalName: 'table_b',
    columnEntries: [{ modelType: 'single', columnModelId: 'col-b-own' }]
});

const relationModel = new RelationModel({
    relationModelId: 'relation-1',
    parentTableModelId: 'table-a', childTableModelId: 'table-b',
    relationPairs: [new RelationPair({ parentColumnModelId: 'col-a-pk', childColumnModelId: 'col-b-own' })]
});

const initBaseDocument = (): ErdDocument => {
    return ErdDocument.create({
        documentName: 'test-document',
        erdSettingModel: ErdSettingModel.create('test-document'),
        databaseSettingModel: DatabaseSettingModel.create('postgres'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [initTableViewModel(tableAModel), initTableViewModel(tableBModel)],
        columnModels: [tableAPkColumn, tableBOwnColumn],
        columnShareModels: [sharedColumnShareModel],
        relationViewModels: [initRelationViewModel(relationModel)],
        foregroundMemoViewModels: [initMemoViewModel()]
    });
};

// JSON を経由した独立インスタンスを作る。Google Drive からの取り込みは常にこの経路を通る
const toIndependentCopy = (document: ErdDocument): ErdDocument => {
    return ErdDocument.toObject(JSON.parse(JSON.stringify(document.toJSON())));
};

describe('ErdDocument.reuseInstancesFrom', () => {
    test('内容が完全に同じ場合、全モデルのインスタンスが previous 側に差し替わる', () => {
        const previous = initBaseDocument();
        const imported = toIndependentCopy(previous);

        // 素の JSON 復元では別インスタンスになっていることの前提確認
        expect(imported.findTableViewModel('table-a')).not.toBe(previous.findTableViewModel('table-a'));

        const reused = imported.reuseInstancesFrom(previous);

        expect(reused.equals(previous)).toBe(true);
        expect(reused.findTableViewModel('table-a')).toBe(previous.findTableViewModel('table-a'));
        expect(reused.findTableViewModel('table-b')).toBe(previous.findTableViewModel('table-b'));
        expect(reused.findColumnModel('col-a-pk')).toBe(previous.findColumnModel('col-a-pk'));
        expect(reused.findColumnModel('col-b-own')).toBe(previous.findColumnModel('col-b-own'));
        // getColumnShareModelStorage() は呼び出しごとに copy() された新規ラッパーを返すため、
        // ラッパーではなく内部モデルの参照で共有を確認する
        expect(reused.findColumnShareModel('share-a-pk')).toBe(previous.findColumnShareModel('share-a-pk'));
        expect(reused.getRelationViewModels()[0]).toBe(previous.getRelationViewModels()[0]);
        expect(reused.getMemoViewModels().frontMemos[0]).toBe(previous.getMemoViewModels().frontMemos[0]);
        expect(reused.erdSettingModel).toBe(previous.erdSettingModel);
        expect(reused.databaseSettingModel).toBe(previous.databaseSettingModel);
        expect(reused.schemaConfig).toBe(previous.schemaConfig);
    });

    test('1テーブルだけ変更された場合、そのテーブルのみ新規インスタンスで他は再利用される', () => {
        const previous = initBaseDocument();
        const renamedTableModel = new TableModel({ ...tableBModel, physicalName: 'table_b_renamed' });
        const changed = previous.updateTableMeta(initTableViewModel(renamedTableModel));
        const imported = toIndependentCopy(changed);

        const reused = imported.reuseInstancesFrom(previous);

        expect(reused.equals(imported)).toBe(true);
        expect(reused.findTableViewModel('table-a')).toBe(previous.findTableViewModel('table-a'));
        expect(reused.findTableViewModel('table-b')).not.toBe(previous.findTableViewModel('table-b'));
        expect(reused.findTableViewModel('table-b')?.tableModel.physicalName).toBe('table_b_renamed');
        // 変更されていないテーブルのカラムは引き続き共有される
        expect(reused.findColumnModel('col-a-pk')).toBe(previous.findColumnModel('col-a-pk'));
        // getColumnShareModelStorage() は呼び出しごとに copy() された新規ラッパーを返すため、
        // ラッパーではなく内部モデルの参照で共有を確認する
        expect(reused.findColumnShareModel('share-a-pk')).toBe(previous.findColumnShareModel('share-a-pk'));
        expect(reused.getRelationViewModels()[0]).toBe(previous.getRelationViewModels()[0]);
        expect(reused.getMemoViewModels().frontMemos[0]).toBe(previous.getMemoViewModels().frontMemos[0]);
    });

    test('テーブルが追加された場合、増えた分だけ新規インスタンスで既存テーブルは再利用される', () => {
        const previous = initBaseDocument();
        const extraTableModel = new TableModel({
            tableModelId: 'table-c', physicalName: 'table_c', columnEntries: []
        });
        const changed = ErdDocument.create({
            documentName: previous.documentName,
            erdSettingModel: previous.erdSettingModel,
            databaseSettingModel: previous.databaseSettingModel,
            schemaConfig: previous.schemaConfig,
            tableViewModels: [
                ...previous.getTableViewModels(),
                initTableViewModel(extraTableModel)
            ],
            columnModels: [tableAPkColumn, tableBOwnColumn],
            columnShareModels: [sharedColumnShareModel],
            relationViewModels: previous.getRelationViewModels(),
            foregroundMemoViewModels: previous.getMemoViewModels().frontMemos
        });
        const imported = toIndependentCopy(changed);

        const reused = imported.reuseInstancesFrom(previous);

        expect(reused.equals(imported)).toBe(true);
        expect(reused.getTableViewModels()).toHaveLength(3);
        expect(reused.findTableViewModel('table-a')).toBe(previous.findTableViewModel('table-a'));
        expect(reused.findTableViewModel('table-b')).toBe(previous.findTableViewModel('table-b'));
        expect(reused.findTableViewModel('table-c')).not.toBeNull();
    });
});
