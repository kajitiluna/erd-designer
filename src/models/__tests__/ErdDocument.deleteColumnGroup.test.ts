import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ColorValue from '~/models/ColorValue';
import LineViewModel from '~/models/LineViewModel';
import RelationViewModel from '~/models/RelationViewModel';
import TableViewModel from '~/models/TableViewModel';
import ColumnGroupModel from '~/models/database/ColumnGroupModel';
import ColumnModel from '~/models/database/ColumnModel';
import RelationModel from '~/models/database/RelationModel';
import RelationPair from '~/models/database/RelationPair';
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

describe('ErdDocument.deleteColumnGroup', () => {
    // 親テーブル P (単独PKカラム) と、カラムグループを利用する子テーブル C を持つドキュメントを構築する
    const parentPkColumn = new ColumnModel({ columnModelId: 'parent-pk-col', primaryKey: true });
    const childOwnColumn = new ColumnModel({ columnModelId: 'child-own-col' });
    const groupMemberColumn = new ColumnModel({ columnModelId: 'group-member-col' });
    const columnGroup = new ColumnGroupModel({
        columnGroupId: 'group-1',
        groupName: 'shared_columns',
        columnModelIds: ['group-member-col']
    });

    const parentTableModel = new TableModel({
        tableModelId: 'table-parent',
        physicalName: 'parent_table',
        columns: [{ modelType: 'single', columnModelId: 'parent-pk-col' }]
    });
    const childTableModel = new TableModel({
        tableModelId: 'table-child',
        physicalName: 'child_table',
        columns: [
            { modelType: 'single', columnModelId: 'child-own-col' },
            { modelType: 'group', columnGroupId: 'group-1' }
        ]
    });

    const initDocument = (relationModels: RelationModel[]): ErdDocument => {
        return ErdDocument.create({
            documentName: 'test-document',
            erdSettingModel: ErdSettingModel.create('test-document'),
            databaseSettingModel: DatabaseSettingModel.create('postgres'),
            schemaConfig: DbSchemaConfig.create(),
            tableViewModels: [initTableViewModel(parentTableModel), initTableViewModel(childTableModel)],
            columnGroupModels: [columnGroup],
            columnModels: [parentPkColumn, childOwnColumn, groupMemberColumn],
            relationViewModels: relationModels.map(relationModel => initRelationViewModel(relationModel))
        });
    };

    test('削除したグループのカラムを子側ペアに含むリレーションは削除される', () => {
        const relationModel = new RelationModel({
            relationModelId: 'relation-1',
            parentTableModelId: 'table-parent',
            childTableModelId: 'table-child',
            relationPairs: [new RelationPair({
                parentColumnModelId: 'parent-pk-col',
                childColumnModelId: 'group-member-col'
            })]
        });
        const document = initDocument([relationModel]);

        const nextDocument = document.deleteColumnGroup('group-1');

        expect(nextDocument.findRelationViewModel('relation-1')).toBeNull();
    });

    test('削除したグループのカラムを参照しない子側リレーションは維持される', () => {
        const relationModel = new RelationModel({
            relationModelId: 'relation-2',
            parentTableModelId: 'table-parent',
            childTableModelId: 'table-child',
            relationPairs: [new RelationPair({
                parentColumnModelId: 'parent-pk-col',
                childColumnModelId: 'child-own-col'
            })]
        });
        const document = initDocument([relationModel]);

        const nextDocument = document.deleteColumnGroup('group-1');

        const survivedRelation = nextDocument.findRelationViewModel('relation-2');
        expect(survivedRelation).not.toBeNull();
        expect(survivedRelation?.relationModel.relationPairs).toHaveLength(1);
    });

    test('グループ削除後、子テーブルからグループカラムが取り除かれる', () => {
        const document = initDocument([]);

        const nextDocument = document.deleteColumnGroup('group-1');

        const childTableView = nextDocument.findTableViewModel('table-child');
        expect(childTableView).not.toBeNull();
        expect(childTableView?.tableModel.columns).toHaveLength(1);
        expect(nextDocument.findColumnGroupModel('group-1')).toBeNull();
        expect(nextDocument.findColumnModel('group-member-col')).toBeNull();
    });

    test('グループ内の PK カラムを親側ペアに含むリレーションは、該当ペアのみ取り除かれる', () => {
        // 親テーブル側がカラムグループを利用し、その中に PK カラムを含むケース
        const parentGroupPkColumn = new ColumnModel({ columnModelId: 'group-pk-col', primaryKey: true });
        const pkColumnGroup = new ColumnGroupModel({
            columnGroupId: 'group-pk',
            groupName: 'pk_group',
            columnModelIds: ['group-pk-col']
        });
        const groupedParentTableModel = new TableModel({
            tableModelId: 'table-grouped-parent',
            physicalName: 'grouped_parent_table',
            columns: [
                { modelType: 'single', columnModelId: 'parent-pk-col' },
                { modelType: 'group', columnGroupId: 'group-pk' }
            ]
        });
        const relationModel = new RelationModel({
            relationModelId: 'relation-3',
            parentTableModelId: 'table-grouped-parent',
            childTableModelId: 'table-child',
            relationPairs: [
                new RelationPair({ parentColumnModelId: 'group-pk-col', childColumnModelId: 'child-own-col' }),
                new RelationPair({ parentColumnModelId: 'parent-pk-col', childColumnModelId: 'child-own-col' })
            ]
        });
        const document = ErdDocument.create({
            documentName: 'test-document',
            erdSettingModel: ErdSettingModel.create('test-document'),
            databaseSettingModel: DatabaseSettingModel.create('postgres'),
            schemaConfig: DbSchemaConfig.create(),
            tableViewModels: [initTableViewModel(groupedParentTableModel), initTableViewModel(childTableModel)],
            columnGroupModels: [pkColumnGroup],
            columnModels: [parentPkColumn, childOwnColumn, parentGroupPkColumn],
            relationViewModels: [initRelationViewModel(relationModel)]
        });

        const nextDocument = document.deleteColumnGroup('group-pk');

        const updatedRelation = nextDocument.findRelationViewModel('relation-3');
        expect(updatedRelation).not.toBeNull();
        expect(updatedRelation?.relationModel.relationPairs).toHaveLength(1);
        expect(updatedRelation?.relationModel.relationPairs[0].parentColumnModelId).toBe('parent-pk-col');
    });
});
