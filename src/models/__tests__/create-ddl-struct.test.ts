import { describe, test, expect } from 'vitest';

import { createDdl } from '~/models/create-ddl';
import ColorValue from '~/models/ColorValue';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';
import ColumnGroupModel from '~/models/database/ColumnGroupModel';
import ColumnModel from '~/models/database/ColumnModel';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import ColumnStructModel from '~/models/database/ColumnStructModel';
import { findDatabaseColumns } from '~/models/database/columns';
import { DatabaseType } from '~/models/database/DatabaseType';
import TableModel, { ColumnEntry } from '~/models/database/TableModel';
import TableUniqueKeysModel, { UniqueKeysColumnModel } from '~/models/database/TableUniqueKeysModel';
import TableViewModel from '~/models/TableViewModel';

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

const initTableViewModel = (tableModel: TableModel): TableViewModel => {
    return new TableViewModel({ tableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });
};

type BuildDocumentArgs = {
    databaseType?: DatabaseType,
    tableModel: TableModel,
    columnGroupModels?: ColumnGroupModel[],
    columnStructModels?: ColumnStructModel[],
    columnModels?: ColumnModel[],
    columnShareModels?: ColumnShareModel[]
};

const buildDocument = (args: BuildDocumentArgs): ErdDocument => {
    return ErdDocument.create({
        documentName: 'create-ddl-struct',
        erdSettingModel: ErdSettingModel.create('create-ddl-struct'),
        databaseSettingModel: DatabaseSettingModel.create(args.databaseType ?? 'bigquery'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [initTableViewModel(args.tableModel)],
        columnGroupModels: args.columnGroupModels ?? [],
        columnStructModels: args.columnStructModels ?? [],
        columnModels: args.columnModels ?? [],
        columnShareModels: args.columnShareModels ?? []
    });
};

const buildDdl = (erdDocument: ErdDocument, withComment: boolean = false): string => {
    return createDdl(erdDocument, {
        withTable: true,
        withIndex: false,
        withForeignKey: false,
        withSchema: false,
        withComment,
        commentStyle: "with_description",
        commentSeparator: " : "
    });
};

describe('create-ddl STRUCT column support', () => {
    test('renders a single STRUCT column with escaped field names', () => {
        const streetShare = new ColumnShareModel({
            columnShareModelId: 'share-street', physicalName: 'street', logicalName: 'Street',
            columnType: findColumnType('bigquery', 'string')
        });
        const zipShare = new ColumnShareModel({
            columnShareModelId: 'share-zip', physicalName: 'zip', logicalName: 'Zip',
            columnType: findColumnType('bigquery', 'int64')
        });
        const streetColumn = new ColumnModel({
            columnModelId: 'col-street', columnShareModelId: 'share-street', physicalName: 'street'
        });
        const zipColumn = new ColumnModel({
            columnModelId: 'col-zip', columnShareModelId: 'share-zip', physicalName: 'zip'
        });

        const structModel = new ColumnStructModel({
            columnStructId: 'struct-address', physicalName: 'address',
            columnEntries: [
                { modelType: 'single', columnModelId: 'col-street' },
                { modelType: 'single', columnModelId: 'col-zip' }
            ] as ColumnEntry[]
        });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'users',
            columnEntries: [{ modelType: 'struct', columnStructId: 'struct-address' }] as ColumnEntry[]
        });

        const erdDocument = buildDocument({
            tableModel,
            columnStructModels: [structModel],
            columnModels: [streetColumn, zipColumn],
            columnShareModels: [streetShare, zipShare]
        });

        const ddl = buildDdl(erdDocument);

        expect(ddl).toBe(
            "/* create tables. */\n"
            + "CREATE TABLE users (\n"
            + "    address STRUCT<street STRING, zip INT64>\n"
            + ");\n"
            + "\n"
        );
    });

    test('wraps the STRUCT type with ARRAY when isArray is true', () => {
        const streetShare = new ColumnShareModel({
            columnShareModelId: 'share-street', physicalName: 'street', logicalName: 'Street',
            columnType: findColumnType('bigquery', 'string')
        });
        const streetColumn = new ColumnModel({
            columnModelId: 'col-street', columnShareModelId: 'share-street', physicalName: 'street'
        });

        const structModel = new ColumnStructModel({
            columnStructId: 'struct-address', physicalName: 'address', isArray: true,
            columnEntries: [{ modelType: 'single', columnModelId: 'col-street' }] as ColumnEntry[]
        });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'users',
            columnEntries: [{ modelType: 'struct', columnStructId: 'struct-address' }] as ColumnEntry[]
        });

        const erdDocument = buildDocument({
            tableModel, columnStructModels: [structModel],
            columnModels: [streetColumn], columnShareModels: [streetShare]
        });

        const ddl = buildDdl(erdDocument);

        expect(ddl).toContain('address ARRAY<STRUCT<street STRING>>');
    });

    test('appends NOT NULL to the column when the struct is notNull', () => {
        const streetShare = new ColumnShareModel({
            columnShareModelId: 'share-street', physicalName: 'street', logicalName: 'Street',
            columnType: findColumnType('bigquery', 'string')
        });
        const streetColumn = new ColumnModel({
            columnModelId: 'col-street', columnShareModelId: 'share-street', physicalName: 'street'
        });

        const structModel = new ColumnStructModel({
            columnStructId: 'struct-address', physicalName: 'address', notNull: true,
            columnEntries: [{ modelType: 'single', columnModelId: 'col-street' }] as ColumnEntry[]
        });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'users',
            columnEntries: [{ modelType: 'struct', columnStructId: 'struct-address' }] as ColumnEntry[]
        });

        const erdDocument = buildDocument({
            tableModel, columnStructModels: [structModel],
            columnModels: [streetColumn], columnShareModels: [streetShare]
        });

        const ddl = buildDdl(erdDocument);

        expect(ddl).toContain('address STRUCT<street STRING> NOT NULL');
    });

    test('renders OPTIONS(description=...) for the struct column when a description is set', () => {
        const streetShare = new ColumnShareModel({
            columnShareModelId: 'share-street', physicalName: 'street', logicalName: 'Street',
            columnType: findColumnType('bigquery', 'string')
        });
        const streetColumn = new ColumnModel({
            columnModelId: 'col-street', columnShareModelId: 'share-street', physicalName: 'street'
        });

        const structModel = new ColumnStructModel({
            columnStructId: 'struct-address', physicalName: 'address', logicalName: 'Address',
            description: 'user postal address',
            columnEntries: [{ modelType: 'single', columnModelId: 'col-street' }] as ColumnEntry[]
        });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'users',
            columnEntries: [{ modelType: 'struct', columnStructId: 'struct-address' }] as ColumnEntry[]
        });

        const erdDocument = buildDocument({
            tableModel, columnStructModels: [structModel],
            columnModels: [streetColumn], columnShareModels: [streetShare]
        });

        const ddl = buildDdl(erdDocument, true);

        expect(ddl).toContain('OPTIONS(description="Address : user postal address")');
    });

    test('inlines group member columns as struct fields in group order', () => {
        const streetShare = new ColumnShareModel({
            columnShareModelId: 'share-street', physicalName: 'street', logicalName: 'Street',
            columnType: findColumnType('bigquery', 'string')
        });
        const cityShare = new ColumnShareModel({
            columnShareModelId: 'share-city', physicalName: 'city', logicalName: 'City',
            columnType: findColumnType('bigquery', 'string')
        });
        const streetColumn = new ColumnModel({
            columnModelId: 'col-street', columnShareModelId: 'share-street', physicalName: 'street'
        });
        const cityColumn = new ColumnModel({
            columnModelId: 'col-city', columnShareModelId: 'share-city', physicalName: 'city'
        });

        const groupModel = new ColumnGroupModel({
            columnGroupId: 'group-geo', groupName: 'geo', columnModelIds: ['col-street', 'col-city']
        });

        const structModel = new ColumnStructModel({
            columnStructId: 'struct-address', physicalName: 'address',
            columnEntries: [{ modelType: 'group', columnGroupId: 'group-geo' }] as ColumnEntry[]
        });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'users',
            columnEntries: [{ modelType: 'struct', columnStructId: 'struct-address' }] as ColumnEntry[]
        });

        const erdDocument = buildDocument({
            tableModel,
            columnGroupModels: [groupModel],
            columnStructModels: [structModel],
            columnModels: [streetColumn, cityColumn],
            columnShareModels: [streetShare, cityShare]
        });

        const ddl = buildDdl(erdDocument);

        expect(ddl).toContain('address STRUCT<street STRING, city STRING>');
    });

    test('resolves a nested struct field, reflecting its own isArray', () => {
        const zipShare = new ColumnShareModel({
            columnShareModelId: 'share-zip', physicalName: 'zip', logicalName: 'Zip',
            columnType: findColumnType('bigquery', 'int64')
        });
        const zipColumn = new ColumnModel({
            columnModelId: 'col-zip', columnShareModelId: 'share-zip', physicalName: 'zip'
        });

        const innerStruct = new ColumnStructModel({
            columnStructId: 'struct-geo', physicalName: 'geo', isArray: true, notNull: true,
            columnEntries: [{ modelType: 'single', columnModelId: 'col-zip' }] as ColumnEntry[]
        });
        const outerStruct = new ColumnStructModel({
            columnStructId: 'struct-address', physicalName: 'address',
            columnEntries: [{ modelType: 'struct', columnStructId: 'struct-geo' }] as ColumnEntry[]
        });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'users',
            columnEntries: [{ modelType: 'struct', columnStructId: 'struct-address' }] as ColumnEntry[]
        });

        const erdDocument = buildDocument({
            tableModel,
            columnStructModels: [innerStruct, outerStruct],
            columnModels: [zipColumn],
            columnShareModels: [zipShare]
        });

        const ddl = buildDdl(erdDocument);

        expect(ddl).toContain('address STRUCT<geo ARRAY<STRUCT<zip INT64>>>');
    });

    test('ignore on circular struct references (A -> B -> A)', () => {
        const structA = new ColumnStructModel({
            columnStructId: 'struct-a', physicalName: 'struct_a',
            columnEntries: [{ modelType: 'struct', columnStructId: 'struct-b' }] as ColumnEntry[]
        });
        const structB = new ColumnStructModel({
            columnStructId: 'struct-b', physicalName: 'struct_b',
            columnEntries: [{ modelType: 'struct', columnStructId: 'struct-a' }] as ColumnEntry[]
        });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'users',
            columnEntries: [{ modelType: 'struct', columnStructId: 'struct-a' }] as ColumnEntry[]
        });

        const erdDocument = buildDocument({
            tableModel, columnStructModels: [structA, structB]
        });

        expect(() => buildDdl(erdDocument));
    });

    test('keeps PK / UNIQUE output for other columns unchanged when the table also has a struct entry', () => {
        const idShare = new ColumnShareModel({
            columnShareModelId: 'share-id', physicalName: 'id', logicalName: 'Id',
            columnType: findColumnType('bigquery', 'int64')
        });
        const codeShare = new ColumnShareModel({
            columnShareModelId: 'share-code', physicalName: 'code', logicalName: 'Code',
            columnType: findColumnType('bigquery', 'string')
        });
        const streetShare = new ColumnShareModel({
            columnShareModelId: 'share-street', physicalName: 'street', logicalName: 'Street',
            columnType: findColumnType('bigquery', 'string')
        });

        const idColumn = new ColumnModel({
            columnModelId: 'col-id', columnShareModelId: 'share-id', physicalName: 'id',
            primaryKey: true, notNull: true
        });
        const codeColumn = new ColumnModel({
            columnModelId: 'col-code', columnShareModelId: 'share-code', physicalName: 'code'
        });
        const streetColumn = new ColumnModel({
            columnModelId: 'col-street', columnShareModelId: 'share-street', physicalName: 'street'
        });

        const structModel = new ColumnStructModel({
            columnStructId: 'struct-address', physicalName: 'address',
            columnEntries: [{ modelType: 'single', columnModelId: 'col-street' }] as ColumnEntry[]
        });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'users',
            columnEntries: [
                { modelType: 'single', columnModelId: 'col-id' },
                { modelType: 'struct', columnStructId: 'struct-address' },
                { modelType: 'single', columnModelId: 'col-code' }
            ] as ColumnEntry[],
            uniqueKeysModels: [
                new TableUniqueKeysModel({
                    tableUniqueKeysModelId: 'unique-code',
                    uniqueKeysColumnModels: [
                        new UniqueKeysColumnModel({ columnModelId: 'col-code', sortOrderType: "" })
                    ]
                })
            ]
        });

        const erdDocument = buildDocument({
            tableModel, columnStructModels: [structModel],
            columnModels: [idColumn, codeColumn, streetColumn],
            columnShareModels: [idShare, codeShare, streetShare]
        });

        const ddl = buildDdl(erdDocument);

        expect(ddl).toBe(
            "/* create tables. */\n"
            + "CREATE TABLE users (\n"
            + "    id INT64 NOT NULL,\n"
            + "    address STRUCT<street STRING>,\n"
            + "    code STRING,\n"
            + "    PRIMARY KEY (id) NOT ENFORCED\n"
            + ");\n"
            + "\n"
        );
    });
});
