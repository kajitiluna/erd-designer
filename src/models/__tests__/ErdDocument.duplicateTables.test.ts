import ErdDocument from '~/models/ErdDocument';
import { ErdDocumentsHolder } from '~/context/ErdDocumentsHolderContext';
import ErdSettingModel from '~/models/ErdSettingModel';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import ColorValue from '~/models/ColorValue';
import LineViewModel from '~/models/LineViewModel';
import PerspectiveModel from '~/models/PerspectiveModel';
import RelationViewModel from '~/models/RelationViewModel';
import TableViewModel from '~/models/TableViewModel';
import ColumnGroupModel from '~/models/database/ColumnGroupModel';
import ColumnModel from '~/models/database/ColumnModel';
import RelationModel from '~/models/database/RelationModel';
import RelationPair from '~/models/database/RelationPair';
import SimpleColumnModel from '~/models/database/SimpleColumnModel';
import StructColumnModel from '~/models/database/StructColumnModel';
import TableIndexModel, { IndexColumnModel } from '~/models/database/TableIndexModel';
import TableModel from '~/models/database/TableModel';
import TableUniqueKeysModel, { UniqueKeysColumnModel } from '~/models/database/TableUniqueKeysModel';

const HEADER_COLOR = { background: ColorValue.WHITE, foreground: ColorValue.BLACK };

const initTableViewModel = (tableModel: TableModel, top: number, left: number): TableViewModel => {
    return new TableViewModel({ tableModel, corner: { top, left }, headerColor: HEADER_COLOR });
};

const initDocument = (options: {
    tableViewModels: TableViewModel[],
    columnModels: ColumnModel[],
    columnGroupModels?: ColumnGroupModel[],
    relationViewModels?: RelationViewModel[],
    perspectiveModels?: PerspectiveModel[]
}): ErdDocument => {
    const erdSettingModel = ErdSettingModel.create('test-document')
        .update({ perspectiveModels: options.perspectiveModels ?? null });

    return ErdDocument.create({
        documentName: 'test-document',
        erdSettingModel,
        databaseSettingModel: DatabaseSettingModel.create('postgres'),
        tableViewModels: options.tableViewModels,
        columnModels: options.columnModels,
        columnGroupModels: options.columnGroupModels ?? [],
        relationViewModels: options.relationViewModels ?? []
    });
};

