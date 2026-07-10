import { describe, test, expect } from 'vitest';

import { createDdl } from '~/models/create-ddl';
import ColorValue from '~/models/ColorValue';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';
import ColumnModel from '~/models/database/ColumnModel';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import { findDatabaseColumns } from '~/models/database/columns';
import RelationModel from '~/models/database/RelationModel';
import RelationPair from '~/models/database/RelationPair';
import TableModel, { ColumnEntry } from '~/models/database/TableModel';
import TableViewModel from '~/models/TableViewModel';
import RelationViewModel from '~/models/RelationViewModel';
import LineViewModel from '~/models/LineViewModel';
import { DatabaseType } from '~/models/database/DatabaseType';

const TEST_COLORS = {
    background: new ColorValue({ red: 255, green: 255, blue: 255 }),
    foreground: new ColorValue({ red: 0, green: 0, blue: 0 })
};

const findColumnType = (databaseType: DatabaseType, name: string) => {
    const columnType = findDatabaseColumns(databaseType).find(candidate => candidate.name === name);
    if (columnType == null) {
        throw new Error(`column type not found: ${name}`);
    }
    return columnType;
};

// 既存4DB (postgres/mysql/mariadb/ms_sqlserver) の FK 出力が、フック導入の前後で1文字も変わらないことを完全一致 (toBe) で証明する。
// フックのデフォルト実装 (foreignKeyQueryForAlter) が現行のALTER文と一致することの担保。
const buildFkSampleDocument = (databaseType: DatabaseType, integerTypeName: string): ErdDocument => {
    const parentIdShare = new ColumnShareModel({
        columnShareModelId: 'share-parent-id',
        physicalName: 'parent_id',
        logicalName: 'Parent ID',
        columnType: findColumnType(databaseType, integerTypeName)
    });
    const childIdShare = new ColumnShareModel({
        columnShareModelId: 'share-child-id',
        physicalName: 'child_id',
        logicalName: 'Child ID',
        columnType: findColumnType(databaseType, integerTypeName)
    });
    const childRefShare = new ColumnShareModel({
        columnShareModelId: 'share-child-ref',
        physicalName: 'ref_parent_id',
        logicalName: 'Ref Parent ID',
        columnType: findColumnType(databaseType, integerTypeName)
    });

    const parentIdColumn = new ColumnModel({
        columnModelId: 'col-parent-id',
        columnShareModelId: parentIdShare.columnShareModelId,
        physicalName: 'parent_id',
        primaryKey: true,
        notNull: true
    });
    const childIdColumn = new ColumnModel({
        columnModelId: 'col-child-id',
        columnShareModelId: childIdShare.columnShareModelId,
        physicalName: 'child_id',
        primaryKey: true,
        notNull: true
    });
    const childRefColumn = new ColumnModel({
        columnModelId: 'col-child-ref',
        columnShareModelId: childRefShare.columnShareModelId,
        physicalName: 'ref_parent_id'
    });

    const parentTableModel = new TableModel({
        tableModelId: 'table-parent',
        physicalName: 'parent_table',
        columnEntries: [{ modelType: 'single', columnModelId: parentIdColumn.columnModelId }] as ColumnEntry[]
    });
    const childTableModel = new TableModel({
        tableModelId: 'table-child',
        physicalName: 'child_table',
        columnEntries: [
            { modelType: 'single', columnModelId: childIdColumn.columnModelId },
            { modelType: 'single', columnModelId: childRefColumn.columnModelId }
        ] as ColumnEntry[]
    });

    const parentTableView = new TableViewModel({
        tableModel: parentTableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS
    });
    const childTableView = new TableViewModel({
        tableModel: childTableModel, corner: { top: 200, left: 0 }, headerColor: TEST_COLORS
    });

    const relationModel = new RelationModel({
        relationModelId: 'relation-parent-child',
        parentTableModelId: parentTableModel.tableModelId,
        childTableModelId: childTableModel.tableModelId,
        relationPairs: [
            new RelationPair({
                parentColumnModelId: parentIdColumn.columnModelId,
                childColumnModelId: childRefColumn.columnModelId
            })
        ],
        onUpdateAction: "CASCADE",
        onDeleteAction: "SET NULL"
    });
    const relationViewModel = new RelationViewModel({
        relationModel,
        lineViewModel: new LineViewModel({})
    });

    return ErdDocument.create({
        documentName: 'fk-hook-regression',
        erdSettingModel: ErdSettingModel.create('fk-hook-regression'),
        databaseSettingModel: DatabaseSettingModel.create(databaseType),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [parentTableView, childTableView],
        relationViewModels: [relationViewModel],
        columnModels: [parentIdColumn, childIdColumn, childRefColumn],
        columnShareModels: [parentIdShare, childIdShare, childRefShare]
    });
};

const buildFkOnlyDdl = (databaseType: DatabaseType, integerTypeName: string): string => {
    const erdDocument = buildFkSampleDocument(databaseType, integerTypeName);
    return createDdl(erdDocument, {
        withTable: false,
        withIndex: false,
        withForeignKey: true,
        withSchema: false,
        withComment: false,
        commentStyle: "logical_name",
        commentSeparator: " : "
    });
};

const expectedAlterQuery = (childTableName: string, parentTableName: string): string => {
    return "/* create foreign keys. */\n"
        + `ALTER TABLE ${childTableName}\n`
        + "    ADD FOREIGN KEY (ref_parent_id)\n"
        + `    REFERENCES ${parentTableName} (parent_id)\n`
        + "    ON UPDATE CASCADE\n"
        + "    ON DELETE SET NULL;\n"
        + "\n";
};

describe('foreignKeyQuery hook regression (existing 4 databases unchanged)', () => {
    test('postgres: FK output matches the pre-existing ALTER TABLE format exactly', () => {
        const ddl = buildFkOnlyDdl('postgres', 'integer');
        expect(ddl).toBe(expectedAlterQuery('child_table', 'parent_table'));
    });

    test('mysql: FK output matches the pre-existing ALTER TABLE format exactly', () => {
        const ddl = buildFkOnlyDdl('mysql', 'int');
        expect(ddl).toBe(expectedAlterQuery('child_table', 'parent_table'));
    });

    test('mariadb: FK output matches the pre-existing ALTER TABLE format exactly', () => {
        const ddl = buildFkOnlyDdl('mariadb', 'int');
        expect(ddl).toBe(expectedAlterQuery('child_table', 'parent_table'));
    });

    test('ms_sqlserver: FK output matches the pre-existing ALTER TABLE format exactly', () => {
        const ddl = buildFkOnlyDdl('ms_sqlserver', 'int');
        expect(ddl).toBe(expectedAlterQuery('child_table', 'parent_table'));
    });
});
