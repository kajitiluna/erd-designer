import { describe, expect, test } from 'vitest';

import ColorValue from '~/models/ColorValue';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import DbSchemaModel from '~/models/database/DbSchemaModel';
import ErdDocument from '~/models/ErdDocument';
import LineViewModel from '~/models/LineViewModel';
import RelationViewModel from '~/models/RelationViewModel';
import ColumnEntry from '~/models/database/ColumnEntry';
import ColumnModel from '~/models/database/ColumnModel';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import { DatabaseType } from '~/models/database/DatabaseType';
import RelationModel from '~/models/database/RelationModel';
import RelationPair from '~/models/database/RelationPair';
import SimpleColumnModel from '~/models/database/SimpleColumnModel';
import StructColumnModel from '~/models/database/StructColumnModel';
import StructColumnShareModel from '~/models/database/StructColumnShareModel';
import TableIndexModel, { IndexColumnModel } from '~/models/database/TableIndexModel';
import TableModel from '~/models/database/TableModel';
import TableUniqueKeysModel, { UniqueKeysColumnModel } from '~/models/database/TableUniqueKeysModel';
import { findDatabaseColumns } from '~/models/database/columns';
import TableViewModel from '~/models/TableViewModel';
import DesignSnapshot from '~/models/schema/design-snapshot';
import { SchemaCompareScope } from '~/models/schema/schema-snapshot';

const TEST_COLORS = {
    background: new ColorValue({ red: 255, green: 255, blue: 255 }),
    foreground: new ColorValue({ red: 0, green: 0, blue: 0 })
};

const FULL_SCOPE: SchemaCompareScope = {
    withIndex: true, withForeignKey: true, withComment: true, withSchema: true, withLogicalName: true,
    commentStyle: 'with_description'
};

const findColumnType = (databaseType: DatabaseType, name: string) => {
    const columnType = findDatabaseColumns(databaseType).find(candidate => candidate.name === name);
    if (columnType == null) {
        throw new Error(`column type not found: ${name}`);
    }
    return columnType;
};

const initTableViewModel = (tableModel: TableModel, top: number = 0): TableViewModel => {
    return new TableViewModel({ tableModel, corner: { top, left: 0 }, headerColor: TEST_COLORS });
};