describe('ErdDocument.duplicateTables', () => {
    // 親テーブル (users) は simple / struct / グループ参照のカラムと index / unique key を持つ
    const idColumn = new SimpleColumnModel({
        columnModelId: 'col-id', physicalName: 'id', columnShareModelId: 'share-id', primaryKey: true
    });
    const nameColumn = new SimpleColumnModel({
        columnModelId: 'col-name', physicalName: 'name', columnShareModelId: 'share-name', notNull: true
    });
    const structColumn = new StructColumnModel({
        columnModelId: 'col-struct', physicalName: 'address', structShareModelId: 'struct-share-1'
    });
    const groupMemberColumn = new SimpleColumnModel({
        columnModelId: 'col-group-member', physicalName: 'created_at', columnShareModelId: 'share-created'
    });
    const columnGroup = new ColumnGroupModel({
        columnGroupId: 'group-1', groupName: 'audit', columnModelIds: ['col-group-member']
    });
    const childColumn = new SimpleColumnModel({
        columnModelId: 'col-child-user-id', physicalName: 'user_id', columnShareModelId: 'share-id'
    });

    const usersTable = new TableModel({
        tableModelId: 'table-users',
        physicalName: 'users',
        logicalName: 'Users',
        schemaId: 'schema-1',
        columnEntries: [
            { modelType: 'single', columnModelId: 'col-id' },
            { modelType: 'single', columnModelId: 'col-name' },
            { modelType: 'single', columnModelId: 'col-struct' },
            { modelType: 'group', columnGroupId: 'group-1' }
        ],
        tableIndexModels: [new TableIndexModel({
            tableIndexModelId: 'index-1',
            physicalName: 'idx_users_name',
            indexColumnModels: [
                new IndexColumnModel({ columnModelId: 'col-name', sortOrderType: 'DESC' }),
                new IndexColumnModel({ columnModelId: 'col-group-member' })
            ],
            indexType: 'BTREE',
            clustered: true,
            description: 'index description'
        })],
        uniqueKeysModels: [new TableUniqueKeysModel({
            tableUniqueKeysModelId: 'unique-1',
            physicalName: 'uq_users_name',
            uniqueKeysColumnModels: [
                new UniqueKeysColumnModel({ columnModelId: 'col-name', sortOrderType: 'ASC' }),
                new UniqueKeysColumnModel({ columnModelId: 'col-group-member', sortOrderType: '' })
            ]
        })],
        description: 'users table',
        checkExpression: '${name} <> \'\'',
        characterSet: 'utf8',
        collate: 'utf8_bin',
        optionExpression: 'option'
    });
    const ordersTable = new TableModel({
        tableModelId: 'table-orders',
        physicalName: 'orders',
        logicalName: '',
        columnEntries: [{ modelType: 'single', columnModelId: 'col-child-user-id' }]
    });

    const relationViewModel = new RelationViewModel({
        relationModel: new RelationModel({
            relationModelId: 'relation-1',
            parentTableModelId: 'table-users',
            childTableModelId: 'table-orders',
            relationPairs: [new RelationPair({
                parentColumnModelId: 'col-id', childColumnModelId: 'col-child-user-id'
            })]
        }),
        lineViewModel: new LineViewModel({})
    });

    const initBaseDocument = (perspectiveModels: PerspectiveModel[] = []): ErdDocument => {
        return initDocument({
            tableViewModels: [
                initTableViewModel(usersTable, 100, 200),
                initTableViewModel(ordersTable, 300, 500)
            ],
            columnModels: [idColumn, nameColumn, structColumn, groupMemberColumn, childColumn],
            columnGroupModels: [columnGroup],
            relationViewModels: [relationViewModel],
            perspectiveModels
        });
    };

    const duplicateUsers = (document: ErdDocument) => {
        const { erdDocument, duplicatedTables } = document.duplicateTables(['table-users']);
        const duplicatedTableIds = duplicatedTables.map(duplicatedTable => duplicatedTable.duplicatedTableId);
        const duplicatedTableView = erdDocument.findTableViewModel(duplicatedTableIds[0]) as TableViewModel;

        return { erdDocument, duplicatedTables, duplicatedTableIds, duplicatedTable: duplicatedTableView.tableModel };
    };

    test('テーブル・カラム・index・unique key に新しい id が採番される', () => {
        const { erdDocument, duplicatedTables, duplicatedTableIds, duplicatedTable } = duplicateUsers(initBaseDocument());

        expect(duplicatedTableIds).toHaveLength(1);
        expect(duplicatedTables).toEqual([
            { originalTableId: 'table-users', duplicatedTableId: duplicatedTableIds[0] }
        ]);
        expect(duplicatedTable.tableModelId).not.toBe('table-users');
        expect(duplicatedTable.tableIndexModels[0].tableIndexModelId).not.toBe('index-1');
        expect(duplicatedTable.uniqueKeysModels[0].tableUniqueKeysModelId).not.toBe('unique-1');

        const originalColumnIds = ['col-id', 'col-name', 'col-struct'];
        const duplicatedSingleColumnIds = duplicatedTable.columnEntries
            .flatMap(entry => (entry.modelType === 'single') ? [entry.columnModelId] : []);
        expect(duplicatedSingleColumnIds).toHaveLength(3);
        duplicatedSingleColumnIds.forEach(columnModelId => {
            expect(originalColumnIds).not.toContain(columnModelId);
            expect(erdDocument.findColumnModel(columnModelId)).not.toBeNull();
        });
    });

    test('複製したカラムの属性は元と同一で、共有定義への参照は維持される', () => {
        const { erdDocument, duplicatedTable } = duplicateUsers(initBaseDocument());

        const columnModels = erdDocument.toAllColumnsWithStruct(duplicatedTable);
        const duplicatedName = columnModels
            .find(columnModel => (columnModel.physicalName === 'name') && ColumnModel.isSimpleColumn(columnModel));
        const duplicatedStruct = columnModels.find(columnModel => ColumnModel.isStructColumn(columnModel));

        expect(duplicatedName).toBeDefined();
        expect((duplicatedName as SimpleColumnModel).columnShareModelId).toBe('share-name');
        expect((duplicatedName as SimpleColumnModel).notNull).toBe(true);
        expect((duplicatedStruct as StructColumnModel).structShareModelId).toBe('struct-share-1');
    });

    test('index と unique key のカラム参照は複製カラムへ付け替わり、グループメンバーは元の参照のまま', () => {
        const { duplicatedTable } = duplicateUsers(initBaseDocument());

        const duplicatedNameColumnId = duplicatedTable.columnEntries[1].modelType === 'single'
            ? duplicatedTable.columnEntries[1].columnModelId : '';
        expect(duplicatedNameColumnId).not.toBe('');
        expect(duplicatedNameColumnId).not.toBe('col-name');

        const indexColumns = duplicatedTable.tableIndexModels[0].indexColumnModels;
        expect(indexColumns[0].columnModelId).toBe(duplicatedNameColumnId);
        expect(indexColumns[0].sortOrderType).toBe('DESC');
        expect(indexColumns[1].columnModelId).toBe('col-group-member');

        const uniqueColumns = duplicatedTable.uniqueKeysModels[0].uniqueKeysColumnModels;
        expect(uniqueColumns[0].columnModelId).toBe(duplicatedNameColumnId);
        expect(uniqueColumns[0].sortOrderType).toBe('ASC');
        expect(uniqueColumns[1].columnModelId).toBe('col-group-member');
    });

    test('カラムグループのエントリは元のまま参照され、グループ自体は増えない', () => {
        const document = initBaseDocument();
        const { erdDocument, duplicatedTable } = duplicateUsers(document);

        expect(duplicatedTable.columnEntries[3]).toEqual({ modelType: 'group', columnGroupId: 'group-1' });
        expect(erdDocument.getColumnGroupModels()).toHaveLength(1);
    });

    test('テーブルの属性が複製され、名前に _copy が付く', () => {
        const { duplicatedTable } = duplicateUsers(initBaseDocument());

        expect(duplicatedTable.physicalName).toBe('users_copy');
        expect(duplicatedTable.logicalName).toBe('Users_copy');
        expect(duplicatedTable.tableIndexModels[0].physicalName).toBe('idx_users_name_copy');
        expect(duplicatedTable.uniqueKeysModels[0].physicalName).toBe('uq_users_name_copy');

        expect(duplicatedTable.schemaId).toBe('schema-1');
        expect(duplicatedTable.description).toBe('users table');
        expect(duplicatedTable.checkExpression).toBe('${name} <> \'\'');
        expect(duplicatedTable.characterSet).toBe('utf8');
        expect(duplicatedTable.collate).toBe('utf8_bin');
        expect(duplicatedTable.optionExpression).toBe('option');
        expect(duplicatedTable.tableIndexModels[0].indexType).toBe('BTREE');
        expect(duplicatedTable.tableIndexModels[0].clustered).toBe(true);
        expect(duplicatedTable.tableIndexModels[0].description).toBe('index description');
    });

    test('論理名が空のテーブルは空のまま複製される', () => {
        const { erdDocument, duplicatedTables } = initBaseDocument().duplicateTables(['table-orders']);
        const duplicatedTableIds = duplicatedTables.map(duplicatedTable => duplicatedTable.duplicatedTableId);
        const duplicatedTable = (erdDocument.findTableViewModel(duplicatedTableIds[0]) as TableViewModel).tableModel;

        expect(duplicatedTable.physicalName).toBe('orders_copy');
        expect(duplicatedTable.logicalName).toBe('');
    });

    test('名前が既に存在する場合は _copy2, _copy3 と連番になる', () => {
        const document = initBaseDocument();
        const first = document.duplicateTables(['table-users']).erdDocument;
        const second = first.duplicateTables(['table-users']);
        const third = second.erdDocument.duplicateTables(['table-users']);

        const secondTableId = second.duplicatedTables[0].duplicatedTableId;
        const thirdTableId = third.duplicatedTables[0].duplicatedTableId;
        const secondTable = (second.erdDocument.findTableViewModel(secondTableId) as TableViewModel).tableModel;
        const thirdTable = (third.erdDocument.findTableViewModel(thirdTableId) as TableViewModel).tableModel;

        expect(secondTable.physicalName).toBe('users_copy2');
        expect(secondTable.logicalName).toBe('Users_copy2');
        expect(secondTable.tableIndexModels[0].physicalName).toBe('idx_users_name_copy2');
        expect(secondTable.uniqueKeysModels[0].physicalName).toBe('uq_users_name_copy2');
        expect(thirdTable.physicalName).toBe('users_copy3');
        expect(thirdTable.tableIndexModels[0].physicalName).toBe('idx_users_name_copy3');
        expect(thirdTable.uniqueKeysModels[0].physicalName).toBe('uq_users_name_copy3');
    });

    test('同一テーブル内で複製後の名前が衝突する index も重複しない', () => {
        const tableModel = new TableModel({
            tableModelId: 'table-a',
            physicalName: 'a',
            columnEntries: [{ modelType: 'single', columnModelId: 'col-id' }],
            tableIndexModels: [
                new TableIndexModel({
                    tableIndexModelId: 'index-a',
                    physicalName: 'idx',
                    indexColumnModels: [new IndexColumnModel({ columnModelId: 'col-id' })]
                }),
                new TableIndexModel({
                    tableIndexModelId: 'index-a-copy',
                    physicalName: 'idx_copy',
                    indexColumnModels: [new IndexColumnModel({ columnModelId: 'col-id' })]
                })
            ]
        });
        const document = initDocument({
            tableViewModels: [initTableViewModel(tableModel, 0, 0)],
            columnModels: [idColumn]
        });

        const { erdDocument, duplicatedTables } = document.duplicateTables(['table-a']);
        const duplicatedTableIds = duplicatedTables.map(duplicatedTable => duplicatedTable.duplicatedTableId);
        const duplicatedTable = (erdDocument.findTableViewModel(duplicatedTableIds[0]) as TableViewModel).tableModel;
        const duplicatedNames = duplicatedTable.tableIndexModels.map(indexModel => indexModel.physicalName);

        // idx -> idx_copy は元の index と衝突するため idx_copy2、idx_copy -> idx_copy_copy
        expect(duplicatedNames).toEqual(['idx_copy2', 'idx_copy_copy']);
    });

    test('名前の空な unique key は空のまま複製される', () => {
        const tableModel = new TableModel({
            tableModelId: 'table-a',
            physicalName: 'a',
            columnEntries: [{ modelType: 'single', columnModelId: 'col-id' }],
            uniqueKeysModels: [new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'unique-a',
                uniqueKeysColumnModels: [new UniqueKeysColumnModel({ columnModelId: 'col-id', sortOrderType: '' })]
            })]
        });
        const document = initDocument({
            tableViewModels: [initTableViewModel(tableModel, 0, 0)],
            columnModels: [idColumn]
        });

        const { erdDocument, duplicatedTables } = document.duplicateTables(['table-a']);
        const duplicatedTableIds = duplicatedTables.map(duplicatedTable => duplicatedTable.duplicatedTableId);
        const duplicatedTable = (erdDocument.findTableViewModel(duplicatedTableIds[0]) as TableViewModel).tableModel;

        expect(duplicatedTable.uniqueKeysModels[0].physicalName).toBe('');
        expect(duplicatedTable.uniqueKeysModels[0].tableUniqueKeysModelId).not.toBe('unique-a');
    });

    test('リレーションは複製されず、元のリレーションも変わらない', () => {
        const { erdDocument } = initBaseDocument().duplicateTables(['table-users', 'table-orders']);

        const relationViewModels = erdDocument.getRelationViewModels();
        expect(relationViewModels).toHaveLength(1);
        expect(relationViewModels[0].relationId).toBe('relation-1');
    });

    test('複数テーブルを 1 回の更新で複製し、相対位置を保ったまま同じ距離だけ右下へずらす', () => {
        const document = initBaseDocument();
        const { erdDocument, duplicatedTables } = document.duplicateTables(['table-users', 'table-orders']);
        const duplicatedTableIds = duplicatedTables.map(duplicatedTable => duplicatedTable.duplicatedTableId);

        expect(duplicatedTableIds).toHaveLength(2);
        expect(duplicatedTables).toEqual([
            { originalTableId: 'table-users', duplicatedTableId: duplicatedTableIds[0] },
            { originalTableId: 'table-orders', duplicatedTableId: duplicatedTableIds[1] }
        ]);
        expect(erdDocument.getTableViewModels()).toHaveLength(4);

        const duplicatedUsers = erdDocument.findTableViewModel(duplicatedTableIds[0]) as TableViewModel;
        const duplicatedOrders = erdDocument.findTableViewModel(duplicatedTableIds[1]) as TableViewModel;
        expect(duplicatedUsers.tableModel.physicalName).toBe('users_copy');
        expect(duplicatedOrders.tableModel.physicalName).toBe('orders_copy');

        const deltaUsers = {
            top: duplicatedUsers.corner.top - 100, left: duplicatedUsers.corner.left - 200
        };
        const deltaOrders = {
            top: duplicatedOrders.corner.top - 300, left: duplicatedOrders.corner.left - 500
        };
        expect(deltaUsers.top).toBeGreaterThan(0);
        expect(deltaUsers.left).toBeGreaterThan(0);
        expect(deltaOrders).toEqual(deltaUsers);
    });

    test('元のテーブル・カラムは変更されず、複製カラムも GC で消えない', () => {
        const document = initBaseDocument();
        const { erdDocument } = document.duplicateTables(['table-users', 'table-orders']);

        const originalUsers = erdDocument.findTableViewModel('table-users') as TableViewModel;
        expect(originalUsers.tableModel.equals(usersTable)).toBe(true);
        expect(originalUsers.corner).toEqual({ top: 100, left: 200 });
        const originalOrders = erdDocument.findTableViewModel('table-orders') as TableViewModel;
        expect(originalOrders.tableModel.equals(ordersTable)).toBe(true);

        ['col-id', 'col-name', 'col-struct', 'col-group-member', 'col-child-user-id'].forEach(columnModelId => {
            expect(erdDocument.findColumnModel(columnModelId)).not.toBeNull();
        });

        // 元 5 カラム + 複製カラム (users: 3, orders: 1)。グループメンバーは複製されない
        const duplicatedTableViews = erdDocument.getTableViewModels().slice(2);
        const duplicatedColumnCount = duplicatedTableViews
            .flatMap(tableView => erdDocument.toAllColumnsWithStruct(tableView.tableModel))
            .filter(columnModel => (columnModel.columnModelId !== 'col-group-member')).length;
        expect(duplicatedColumnCount).toBe(4);
        duplicatedTableViews.flatMap(tableView => tableView.tableModel.columnEntries).forEach(entry => {
            if (entry.modelType === 'single') {
                expect(erdDocument.findColumnModel(entry.columnModelId)).not.toBeNull();
            }
        });
    });

    test('存在しないテーブル id のみを指定した場合は何も変わらない', () => {
        const document = initBaseDocument();
        const { erdDocument, duplicatedTables } = document.duplicateTables(['unknown']);

        expect(duplicatedTables).toEqual([]);
        expect(erdDocument).toBe(document);
    });

    describe('perspective', () => {
        const initPerspective = (...tableIds: string[]): PerspectiveModel => {
            return tableIds.reduce(
                (current, tableId) => current.updateContainId(tableId, 'add'), PerspectiveModel.create('view')
            );
        };

        const findPerspective = (erdDocument: ErdDocument, perspective: PerspectiveModel): PerspectiveModel => {
            return erdDocument.erdSettingModel.findPerspectiveModel(perspective.perspectiveId) as PerspectiveModel;
        };

        test('複製テーブルは、元テーブルを含むすべての perspective に追加され、含まない perspective は変更されない', () => {
            const usersOnly = initPerspective('table-users');
            const usersAndOrders = initPerspective('table-users', 'table-orders');
            const ordersOnly = initPerspective('table-orders');
            const document = initBaseDocument([usersOnly, usersAndOrders, ordersOnly]);

            const { erdDocument, duplicatedTables } = document.duplicateTables(['table-users']);
            const duplicatedTableId = duplicatedTables[0].duplicatedTableId;

            const nextUsersOnly = findPerspective(erdDocument, usersOnly);
            expect(nextUsersOnly.containsModel('table-users')).toBe(true);
            expect(nextUsersOnly.containsModel(duplicatedTableId)).toBe(true);
            expect(nextUsersOnly.containsModel('table-orders')).toBe(false);

            const nextUsersAndOrders = findPerspective(erdDocument, usersAndOrders);
            expect(nextUsersAndOrders.containsModel(duplicatedTableId)).toBe(true);
            expect(nextUsersAndOrders.containsModel('table-orders')).toBe(true);

            const nextOrdersOnly = findPerspective(erdDocument, ordersOnly);
            expect(nextOrdersOnly.containsModel(duplicatedTableId)).toBe(false);
            expect(nextOrdersOnly.equals(ordersOnly)).toBe(true);
        });

        test('どの perspective にも含まれない元テーブルの複製は、どの perspective にも追加されない', () => {
            const ordersOnly = initPerspective('table-orders');
            const empty = initPerspective();
            const document = initBaseDocument([ordersOnly, empty]);

            const { erdDocument, duplicatedTables } = document.duplicateTables(['table-users']);
            const duplicatedTableId = duplicatedTables[0].duplicatedTableId;

            const nextOrdersOnly = findPerspective(erdDocument, ordersOnly);
            const nextEmpty = findPerspective(erdDocument, empty);
            expect(nextOrdersOnly.containsModel(duplicatedTableId)).toBe(false);
            expect(nextEmpty.containsModel(duplicatedTableId)).toBe(false);
            expect(nextOrdersOnly.equals(ordersOnly)).toBe(true);
            expect(nextEmpty.equals(empty)).toBe(true);
        });

        test('複数テーブルの複製では、それぞれの複製が自身の元テーブルの perspective に追加される', () => {
            const usersOnly = initPerspective('table-users');
            const ordersOnly = initPerspective('table-orders');
            const document = initBaseDocument([usersOnly, ordersOnly]);

            const { erdDocument, duplicatedTables } = document.duplicateTables(['table-users', 'table-orders']);
            const duplicatedUsersId = duplicatedTables[0].duplicatedTableId;
            const duplicatedOrdersId = duplicatedTables[1].duplicatedTableId;

            const nextUsersOnly = findPerspective(erdDocument, usersOnly);
            expect(nextUsersOnly.containsModel(duplicatedUsersId)).toBe(true);
            expect(nextUsersOnly.containsModel(duplicatedOrdersId)).toBe(false);

            const nextOrdersOnly = findPerspective(erdDocument, ordersOnly);
            expect(nextOrdersOnly.containsModel(duplicatedOrdersId)).toBe(true);
            expect(nextOrdersOnly.containsModel(duplicatedUsersId)).toBe(false);
        });
    });
});

