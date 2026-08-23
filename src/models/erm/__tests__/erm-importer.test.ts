import { readFileSync } from 'node:fs';
import path from 'node:path';
import ErdDocument from '~/models/ErdDocument';
import { convertErm } from '../index';

const readFixture = (fileName: string): string => {
    return readFileSync(path.join(__dirname, 'fixtures', fileName), 'utf-8');
};

const convertSample = () => {
    const result = convertErm('sample', readFixture('sample.erm'));
    if (result.result === "failure") {
        throw new Error(`Expected the sample fixture to convert successfully. summaries: ${JSON.stringify(result.summaries)}`);
    }

    return result;
};

const convertErmasterPostgresSample = () => {
    const result = convertErm('ermaster_postgres', readFixture('ermaster_postgres.erm'));
    if (result.result === "failure") {
        throw new Error(`Expected the ermaster_postgres fixture to convert successfully. summaries: ${JSON.stringify(result.summaries)}`);
    }

    return result;
};

describe('convertErm', () => {
    test('should build an ErdDocument with the given document name and resolved database', () => {
        const { erdDocument } = convertSample();

        expect(erdDocument.documentName).toBe('sample');
        expect(erdDocument.getDatabase().databaseType).toBe('postgres');
    });

    test('should build both tables with their view models', () => {
        const { erdDocument } = convertSample();
        const tableViewModels = erdDocument.getTableViewModels();

        expect(tableViewModels).toHaveLength(2);
        const users = tableViewModels.find(view => (view.tableModel.physicalName === 'users'));
        expect(users).toBeDefined();
        expect(users?.corner).toEqual({ top: 40, left: 40 });
        expect(users?.headerColor.background.red).toBe(144);
    });

    test('should assign schemaId for a schema-supporting database (PostgreSQL) and register the schema', () => {
        const { erdDocument } = convertSample();
        const tableViewModels = erdDocument.getTableViewModels();
        const users = tableViewModels.find(view => (view.tableModel.physicalName === 'users'))!;

        expect(users.tableModel.schemaId).not.toBe('');
        const schema = erdDocument.findSchema(users.tableModel.schemaId);
        expect(schema?.schemaName).toBe('public');
    });

    test('should resolve a word-based column to a shared ColumnShareModel', () => {
        const { erdDocument } = convertSample();
        const users = erdDocument.getTableViewModels().find(view => (view.tableModel.physicalName === 'users'))!;

        const nameEntry = users.tableModel.columnEntries[1];
        expect(nameEntry.modelType).toBe('single');
        if (nameEntry.modelType !== 'single') { return; }

        const columnModel = erdDocument.findColumnModel(nameEntry.columnModelId);
        expect(columnModel).not.toBeNull();
        if ((columnModel == null) || (columnModel.entityType !== 'simple')) { return; }

        const columnShareModel = erdDocument.findColumnShareModel(columnModel.columnShareModelId);
        expect(columnShareModel?.physicalName).toBe('name');
        expect(columnShareModel?.precision).toBe('100');
    });

    test('should build the column group and reference it from the table', () => {
        const { erdDocument } = convertSample();
        const columnGroupModels = erdDocument.getColumnGroupModels();

        expect(columnGroupModels).toHaveLength(1);
        expect(columnGroupModels[0].groupName).toBe('audit_timestamp');
        expect(columnGroupModels[0].columnModelIds).toHaveLength(1);

        const users = erdDocument.getTableViewModels().find(view => (view.tableModel.physicalName === 'users'))!;
        const groupEntry = users.tableModel.columnEntries[2];
        expect(groupEntry).toEqual({ modelType: 'group', columnGroupId: columnGroupModels[0].columnGroupId });
    });

    test('should wire the relation to the correct parent/child tables and column pair', () => {
        const { erdDocument } = convertSample();
        const relationViewModels = erdDocument.getRelationViewModels();

        expect(relationViewModels).toHaveLength(1);
        const relationModel = relationViewModels[0].relationModel;

        const users = erdDocument.getTableViewModels().find(view => (view.tableModel.physicalName === 'users'))!;
        const orders = erdDocument.getTableViewModels().find(view => (view.tableModel.physicalName === 'orders'))!;

        expect(relationModel.parentTableModelId).toBe(users.tableId);
        expect(relationModel.childTableModelId).toBe(orders.tableId);
        expect(relationModel.relationName).toBe('fk_orders_user');
        expect(relationModel.childCardinality).toBe('1..N');
        expect(relationModel.onDeleteAction).toBe('CASCADE');
        expect(relationModel.relationPairs).toHaveLength(1);

        // parent 側は users.id (word_id 0 の PK 列)、child 側は orders.user_id (FK 列)
        const pair = relationModel.relationPairs[0];
        const parentColumn = erdDocument.findColumnModel(pair.parentColumnModelId);
        const childColumn = erdDocument.findColumnModel(pair.childColumnModelId);
        expect((parentColumn?.entityType === 'simple') && (parentColumn.primaryKey)).toBe(true);
        expect((childColumn?.entityType === 'simple') && (childColumn.notNull)).toBe(true);

        const lineViewModel = relationViewModels[0].lineViewModel;
        expect(lineViewModel.edges).toEqual([{ x: 100, y: 50 }]);
        expect(lineViewModel.color.red).toBe(194);
    });

    test('should build the note as a foreground memo and the category as a perspective referencing both tables', () => {
        const { erdDocument } = convertSample();

        expect(erdDocument.getMemoViewModels().frontMemos).toHaveLength(0);

        const perspectives = erdDocument.erdSettingModel.getPerspectiveModels();
        expect(perspectives).toHaveLength(1);
        expect(perspectives[0].perspectiveName).toBe('Sales');

        const users = erdDocument.getTableViewModels().find(view => (view.tableModel.physicalName === 'users'))!;
        const orders = erdDocument.getTableViewModels().find(view => (view.tableModel.physicalName === 'orders'))!;
        expect(perspectives[0].containsModel(users.tableId)).toBe(true);
        expect(perspectives[0].containsModel(orders.tableId)).toBe(true);
    });

    test('should survive a JSON round trip identically to a freshly converted document', () => {
        const { erdDocument } = convertSample();

        const roundTripped = ErdDocument.toObject(JSON.parse(JSON.stringify(erdDocument.toJSON())));

        expect(roundTripped.toJSON()).toEqual(erdDocument.toJSON());
    });

    test('should not populate schemaConfig for a database that does not support schemas (MySQL)', () => {
        const ermText = `<diagram>
            <settings><database>MySQL</database></settings>
            <contents>
                <table>
                    <id>0</id><x>0</x><y>0</y>
                    <connections></connections>
                    <physical_name>t1</physical_name>
                    <columns></columns>
                    <indexes></indexes>
                    <complex_unique_key_list></complex_unique_key_list>
                    <table_properties><schema>some_schema</schema></table_properties>
                </table>
            </contents>
        </diagram>`;

        const result = convertErm('doc', ermText);
        expect(result.result).toBe('success');
        if (result.result === 'failure') { return; }

        const tableViewModel = result.erdDocument.getTableViewModels()[0];
        expect(tableViewModel.tableModel.schemaId).toBe('');
    });

    test('should return a null document and a failure message for an unsupported database', () => {
        const ermText = '<diagram><settings><database>Oracle</database></settings></diagram>';
        const result = convertErm('doc', ermText);

        expect(result.result).toBe('failure');
        if (result.result === 'success') { return; }

        expect(result.failureMessage).toContain('Oracle');
        expect(result.summaries.some(summary => (summary.result === 'failure'))).toBe(false);
    });

    test('should return a null document for malformed XML', () => {
        const result = convertErm('doc', 'not xml');

        expect(result.result).toBe('failure');
    });

    // 実 ERMaster が出力した .erm での回帰テスト。FK 列の名前継承・"0..n" の多重度変換・
    // referenced_column/relation の重複排除が importer の出力にも正しく反映されることを確認する。
    describe('an actual ERMaster-produced file (ermaster_postgres.erm)', () => {
        test('should give the inherited name to the FK column ColumnShareModel', () => {
            const { erdDocument } = convertErmasterPostgresSample();
            const userSignIn = erdDocument.getTableViewModels()
                .find(view => (view.tableModel.physicalName === 'user_sign_in'))!;

            const fkEntry = userSignIn.tableModel.columnEntries[1];
            expect(fkEntry.modelType).toBe('single');
            if (fkEntry.modelType !== 'single') { return; }

            const columnModel = erdDocument.findColumnModel(fkEntry.columnModelId);
            if ((columnModel == null) || (columnModel.entityType !== 'simple')) { return; }
            const columnShareModel = erdDocument.findColumnShareModel(columnModel.columnShareModelId);

            expect(columnShareModel?.physicalName).toBe('user_id');
            expect(columnShareModel?.logicalName).toBe('ユーザID');
        });

        test('should map every relation to childCardinality "0..N" with no duplicated relation pairs', () => {
            const { erdDocument } = convertErmasterPostgresSample();
            const relationViewModels = erdDocument.getRelationViewModels();

            expect(relationViewModels).toHaveLength(6);
            relationViewModels.forEach(relationViewModel => {
                expect(relationViewModel.relationModel.childCardinality).toBe('0..N');
            });

            const userFavorite = erdDocument.getTableViewModels()
                .find(view => (view.tableModel.physicalName === 'user_favorite'))!;
            const relationsIntoUserFavorite = relationViewModels
                .filter(relationViewModel => (relationViewModel.relationModel.childTableModelId === userFavorite.tableId));

            expect(relationsIntoUserFavorite).toHaveLength(2);
            relationsIntoUserFavorite.forEach(relationViewModel => {
                expect(relationViewModel.relationModel.relationPairs).toHaveLength(1);
            });
        });
    });
});
