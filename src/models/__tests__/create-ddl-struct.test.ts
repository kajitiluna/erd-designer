import { describe, test, expect } from 'vitest';

import { createDdl } from '~/models/create-ddl';
import ColorValue from '~/models/ColorValue';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';
import ColumnModel from '~/models/database/ColumnModel';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import ColumnStructModel from '~/models/database/ColumnStructModel';
import { findDatabaseColumns } from '~/models/database/columns';
import TableModel, { ColumnModelType } from '~/models/database/TableModel';
import TableViewModel from '~/models/TableViewModel';
import { DatabaseType } from '~/models/database/DatabaseType';

const TEST_COLORS = {
    background: new ColorValue({ red: 255, green: 255, blue: 255 }),
    foreground: new ColorValue({ red: 0, green: 0, blue: 0 })
};

const DDL_OPTION = {
    withTable: true,
    withIndex: true,
    withForeignKey: true,
    withSchema: false,
    withComment: true,
    commentStyle: "logical_name" as const,
    commentSeparator: " : "
};

const findColumnType = (databaseType: DatabaseType, name: string) => {
    const columnType = findDatabaseColumns(databaseType).find(candidate => candidate.name === name);
    if (columnType == null) {
        throw new Error(`column type not found: ${name}`);
    }
    return columnType;
};

type StructFixtureOptions = {
    tableModelId?: string,
    tableName?: string,
    columnStructModels?: ColumnStructModel[],
    columnModels?: ColumnModel[],
    columnShareModels?: ColumnShareModel[],
    tableColumnModelIds: string[]
};

