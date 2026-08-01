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

const initMemoViewModel = (positionX: number): MemoViewModel => {
    const rectangle = new RectangleViewModel({ positionX, positionY: 0, width: 100, height: 100 });
    return MemoViewModel.create(rectangle, { background: ColorValue.WHITE, foreground: ColorValue.BLACK });
};

// テーブル A のPKカラムはカラム共有モデルを参照し、columnShareStorage の再利用を検証できるようにする
const sharedColumnShareModel = new ColumnShareModel({
    columnShareModelId: 'share-a-pk', physicalName: 'id', logicalName: 'ID',
    columnType: findDatabaseColumns('postgres')[0]
});
// テーブル D のPKカラムが参照する2件目のカラム共有モデル。1件だけ変更した場合の再利用検証に使う
const secondColumnShareModel = new ColumnShareModel({
    columnShareModelId: 'share-d-pk', physicalName: 'id', logicalName: 'ID',
    columnType: findDatabaseColumns('postgres')[0]
});
const tableAPkColumn = new SimpleColumnModel({
    columnModelId: 'col-a-pk', columnShareModelId: 'share-a-pk', primaryKey: true
});
const tableBOwnColumn = new SimpleColumnModel({ columnModelId: 'col-b-own', columnShareModelId: '' });
const tableDPkColumn = new SimpleColumnModel({
    columnModelId: 'col-d-pk', columnShareModelId: 'share-d-pk', primaryKey: true
});

const tableAModel = new TableModel({
    tableModelId: 'table-a', physicalName: 'table_a',
    columnEntries: [{ modelType: 'single', columnModelId: 'col-a-pk' }]
});
const tableBModel = new TableModel({
    tableModelId: 'table-b', physicalName: 'table_b',
    columnEntries: [{ modelType: 'single', columnModelId: 'col-b-own' }]
});
// 2件目のリレーション (table-a → table-d) を持たせ、relationViewModelStorage の1件だけの再利用を検証する
const tableDModel = new TableModel({
    tableModelId: 'table-d', physicalName: 'table_d',
    columnEntries: [{ modelType: 'single', columnModelId: 'col-d-pk' }]
});

const relationModel = new RelationModel({
    relationModelId: 'relation-1',
    parentTableModelId: 'table-a', childTableModelId: 'table-b',
    relationPairs: [new RelationPair({ parentColumnModelId: 'col-a-pk', childColumnModelId: 'col-b-own' })]
});
const relationModel2 = new RelationModel({
    relationModelId: 'relation-2',
    parentTableModelId: 'table-a', childTableModelId: 'table-d',
    relationPairs: [new RelationPair({ parentColumnModelId: 'col-a-pk', childColumnModelId: 'col-d-pk' })]
});