describe('ErdDocumentsHolder.duplicateTables', () => {
    const initHolderDocument = (): ErdDocument => {
        const columnModel = new SimpleColumnModel({ columnModelId: 'col-1', columnShareModelId: 'share-1' });
        const tableOne = new TableModel({
            tableModelId: 'table-1', physicalName: 'one',
            columnEntries: [{ modelType: 'single', columnModelId: 'col-1' }]
        });
        const tableTwo = new TableModel({ tableModelId: 'table-2', physicalName: 'two' });

        return initDocument({
            tableViewModels: [initTableViewModel(tableOne, 0, 0), initTableViewModel(tableTwo, 50, 50)],
            columnModels: [columnModel]
        });
    };

    test('複数テーブルの複製は履歴 1 件で、undo 用に元のドキュメントが履歴に残る', () => {
        const original = initHolderDocument();
        const updateDocument = vi.fn();
        const holder = new ErdDocumentsHolder([original], 0, updateDocument);

        const duplicatedTableIds = holder.duplicateTables(['table-1', 'table-2']);

        expect(duplicatedTableIds).toHaveLength(2);
        expect(updateDocument).toHaveBeenCalledTimes(1);

        const [history, cursor, loggingMessage] = updateDocument.mock.calls[0] as [ErdDocument[], number, string];
        expect(cursor).toBe(0);
        expect(loggingMessage).toBe(
            `Duplicate tables: (original: table-1, duplicated: ${duplicatedTableIds[0]}), `
            + `(original: table-2, duplicated: ${duplicatedTableIds[1]})`
        );
        expect(history).toHaveLength(2);
        expect(history[1]).toBe(original);
        expect(history[0].getTableViewModels()).toHaveLength(4);
        expect(history[0].getTableViewModels().map(tableView => tableView.tableId).slice(2))
            .toEqual(duplicatedTableIds);
    });

    test('複製対象がない場合は履歴を追加せず、空配列を返す', () => {
        const updateDocument = vi.fn();
        const holder = new ErdDocumentsHolder([initHolderDocument()], 0, updateDocument);

        const duplicatedTableIds = holder.duplicateTables(['unknown']);

        expect(duplicatedTableIds).toEqual([]);
        expect(updateDocument).not.toHaveBeenCalled();
    });
});