describe('toSchemaSnapshot (MySQL)', () => {
    const idShare = new ColumnShareModel({
        columnShareModelId: 'share-id', physicalName: 'id', logicalName: 'id',
        columnType: findColumnType('mysql', 'int (m)'), precision: '11'
    });
    const nameShare = new ColumnShareModel({
        columnShareModelId: 'share-name', physicalName: 'name', logicalName: 'ユーザ名',
        columnType: findColumnType('mysql', 'varchar (m)'), precision: '255'
    });
    const statusShare = new ColumnShareModel({
        columnShareModelId: 'share-status', physicalName: 'status', logicalName: 'status',
        columnType: findColumnType('mysql', 'int'), unsigned: true
    });
    const emailShare = new ColumnShareModel({
        columnShareModelId: 'share-email', physicalName: 'email', logicalName: 'email',
        columnType: findColumnType('mysql', 'varchar (m)'), precision: '255'
    });

    const idColumn = new SimpleColumnModel({
        columnModelId: 'col-id', columnShareModelId: idShare.columnShareModelId,
        primaryKey: true, notNull: true, autoIncrement: true
    });
    const nameColumn = new SimpleColumnModel({
        columnModelId: 'col-name', columnShareModelId: nameShare.columnShareModelId, notNull: true
    });
    const statusColumn = new SimpleColumnModel({
        columnModelId: 'col-status', columnShareModelId: statusShare.columnShareModelId, notNull: true
    });
    const emailColumn = new SimpleColumnModel({
        columnModelId: 'col-email', columnShareModelId: emailShare.columnShareModelId, unique: true
    });

    const uniqueKeysModel = new TableUniqueKeysModel({
        tableUniqueKeysModelId: 'uq-name', physicalName: 'uq_user__name',
        uniqueKeysColumnModels: [new UniqueKeysColumnModel({ columnModelId: 'col-name', sortOrderType: '' })]
    });
    const indexModel = new TableIndexModel({
        tableIndexModelId: 'idx-status', physicalName: 'idx_user__status',
        indexColumnModels: [new IndexColumnModel({ columnModelId: 'col-status' })]
    });

    const tableModel = new TableModel({
        tableModelId: 'table-user', physicalName: 'user',
        columnEntries: [
            { modelType: 'single', columnModelId: 'col-id' },
            { modelType: 'single', columnModelId: 'col-name' },
            { modelType: 'single', columnModelId: 'col-status' },
            { modelType: 'single', columnModelId: 'col-email' }
        ] as ColumnEntry[],
        uniqueKeysModels: [uniqueKeysModel],
        tableIndexModels: [indexModel]
    });

    const erdDocument = ErdDocument.create({
        documentName: 'schema-snapshot-mysql', databaseSettingModel: DatabaseSettingModel.create('mysql'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [initTableViewModel(tableModel)],
        columnModels: [idColumn, nameColumn, statusColumn, emailColumn],
        columnShareModels: [idShare, nameShare, statusShare, emailShare]
    });

    test('mysql has no schema concept, so schemaNames and TableSnapshot.schemaName are always empty', () => {
        const snapshot = DesignSnapshot.toSchemaSnapshot(erdDocument, FULL_SCOPE);

        expect(snapshot.databaseType).toBe('mysql');
        expect(snapshot.schemaNames).toEqual([]);
        expect(snapshot.tables[0].schemaName).toBe('');
    });

    test('a column whose logical name equals its physical name carries no comment', () => {
        const snapshot = DesignSnapshot.toSchemaSnapshot(erdDocument, FULL_SCOPE);
        const idColumnSnapshot = snapshot.tables[0].columns.find(column => column.columnName === 'id');

        expect(idColumnSnapshot?.comment).toBe('');
    });

    test('a column whose logical name differs from its physical name carries that logical name as a comment', () => {
        const snapshot = DesignSnapshot.toSchemaSnapshot(erdDocument, FULL_SCOPE);
        const nameColumnSnapshot = snapshot.tables[0].columns.find(column => column.columnName === 'name');

        expect(nameColumnSnapshot?.comment).toBe('ユーザ名');
    });

    test('unsigned is carried from the resolved column type, not folded into typeExpression', () => {
        const snapshot = DesignSnapshot.toSchemaSnapshot(erdDocument, FULL_SCOPE);
        const statusColumnSnapshot = snapshot.tables[0].columns.find(column => column.columnName === 'status');

        expect(statusColumnSnapshot?.unsigned).toBe(true);
        expect(statusColumnSnapshot?.typeExpression).toBe('INT');
    });

    test('an inline unique column is folded into a single-column UniqueKeySnapshot with no constraint name', () => {
        const snapshot = DesignSnapshot.toSchemaSnapshot(erdDocument, FULL_SCOPE);

        expect(snapshot.tables[0].uniqueKeys).toContainEqual({ constraintName: '', columnNames: ['email'] });
    });

    test('a table-level unique constraint keeps its physical name', () => {
        const snapshot = DesignSnapshot.toSchemaSnapshot(erdDocument, FULL_SCOPE);

        expect(snapshot.tables[0].uniqueKeys).toContainEqual({ constraintName: 'uq_user__name', columnNames: ['name'] });
    });

    // MySQL では UNIQUE 制約と UNIQUE インデックスが同一実体で、DB 側イントロスペクタは常に
    // uniqueKeys へ振る(mysql.ts groupIndexColumnRows)。design 側が indexes に残したままだと、
    // 同じ物理インデックスが index.missing と uniqueKey.unexpected の両方として現れる。
    test('a UNIQUE-option index is folded into uniqueKeys, not left in indexes', () => {
        const uniqueIndexModel = new TableIndexModel({
            tableIndexModelId: 'idx-email', physicalName: 'uq_user__email_idx', indexOption: 'UNIQUE',
            indexColumnModels: [new IndexColumnModel({ columnModelId: 'col-email' })]
        });
        const tableModelWithUniqueIndex = new TableModel({
            tableModelId: 'table-user', physicalName: 'user',
            columnEntries: [
                { modelType: 'single', columnModelId: 'col-id' },
                { modelType: 'single', columnModelId: 'col-name' },
                { modelType: 'single', columnModelId: 'col-status' },
                { modelType: 'single', columnModelId: 'col-email' }
            ] as ColumnEntry[],
            tableIndexModels: [indexModel, uniqueIndexModel]
        });
        const documentWithUniqueIndex = ErdDocument.create({
            documentName: 'schema-snapshot-mysql-unique-index', databaseSettingModel: DatabaseSettingModel.create('mysql'),
            schemaConfig: DbSchemaConfig.create(),
            tableViewModels: [initTableViewModel(tableModelWithUniqueIndex)],
            columnModels: [idColumn, nameColumn, statusColumn, emailColumn],
            columnShareModels: [idShare, nameShare, statusShare, emailShare]
        });

        const snapshot = DesignSnapshot.toSchemaSnapshot(documentWithUniqueIndex, FULL_SCOPE);

        expect(snapshot.tables[0].uniqueKeys).toContainEqual({ constraintName: 'uq_user__email_idx', columnNames: ['email'] });
        expect(snapshot.tables[0].indexes.some(index => (index.indexName === 'uq_user__email_idx'))).toBe(false);
    });

    test('an unspecified index type defaults to BTREE, matching the DB default for a plain CREATE INDEX', () => {
        const snapshot = DesignSnapshot.toSchemaSnapshot(erdDocument, FULL_SCOPE);

        expect(snapshot.tables[0].indexes).toEqual([
            { indexName: 'idx_user__status', columnNames: ['status'], indexOption: '', indexType: 'BTREE' }
        ]);
    });

    test('withIndex: false omits indexes entirely', () => {
        const snapshot = DesignSnapshot.toSchemaSnapshot(erdDocument, { ...FULL_SCOPE, withIndex: false });

        expect(snapshot.tables[0].indexes).toEqual([]);
    });

    test('primary key column names follow column entry order', () => {
        const snapshot = DesignSnapshot.toSchemaSnapshot(erdDocument, FULL_SCOPE);

        expect(snapshot.tables[0].primaryKeyColumnNames).toEqual(['id']);
    });
});

describe('toSchemaSnapshot (PostgreSQL)', () => {
    test('a SERIAL column normalizes to its underlying integer type and is marked auto-increment', () => {
        const idShare = new ColumnShareModel({
            columnShareModelId: 'share-item-id', physicalName: 'item_id', logicalName: 'item_id',
            columnType: findColumnType('postgres', 'serial')
        });
        const idColumn = new SimpleColumnModel({
            columnModelId: 'col-item-id', columnShareModelId: idShare.columnShareModelId, primaryKey: true, notNull: true
        });
        const tableModel = new TableModel({
            tableModelId: 'table-item', physicalName: 'item',
            columnEntries: [{ modelType: 'single', columnModelId: 'col-item-id' }] as ColumnEntry[]
        });
        const erdDocument = ErdDocument.create({
            documentName: 'schema-snapshot-postgres-serial', databaseSettingModel: DatabaseSettingModel.create('postgres'),
            schemaConfig: DbSchemaConfig.create(),
            tableViewModels: [initTableViewModel(tableModel)],
            columnModels: [idColumn], columnShareModels: [idShare]
        });

        const snapshot = DesignSnapshot.toSchemaSnapshot(erdDocument, FULL_SCOPE);
        const columnSnapshot = snapshot.tables[0].columns[0];

        expect(columnSnapshot.typeExpression).toBe('INTEGER');
        expect(columnSnapshot.autoIncrement).toBe(true);
    });

    // db-diff を実DB(PostgreSQL 17)で検証した際に判明: CREATE INDEX で USING を省略すると
    // 実際には常に btree として作成され、pg_am は明示的に "BTREE" を返す。design 側で
    // indexType を指定していない(既定の空文字)場合、DB 側の "BTREE" と恒常的に不一致になっていた。
    test('an unspecified index type defaults to BTREE for PostgreSQL, matching the actual server default', () => {
        const idShare = new ColumnShareModel({
            columnShareModelId: 'share-id', physicalName: 'id', logicalName: 'id',
            columnType: findColumnType('postgres', 'integer')
        });
        const idColumn = new SimpleColumnModel({
            columnModelId: 'col-id', columnShareModelId: idShare.columnShareModelId, primaryKey: true, notNull: true
        });
        const indexModel = new TableIndexModel({
            tableIndexModelId: 'idx-id', physicalName: 'idx_item__id',
            indexColumnModels: [new IndexColumnModel({ columnModelId: 'col-id' })]
        });
        const tableModel = new TableModel({
            tableModelId: 'table-item', physicalName: 'item',
            columnEntries: [{ modelType: 'single', columnModelId: 'col-id' }] as ColumnEntry[],
            tableIndexModels: [indexModel]
        });
        const erdDocument = ErdDocument.create({
            documentName: 'schema-snapshot-postgres-index-type', databaseSettingModel: DatabaseSettingModel.create('postgres'),
            schemaConfig: DbSchemaConfig.create(),
            tableViewModels: [initTableViewModel(tableModel)],
            columnModels: [idColumn], columnShareModels: [idShare]
        });

        const snapshot = DesignSnapshot.toSchemaSnapshot(erdDocument, FULL_SCOPE);

        expect(snapshot.tables[0].indexes[0].indexType).toBe('BTREE');
    });

    test('NUMERIC(p, s) inserts a space after the comma, matching ColumnType.specifiedType()', () => {
        const priceShare = new ColumnShareModel({
            columnShareModelId: 'share-price', physicalName: 'price', logicalName: 'price',
            columnType: findColumnType('postgres', 'numeric (p, s)'), precision: '10', scale: '2'
        });
        const priceColumn = new SimpleColumnModel({
            columnModelId: 'col-price', columnShareModelId: priceShare.columnShareModelId, notNull: true
        });
        const tableModel = new TableModel({
            tableModelId: 'table-item', physicalName: 'item',
            columnEntries: [{ modelType: 'single', columnModelId: 'col-price' }] as ColumnEntry[]
        });
        const erdDocument = ErdDocument.create({
            documentName: 'schema-snapshot-postgres-numeric', databaseSettingModel: DatabaseSettingModel.create('postgres'),
            schemaConfig: DbSchemaConfig.create(),
            tableViewModels: [initTableViewModel(tableModel)],
            columnModels: [priceColumn], columnShareModels: [priceShare]
        });

        const snapshot = DesignSnapshot.toSchemaSnapshot(erdDocument, FULL_SCOPE);

        expect(snapshot.tables[0].columns[0].typeExpression).toBe('NUMERIC(10, 2)');
    });

    test('a table-less schema still appears in schemaNames, and a table carries its own schema name', () => {
        const schema = DbSchemaModel.create('shop', '');
        const idShare = new ColumnShareModel({
            columnShareModelId: 'share-item-id', physicalName: 'item_id', logicalName: 'item_id',
            columnType: findColumnType('postgres', 'integer')
        });
        const idColumn = new SimpleColumnModel({
            columnModelId: 'col-item-id', columnShareModelId: idShare.columnShareModelId, primaryKey: true, notNull: true
        });
        const tableModel = new TableModel({
            tableModelId: 'table-item', physicalName: 'item', schemaId: schema.schemaId,
            columnEntries: [{ modelType: 'single', columnModelId: 'col-item-id' }] as ColumnEntry[]
        });
        const erdDocument = ErdDocument.create({
            documentName: 'schema-snapshot-postgres-schema', databaseSettingModel: DatabaseSettingModel.create('postgres'),
            schemaConfig: DbSchemaConfig.create({ defaultSchemaId: schema.schemaId, schemas: [schema] }),
            tableViewModels: [initTableViewModel(tableModel)],
            columnModels: [idColumn], columnShareModels: [idShare]
        });

        const snapshot = DesignSnapshot.toSchemaSnapshot(erdDocument, FULL_SCOPE);

        expect(snapshot.schemaNames).toEqual(['shop']);
        expect(snapshot.tables[0].schemaName).toBe('shop');
    });

    // 実DB(PostgreSQL 17)で db-diff を検証した際に判明した不具合の回帰テスト:
    // .erd 側でスキーマを1つも作っていない設計は、テーブルの schemaName が "" のままだったが、
    // 実際の PostgreSQL は同じテーブルを "public" スキーマに作成するため、db-diff は全テーブルを
    // table.missing(design 側の "")と table.unexpected(DB 側の "public")の二重に報告していた。
    test('a document with no schemas at all defaults to "public", matching what PostgreSQL actually does', () => {
        const idShare = new ColumnShareModel({
            columnShareModelId: 'share-item-id', physicalName: 'item_id', logicalName: 'item_id',
            columnType: findColumnType('postgres', 'integer')
        });
        const idColumn = new SimpleColumnModel({
            columnModelId: 'col-item-id', columnShareModelId: idShare.columnShareModelId, primaryKey: true, notNull: true
        });
        const tableModel = new TableModel({
            tableModelId: 'table-item', physicalName: 'item',
            columnEntries: [{ modelType: 'single', columnModelId: 'col-item-id' }] as ColumnEntry[]
        });
        const erdDocument = ErdDocument.create({
            documentName: 'schema-snapshot-postgres-no-schema', databaseSettingModel: DatabaseSettingModel.create('postgres'),
            schemaConfig: DbSchemaConfig.create(),
            tableViewModels: [initTableViewModel(tableModel)],
            columnModels: [idColumn], columnShareModels: [idShare]
        });

        const snapshot = DesignSnapshot.toSchemaSnapshot(erdDocument, FULL_SCOPE);

        expect(snapshot.schemaNames).toEqual(['public']);
        expect(snapshot.tables[0].schemaName).toBe('public');
    });

    test('mysql is unaffected by the PostgreSQL "public" default, since it has no schema concept at all', () => {
        const idShare = new ColumnShareModel({
            columnShareModelId: 'share-id', physicalName: 'id', logicalName: 'id',
            columnType: findColumnType('mysql', 'int')
        });
        const idColumn = new SimpleColumnModel({
            columnModelId: 'col-id', columnShareModelId: idShare.columnShareModelId, primaryKey: true, notNull: true
        });
        const tableModel = new TableModel({
            tableModelId: 'table-user', physicalName: 'user',
            columnEntries: [{ modelType: 'single', columnModelId: 'col-id' }] as ColumnEntry[]
        });
        const erdDocument = ErdDocument.create({
            documentName: 'schema-snapshot-mysql-no-schema', databaseSettingModel: DatabaseSettingModel.create('mysql'),
            schemaConfig: DbSchemaConfig.create(),
            tableViewModels: [initTableViewModel(tableModel)],
            columnModels: [idColumn], columnShareModels: [idShare]
        });

        const snapshot = DesignSnapshot.toSchemaSnapshot(erdDocument, FULL_SCOPE);

        expect(snapshot.schemaNames).toEqual([]);
        expect(snapshot.tables[0].schemaName).toBe('');
    });
});

describe('toSchemaSnapshot (foreign keys)', () => {
    const buildParentChildDocument = (databaseType: DatabaseType, integerTypeName: string): ErdDocument => {
        const parentIdShare = new ColumnShareModel({
            columnShareModelId: 'share-parent-id', physicalName: 'id', logicalName: 'id',
            columnType: findColumnType(databaseType, integerTypeName)
        });
        const childRefShare = new ColumnShareModel({
            columnShareModelId: 'share-child-ref', physicalName: 'shop_id', logicalName: 'shop_id',
            columnType: findColumnType(databaseType, integerTypeName)
        });

        const parentIdColumn = new SimpleColumnModel({
            columnModelId: 'col-parent-id', columnShareModelId: parentIdShare.columnShareModelId,
            primaryKey: true, notNull: true
        });
        const childRefColumn = new SimpleColumnModel({
            columnModelId: 'col-child-ref', columnShareModelId: childRefShare.columnShareModelId, notNull: true
        });

        const parentTableModel = new TableModel({
            tableModelId: 'table-shop', physicalName: 'shop',
            columnEntries: [{ modelType: 'single', columnModelId: 'col-parent-id' }] as ColumnEntry[]
        });
        const childTableModel = new TableModel({
            tableModelId: 'table-item', physicalName: 'item',
            columnEntries: [{ modelType: 'single', columnModelId: 'col-child-ref' }] as ColumnEntry[]
        });

        const relationModel = new RelationModel({
            relationModelId: 'relation-shop-item',
            parentTableModelId: 'table-shop', childTableModelId: 'table-item',
            relationPairs: [new RelationPair({ parentColumnModelId: 'col-parent-id', childColumnModelId: 'col-child-ref' })]
        });
        const relationViewModel = new RelationViewModel({ relationModel, lineViewModel: new LineViewModel({}) });

        return ErdDocument.create({
            documentName: 'schema-snapshot-fk', databaseSettingModel: DatabaseSettingModel.create(databaseType),
            schemaConfig: DbSchemaConfig.create(),
            tableViewModels: [initTableViewModel(parentTableModel), initTableViewModel(childTableModel, 200)],
            relationViewModels: [relationViewModel],
            columnModels: [parentIdColumn, childRefColumn],
            columnShareModels: [parentIdShare, childRefShare]
        });
    };

    test('a foreign key never carries a constraint name, since create-ddl.ts does not emit one', () => {
        const erdDocument = buildParentChildDocument('mysql', 'int');

        const snapshot = DesignSnapshot.toSchemaSnapshot(erdDocument, FULL_SCOPE);
        const childTable = snapshot.tables.find(table => table.tableName === 'item');

        expect(childTable?.foreignKeys).toEqual([{
            constraintName: '', columnNames: ['shop_id'],
            parentSchemaName: '', parentTableName: 'shop', parentColumnNames: ['id'],
            onUpdate: 'RESTRICT', onDelete: 'RESTRICT'
        }]);
    });

    test('withForeignKey: false omits foreign keys entirely', () => {
        const erdDocument = buildParentChildDocument('mysql', 'int');

        const snapshot = DesignSnapshot.toSchemaSnapshot(erdDocument, { ...FULL_SCOPE, withForeignKey: false });
        const childTable = snapshot.tables.find(table => table.tableName === 'item');

        expect(childTable?.foreignKeys).toEqual([]);
    });
});

describe('toSchemaSnapshot (struct columns)', () => {
    test('struct columns are excluded from comparison and reported as a warning', () => {
        const structShare = new StructColumnShareModel({
            structShareModelId: 'struct-address', physicalName: 'address', logicalName: 'address'
        });
        const structWrapper = new StructColumnModel({
            columnModelId: 'col-address', structShareModelId: structShare.structShareModelId
        });

        const idShare = new ColumnShareModel({
            columnShareModelId: 'share-id', physicalName: 'id', logicalName: 'id',
            columnType: findColumnType('bigquery', 'int64')
        });
        const idColumn = new SimpleColumnModel({
            columnModelId: 'col-id', columnShareModelId: idShare.columnShareModelId, notNull: true
        });

        const tableModel = new TableModel({
            tableModelId: 'table-user', physicalName: 'user',
            columnEntries: [
                { modelType: 'single', columnModelId: 'col-id' },
                { modelType: 'single', columnModelId: 'col-address' }
            ] as ColumnEntry[]
        });

        const erdDocument = ErdDocument.create({
            documentName: 'schema-snapshot-struct', databaseSettingModel: DatabaseSettingModel.create('bigquery'),
            schemaConfig: DbSchemaConfig.create(),
            tableViewModels: [initTableViewModel(tableModel)],
            structShareModels: [structShare],
            columnModels: [idColumn, structWrapper as unknown as ColumnModel],
            columnShareModels: [idShare]
        });

        const snapshot = DesignSnapshot.toSchemaSnapshot(erdDocument, FULL_SCOPE);

        expect(snapshot.tables[0].columns.map(column => column.columnName)).toEqual(['id']);
        expect(snapshot.warnings).toContainEqual({
            category: 'struct.skipped', schemaName: '', tableName: 'user',
            message: '1 struct column(s) are not supported by schema verification and were excluded from comparison.'
        });
    });
});