const initBaseDocument = (): ErdDocument => {
    return ErdDocument.create({
        documentName: 'test-document',
        erdSettingModel: ErdSettingModel.create('test-document'),
        databaseSettingModel: DatabaseSettingModel.create('postgres'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [initTableViewModel(tableAModel), initTableViewModel(tableBModel), initTableViewModel(tableDModel)],
        columnModels: [tableAPkColumn, tableBOwnColumn, tableDPkColumn],
        columnShareModels: [sharedColumnShareModel, secondColumnShareModel],
        relationViewModels: [initRelationViewModel(relationModel), initRelationViewModel(relationModel2)],
        foregroundMemoViewModels: [initMemoViewModel(0), initMemoViewModel(200)]
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

        // 全フィールドが再利用された場合、previous 自身の参照が返る
        expect(reused).toBe(previous);
        expect(reused.equals(previous)).toBe(true);
        expect(reused.findTableViewModel('table-a')).toBe(previous.findTableViewModel('table-a'));
        expect(reused.findTableViewModel('table-b')).toBe(previous.findTableViewModel('table-b'));
        expect(reused.findColumnModel('col-a-pk')).toBe(previous.findColumnModel('col-a-pk'));
        expect(reused.findColumnModel('col-b-own')).toBe(previous.findColumnModel('col-b-own'));
        // getColumnShareModelStorage() は呼び出しごとに copy() された新規ラッパーを返すため、
        // ラッパーではなく内部モデルの参照で共有を確認する
        expect(reused.findColumnShareModel('share-a-pk')).toBe(previous.findColumnShareModel('share-a-pk'));
        expect(reused.findColumnShareModel('share-d-pk')).toBe(previous.findColumnShareModel('share-d-pk'));
        expect(reused.getRelationViewModels()[0]).toBe(previous.getRelationViewModels()[0]);
        expect(reused.getRelationViewModels()[1]).toBe(previous.getRelationViewModels()[1]);
        expect(reused.getMemoViewModels().frontMemos[0]).toBe(previous.getMemoViewModels().frontMemos[0]);
        expect(reused.getMemoViewModels().frontMemos[1]).toBe(previous.getMemoViewModels().frontMemos[1]);
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

        expect(reused).not.toBe(previous);
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
            columnModels: [tableAPkColumn, tableBOwnColumn, tableDPkColumn],
            columnShareModels: [sharedColumnShareModel, secondColumnShareModel],
            relationViewModels: previous.getRelationViewModels(),
            foregroundMemoViewModels: previous.getMemoViewModels().frontMemos
        });
        const imported = toIndependentCopy(changed);

        const reused = imported.reuseInstancesFrom(previous);

        expect(reused.equals(imported)).toBe(true);
        expect(reused.getTableViewModels()).toHaveLength(4);
        expect(reused.findTableViewModel('table-a')).toBe(previous.findTableViewModel('table-a'));
        expect(reused.findTableViewModel('table-b')).toBe(previous.findTableViewModel('table-b'));
        expect(reused.findTableViewModel('table-c')).not.toBeNull();
    });

    test('1件だけリレーションが変更された場合、そのリレーションのみ新規インスタンスで他は再利用される', () => {
        const previous = initBaseDocument();
        const changed = previous.updateRelationLine('relation-1', new LineViewModel({ edges: [{ x: 10, y: 10 }] }));
        const imported = toIndependentCopy(changed);

        const reused = imported.reuseInstancesFrom(previous);

        expect(reused).not.toBe(previous);
        expect(reused.equals(imported)).toBe(true);
        const previousRelation1 = previous.getRelationViewModels().find(relation => relation.relationId === 'relation-1');
        const reusedRelation1 = reused.getRelationViewModels().find(relation => relation.relationId === 'relation-1');
        const previousRelation2 = previous.getRelationViewModels().find(relation => relation.relationId === 'relation-2');
        const reusedRelation2 = reused.getRelationViewModels().find(relation => relation.relationId === 'relation-2');
        expect(reusedRelation1).not.toBe(previousRelation1);
        expect(reusedRelation2).toBe(previousRelation2);
        // 変更されていないテーブル・メモ・カラム共有は引き続き共有される
        expect(reused.findTableViewModel('table-a')).toBe(previous.findTableViewModel('table-a'));
        expect(reused.getMemoViewModels().frontMemos[0]).toBe(previous.getMemoViewModels().frontMemos[0]);
    });

    test('1件だけメモが変更された場合、そのメモのみ新規インスタンスで他は再利用される', () => {
        const previous = initBaseDocument();
        const [firstMemo, secondMemo] = previous.getMemoViewModels().frontMemos;
        const movedMemo = firstMemo.move({ x: 10, y: 10 });
        const changed = previous.updateMemo(movedMemo);
        const imported = toIndependentCopy(changed);

        const reused = imported.reuseInstancesFrom(previous);

        expect(reused).not.toBe(previous);
        expect(reused.equals(imported)).toBe(true);
        const [reusedFirstMemo, reusedSecondMemo] = reused.getMemoViewModels().frontMemos;
        expect(reusedFirstMemo).not.toBe(firstMemo);
        expect(reusedSecondMemo).toBe(secondMemo);
        // 変更されていないテーブル・リレーションは引き続き共有される
        expect(reused.findTableViewModel('table-a')).toBe(previous.findTableViewModel('table-a'));
        expect(reused.getRelationViewModels()[0]).toBe(previous.getRelationViewModels()[0]);
    });

    test('1件だけカラム共有モデルが変更された場合、そのモデルのみ新規インスタンスで他は再利用される', () => {
        const previous = initBaseDocument();
        const updatedShareModel = new ColumnShareModel({ ...sharedColumnShareModel, logicalName: 'ID (renamed)' });
        const changed = previous.updateColumnModels([], [updatedShareModel]);
        const imported = toIndependentCopy(changed);

        const reused = imported.reuseInstancesFrom(previous);

        expect(reused).not.toBe(previous);
        expect(reused.equals(imported)).toBe(true);
        expect(reused.findColumnShareModel('share-a-pk')).not.toBe(previous.findColumnShareModel('share-a-pk'));
        expect(reused.findColumnShareModel('share-a-pk')?.logicalName).toBe('ID (renamed)');
        expect(reused.findColumnShareModel('share-d-pk')).toBe(previous.findColumnShareModel('share-d-pk'));
        // 変更されていないテーブル・リレーション・メモは引き続き共有される
        expect(reused.findTableViewModel('table-a')).toBe(previous.findTableViewModel('table-a'));
        expect(reused.getRelationViewModels()[0]).toBe(previous.getRelationViewModels()[0]);
        expect(reused.getMemoViewModels().frontMemos[0]).toBe(previous.getMemoViewModels().frontMemos[0]);
    });
});