// BigQuery で struct カラムを含むテーブルを組み立てる。テーブル上のカラムは
// tableColumnModelIds のみで構成し、struct のメンバー ColumnModel はテーブルの
// columns には含めず、columnModels / columnShareModels 経由でのみ ErdDocument に登録する。
const buildStructDocument = ({
    tableModelId = 'table-struct', tableName = 'sample_table',
    columnStructModels = [], columnModels, columnShareModels, tableColumnModelIds
}: StructFixtureOptions): ErdDocument => {
    const tableModel = new TableModel({
        tableModelId,
        physicalName: tableName,
        columns: tableColumnModelIds.map(columnModelId => {
            return { modelType: 'single', columnModelId } as ColumnModelType;
        })
    });

    const tableViewModel = new TableViewModel({
        tableModel,
        corner: { top: 0, left: 0 },
        headerColor: TEST_COLORS
    });

    return ErdDocument.create({
        documentName: 'bigquery-struct',
        erdSettingModel: ErdSettingModel.create('bigquery-struct'),
        databaseSettingModel: DatabaseSettingModel.create('bigquery'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [tableViewModel],
        columnModels,
        columnShareModels,
        columnStructModels
    });
};

describe('create-ddl: BigQuery STRUCT field expansion', () => {
    test('expands a simple struct column into STRUCT<field TYPE, ...>', () => {
        const structColumnShare = new ColumnShareModel({
            columnShareModelId: 'share-person',
            physicalName: 'person',
            logicalName: 'person',
            columnType: findColumnType('bigquery', 'struct'),
            columnStructId: 'struct-person'
        });
        const structColumn = new ColumnModel({
            columnModelId: 'col-person',
            columnShareModelId: structColumnShare.columnShareModelId,
            physicalName: 'person'
        });

        const nameMemberShare = new ColumnShareModel({
            columnShareModelId: 'share-member-name',
            physicalName: 'name',
            logicalName: 'name',
            columnType: findColumnType('bigquery', 'string')
        });
        const nameMember = new ColumnModel({
            columnModelId: 'col-member-name',
            columnShareModelId: nameMemberShare.columnShareModelId,
            physicalName: 'name'
        });
        const ageMemberShare = new ColumnShareModel({
            columnShareModelId: 'share-member-age',
            physicalName: 'age',
            logicalName: 'age',
            columnType: findColumnType('bigquery', 'int64')
        });
        const ageMember = new ColumnModel({
            columnModelId: 'col-member-age',
            columnShareModelId: ageMemberShare.columnShareModelId,
            physicalName: 'age'
        });

        const columnStructModel = new ColumnStructModel({
            columnStructId: 'struct-person',
            structName: 'Person',
            columnModelIds: [nameMember.columnModelId, ageMember.columnModelId]
        });

        const erdDocument = buildStructDocument({
            columnStructModels: [columnStructModel],
            columnModels: [structColumn, nameMember, ageMember],
            columnShareModels: [structColumnShare, nameMemberShare, ageMemberShare],
            tableColumnModelIds: [structColumn.columnModelId]
        });

        const ddl = createDdl(erdDocument, DDL_OPTION);

        expect(ddl).toContain('person STRUCT<name STRING, age INT64>');
    });

    test('expands a nested struct member recursively', () => {
        const structColumnShare = new ColumnShareModel({
            columnShareModelId: 'share-person',
            physicalName: 'person',
            logicalName: 'person',
            columnType: findColumnType('bigquery', 'struct'),
            columnStructId: 'struct-person'
        });
        const structColumn = new ColumnModel({
            columnModelId: 'col-person',
            columnShareModelId: structColumnShare.columnShareModelId,
            physicalName: 'person'
        });

        // nested struct: address STRUCT<city STRING>
        const cityMemberShare = new ColumnShareModel({
            columnShareModelId: 'share-member-city',
            physicalName: 'city',
            logicalName: 'city',
            columnType: findColumnType('bigquery', 'string')
        });
        const cityMember = new ColumnModel({
            columnModelId: 'col-member-city',
            columnShareModelId: cityMemberShare.columnShareModelId,
            physicalName: 'city'
        });
        const addressStructModel = new ColumnStructModel({
            columnStructId: 'struct-address',
            structName: 'Address',
            columnModelIds: [cityMember.columnModelId]
        });

        const addressMemberShare = new ColumnShareModel({
            columnShareModelId: 'share-member-address',
            physicalName: 'address',
            logicalName: 'address',
            columnType: findColumnType('bigquery', 'struct'),
            columnStructId: 'struct-address'
        });
        const addressMember = new ColumnModel({
            columnModelId: 'col-member-address',
            columnShareModelId: addressMemberShare.columnShareModelId,
            physicalName: 'address'
        });

        const nameMemberShare = new ColumnShareModel({
            columnShareModelId: 'share-member-name',
            physicalName: 'name',
            logicalName: 'name',
            columnType: findColumnType('bigquery', 'string')
        });
        const nameMember = new ColumnModel({
            columnModelId: 'col-member-name',
            columnShareModelId: nameMemberShare.columnShareModelId,
            physicalName: 'name'
        });

        const personStructModel = new ColumnStructModel({
            columnStructId: 'struct-person',
            structName: 'Person',
            columnModelIds: [addressMember.columnModelId, nameMember.columnModelId]
        });

        const erdDocument = buildStructDocument({
            columnStructModels: [addressStructModel, personStructModel],
            columnModels: [structColumn, addressMember, cityMember, nameMember],
            columnShareModels: [structColumnShare, addressMemberShare, cityMemberShare, nameMemberShare],
            tableColumnModelIds: [structColumn.columnModelId]
        });

        const ddl = createDdl(erdDocument, DDL_OPTION);

        expect(ddl).toContain('person STRUCT<address STRUCT<city STRING>, name STRING>');
    });

    test('wraps an array-of-struct column as ARRAY<STRUCT<...>>', () => {
        const structColumnShare = new ColumnShareModel({
            columnShareModelId: 'share-people',
            physicalName: 'people',
            logicalName: 'people',
            columnType: findColumnType('bigquery', 'struct'),
            columnStructId: 'struct-person',
            isArray: true
        });
        const structColumn = new ColumnModel({
            columnModelId: 'col-people',
            columnShareModelId: structColumnShare.columnShareModelId,
            physicalName: 'people'
        });

        const nameMemberShare = new ColumnShareModel({
            columnShareModelId: 'share-member-name',
            physicalName: 'name',
            logicalName: 'name',
            columnType: findColumnType('bigquery', 'string')
        });
        const nameMember = new ColumnModel({
            columnModelId: 'col-member-name',
            columnShareModelId: nameMemberShare.columnShareModelId,
            physicalName: 'name'
        });

        const columnStructModel = new ColumnStructModel({
            columnStructId: 'struct-person',
            structName: 'Person',
            columnModelIds: [nameMember.columnModelId]
        });

        const erdDocument = buildStructDocument({
            columnStructModels: [columnStructModel],
            columnModels: [structColumn, nameMember],
            columnShareModels: [structColumnShare, nameMemberShare],
            tableColumnModelIds: [structColumn.columnModelId]
        });

        const ddl = createDdl(erdDocument, DDL_OPTION);

        expect(ddl).toContain('people ARRAY<STRUCT<name STRING>>');
    });

    test('renders an array member field as ARRAY<TYPE> inside the struct', () => {
        const structColumnShare = new ColumnShareModel({
            columnShareModelId: 'share-item',
            physicalName: 'item',
            logicalName: 'item',
            columnType: findColumnType('bigquery', 'struct'),
            columnStructId: 'struct-item'
        });
        const structColumn = new ColumnModel({
            columnModelId: 'col-item',
            columnShareModelId: structColumnShare.columnShareModelId,
            physicalName: 'item'
        });

        const tagsMemberShare = new ColumnShareModel({
            columnShareModelId: 'share-member-tags',
            physicalName: 'tags',
            logicalName: 'tags',
            columnType: findColumnType('bigquery', 'int64'),
            isArray: true
        });
        const tagsMember = new ColumnModel({
            columnModelId: 'col-member-tags',
            columnShareModelId: tagsMemberShare.columnShareModelId,
            physicalName: 'tags'
        });

        const columnStructModel = new ColumnStructModel({
            columnStructId: 'struct-item',
            structName: 'Item',
            columnModelIds: [tagsMember.columnModelId]
        });

        const erdDocument = buildStructDocument({
            columnStructModels: [columnStructModel],
            columnModels: [structColumn, tagsMember],
            columnShareModels: [structColumnShare, tagsMemberShare],
            tableColumnModelIds: [structColumn.columnModelId]
        });

        const ddl = createDdl(erdDocument, DDL_OPTION);

        expect(ddl).toContain('item STRUCT<tags ARRAY<INT64>>');
    });

    test('skips a column whose columnStructId is not set and emits a warning after CREATE TABLE', () => {
        const structColumnShare = new ColumnShareModel({
            columnShareModelId: 'share-broken',
            physicalName: 'broken',
            logicalName: 'broken',
            columnType: findColumnType('bigquery', 'struct')
            // columnStructId left unset intentionally
        });
        const structColumn = new ColumnModel({
            columnModelId: 'col-broken',
            columnShareModelId: structColumnShare.columnShareModelId,
            physicalName: 'broken'
        });

        const idColumnShare = new ColumnShareModel({
            columnShareModelId: 'share-id',
            physicalName: 'id',
            logicalName: 'id',
            columnType: findColumnType('bigquery', 'int64')
        });
        const idColumn = new ColumnModel({
            columnModelId: 'col-id',
            columnShareModelId: idColumnShare.columnShareModelId,
            physicalName: 'id'
        });

        const erdDocument = buildStructDocument({
            columnModels: [idColumn, structColumn],
            columnShareModels: [idColumnShare, structColumnShare],
            tableColumnModelIds: [idColumn.columnModelId, structColumn.columnModelId]
        });

        const ddl = createDdl(erdDocument, DDL_OPTION);

        expect(ddl).not.toMatch(/^\s*broken\s/m);
        expect(ddl).toContain('id INT64');
        expect(ddl).toContain('WARNING: column sample_table.broken skipped (columnStructId is not set)');

        const createTableIndex = ddl.indexOf('CREATE TABLE sample_table');
        const warningIndex = ddl.indexOf('WARNING: column sample_table.broken skipped (columnStructId is not set)');
        expect(warningIndex).toBeGreaterThan(createTableIndex);
    });

    test('throws when struct A and struct B reference each other (circular reference)', () => {
        const structAShare = new ColumnShareModel({
            columnShareModelId: 'share-a',
            physicalName: 'a',
            logicalName: 'a',
            columnType: findColumnType('bigquery', 'struct'),
            columnStructId: 'struct-a'
        });
        const structAColumn = new ColumnModel({
            columnModelId: 'col-a',
            columnShareModelId: structAShare.columnShareModelId,
            physicalName: 'a'
        });

        // struct-a のメンバーは struct-b を参照する
        const bMemberShare = new ColumnShareModel({
            columnShareModelId: 'share-member-b',
            physicalName: 'b',
            logicalName: 'b',
            columnType: findColumnType('bigquery', 'struct'),
            columnStructId: 'struct-b'
        });
        const bMember = new ColumnModel({
            columnModelId: 'col-member-b',
            columnShareModelId: bMemberShare.columnShareModelId,
            physicalName: 'b'
        });

        // struct-b のメンバーは struct-a を参照する (循環)
        const aMemberShare = new ColumnShareModel({
            columnShareModelId: 'share-member-a',
            physicalName: 'a',
            logicalName: 'a',
            columnType: findColumnType('bigquery', 'struct'),
            columnStructId: 'struct-a'
        });
        const aMember = new ColumnModel({
            columnModelId: 'col-member-a',
            columnShareModelId: aMemberShare.columnShareModelId,
            physicalName: 'a'
        });

        const structAModel = new ColumnStructModel({
            columnStructId: 'struct-a',
            structName: 'StructA',
            columnModelIds: [bMember.columnModelId]
        });
        const structBModel = new ColumnStructModel({
            columnStructId: 'struct-b',
            structName: 'StructB',
            columnModelIds: [aMember.columnModelId]
        });

        const erdDocument = buildStructDocument({
            columnStructModels: [structAModel, structBModel],
            columnModels: [structAColumn, bMember, aMember],
            columnShareModels: [structAShare, bMemberShare, aMemberShare],
            tableColumnModelIds: [structAColumn.columnModelId]
        });

        expect(() => createDdl(erdDocument, DDL_OPTION)).toThrow(/Circular STRUCT reference/);
    });

    test('does not change existing non-struct BigQuery column output (regression)', () => {
        const idColumnShare = new ColumnShareModel({
            columnShareModelId: 'share-id',
            physicalName: 'id',
            logicalName: 'ID',
            columnType: findColumnType('bigquery', 'int64')
        });
        const idColumn = new ColumnModel({
            columnModelId: 'col-id',
            columnShareModelId: idColumnShare.columnShareModelId,
            physicalName: 'id',
            primaryKey: true,
            notNull: true
        });
        const tagsColumnShare = new ColumnShareModel({
            columnShareModelId: 'share-tags',
            physicalName: 'tags',
            logicalName: 'Tags',
            columnType: findColumnType('bigquery', 'int64'),
            isArray: true
        });
        const tagsColumn = new ColumnModel({
            columnModelId: 'col-tags',
            columnShareModelId: tagsColumnShare.columnShareModelId,
            physicalName: 'tags'
        });

        const erdDocument = buildStructDocument({
            columnModels: [idColumn, tagsColumn],
            columnShareModels: [idColumnShare, tagsColumnShare],
            tableColumnModelIds: [idColumn.columnModelId, tagsColumn.columnModelId]
        });

        const ddl = createDdl(erdDocument, DDL_OPTION);

        expect(ddl).toContain('id INT64 NOT NULL');
        expect(ddl).toContain('tags ARRAY<INT64>');
    });

    test('does not change existing Postgres isArray column output (regression)', () => {
        const tagsColumnShare = new ColumnShareModel({
            columnShareModelId: 'share-tags',
            physicalName: 'tags',
            logicalName: 'tags',
            columnType: findColumnType('postgres', 'integer'),
            isArray: true
        });
        const tagsColumn = new ColumnModel({
            columnModelId: 'col-tags',
            columnShareModelId: tagsColumnShare.columnShareModelId,
            physicalName: 'tags'
        });

        const tableModel = new TableModel({
            tableModelId: 'table-postgres-array',
            physicalName: 'sample_table',
            columns: [
                { modelType: 'single', columnModelId: tagsColumn.columnModelId }
            ] as ColumnModelType[]
        });

        const tableViewModel = new TableViewModel({
            tableModel,
            corner: { top: 0, left: 0 },
            headerColor: TEST_COLORS
        });

        const erdDocument = ErdDocument.create({
            documentName: 'postgres-array',
            erdSettingModel: ErdSettingModel.create('postgres-array'),
            databaseSettingModel: DatabaseSettingModel.create('postgres'),
            schemaConfig: DbSchemaConfig.create(),
            tableViewModels: [tableViewModel],
            columnModels: [tagsColumn],
            columnShareModels: [tagsColumnShare]
        });

        const ddl = createDdl(erdDocument, DDL_OPTION);

        expect(ddl).toContain('tags INTEGER[]');
    });
});
