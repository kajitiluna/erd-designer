import { describe, test, expect } from 'vitest';

import { createDdl } from '~/models/create-ddl';
import ColorValue from '~/models/ColorValue';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';
import ColumnEntry from '~/models/database/ColumnEntry';
import ColumnGroupModel from '~/models/database/ColumnGroupModel';
import ColumnModel from '~/models/database/ColumnModel';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import SimpleColumnModel from '~/models/database/SimpleColumnModel';
import StructColumnModel from '~/models/database/StructColumnModel';
import StructColumnShareModel from '~/models/database/StructColumnShareModel';
import { findDatabaseColumns } from '~/models/database/columns';
import { DatabaseType } from '~/models/database/DatabaseType';
import TableModel from '~/models/database/TableModel';
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

// struct バリアントのラッパー ColumnModel を生成する。
// テーブル・group・struct 定義からは single エントリ (columnModelId = wrapper id) で参照する。
// physicalName/logicalName を渡すと overrideColumnName により struct 定義側デフォルト名を上書きする。
const initStructWrapper = (args: {
    columnModelId: string, structColumnShareModelId: string,
    physicalName?: string, logicalName?: string, notNull?: boolean
}): StructColumnModel => {
    return new StructColumnModel({
        columnModelId: args.columnModelId,
        structShareModelId: args.structColumnShareModelId,
        physicalName: args.physicalName,
        logicalName: args.logicalName,
        notNull: args.notNull
    });
};

type BuildDocumentArgs = {
    databaseType?: DatabaseType,
    tableModel: TableModel,
    columnGroupModels?: ColumnGroupModel[],
    structColumnShareModels?: StructColumnShareModel[],
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
        structShareModels: args.structColumnShareModels ?? [],
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
        const streetColumn = new SimpleColumnModel({
            columnModelId: 'col-street', columnShareModelId: 'share-street', physicalName: 'street'
        });
        const zipColumn = new SimpleColumnModel({
            columnModelId: 'col-zip', columnShareModelId: 'share-zip', physicalName: 'zip'
        });
        const wrapperColumn = initStructWrapper({
            columnModelId: 'wrapper-address', structColumnShareModelId: 'struct-address'
        });

        const structModel = new StructColumnShareModel({
            structShareModelId: 'struct-address', physicalName: 'address',
            columnEntries: [
                { modelType: 'single', columnModelId: 'col-street' },
                { modelType: 'single', columnModelId: 'col-zip' }
            ] as ColumnEntry[]
        });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'users',
            columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-address' }] as ColumnEntry[]
        });

        const erdDocument = buildDocument({
            tableModel,
            structColumnShareModels: [structModel],
            columnModels: [streetColumn, zipColumn, wrapperColumn],
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
        const streetColumn = new SimpleColumnModel({
            columnModelId: 'col-street', columnShareModelId: 'share-street', physicalName: 'street'
        });
        const wrapperColumn = initStructWrapper({
            columnModelId: 'wrapper-address', structColumnShareModelId: 'struct-address'
        });

        const structModel = new StructColumnShareModel({
            structShareModelId: 'struct-address', physicalName: 'address', isArray: true,
            columnEntries: [{ modelType: 'single', columnModelId: 'col-street' }] as ColumnEntry[]
        });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'users',
            columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-address' }] as ColumnEntry[]
        });

        const erdDocument = buildDocument({
            tableModel, structColumnShareModels: [structModel],
            columnModels: [streetColumn, wrapperColumn], columnShareModels: [streetShare]
        });

        const ddl = buildDdl(erdDocument);

        expect(ddl).toContain('address ARRAY<STRUCT<street STRING>>');
    });

    test('appends NOT NULL when the wrapper column is notNull', () => {
        const streetShare = new ColumnShareModel({
            columnShareModelId: 'share-street', physicalName: 'street', logicalName: 'Street',
            columnType: findColumnType('bigquery', 'string')
        });
        const streetColumn = new SimpleColumnModel({
            columnModelId: 'col-street', columnShareModelId: 'share-street', physicalName: 'street'
        });
        const wrapperColumn = initStructWrapper({
            columnModelId: 'wrapper-address', structColumnShareModelId: 'struct-address', notNull: true
        });

        const structModel = new StructColumnShareModel({
            structShareModelId: 'struct-address', physicalName: 'address',
            columnEntries: [{ modelType: 'single', columnModelId: 'col-street' }] as ColumnEntry[]
        });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'users',
            columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-address' }] as ColumnEntry[]
        });

        const erdDocument = buildDocument({
            tableModel, structColumnShareModels: [structModel],
            columnModels: [streetColumn, wrapperColumn], columnShareModels: [streetShare]
        });

        const ddl = buildDdl(erdDocument);

        expect(ddl).toContain('address STRUCT<street STRING> NOT NULL');
    });

    test('does not append NOT NULL when the wrapper column is nullable even if used in multiple places', () => {
        const streetShare = new ColumnShareModel({
            columnShareModelId: 'share-street', physicalName: 'street', logicalName: 'Street',
            columnType: findColumnType('bigquery', 'string')
        });
        const streetColumn = new SimpleColumnModel({
            columnModelId: 'col-street', columnShareModelId: 'share-street', physicalName: 'street'
        });
        const wrapperColumn = initStructWrapper({
            columnModelId: 'wrapper-address', structColumnShareModelId: 'struct-address', notNull: false
        });

        const structModel = new StructColumnShareModel({
            structShareModelId: 'struct-address', physicalName: 'address',
            columnEntries: [{ modelType: 'single', columnModelId: 'col-street' }] as ColumnEntry[]
        });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'users',
            columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-address' }] as ColumnEntry[]
        });

        const erdDocument = buildDocument({
            tableModel, structColumnShareModels: [structModel],
            columnModels: [streetColumn, wrapperColumn], columnShareModels: [streetShare]
        });

        const ddl = buildDdl(erdDocument);

        expect(ddl).toContain('address STRUCT<street STRING>');
        expect(ddl).not.toContain('NOT NULL');
    });

    test('overrides the struct top-level column name with the wrapper physicalName', () => {
        const streetShare = new ColumnShareModel({
            columnShareModelId: 'share-street', physicalName: 'street', logicalName: 'Street',
            columnType: findColumnType('bigquery', 'string')
        });
        const streetColumn = new SimpleColumnModel({
            columnModelId: 'col-street', columnShareModelId: 'share-street', physicalName: 'street'
        });
        const wrapperColumn = initStructWrapper({
            columnModelId: 'wrapper-address', structColumnShareModelId: 'struct-address',
            physicalName: 'home_address'
        });

        const structModel = new StructColumnShareModel({
            structShareModelId: 'struct-address', physicalName: 'address',
            columnEntries: [{ modelType: 'single', columnModelId: 'col-street' }] as ColumnEntry[]
        });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'users',
            columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-address' }] as ColumnEntry[]
        });

        const erdDocument = buildDocument({
            tableModel, structColumnShareModels: [structModel],
            columnModels: [streetColumn, wrapperColumn], columnShareModels: [streetShare]
        });

        const ddl = buildDdl(erdDocument);

        expect(ddl).toContain('home_address STRUCT<street STRING>');
        // 単純な not.toContain('address STRUCT') では home_address に部分一致するため単語境界で判定する
        expect(ddl).not.toMatch(/\baddress STRUCT/);
    });

    test('overrides a nested struct field name with the nested wrapper physicalName', () => {
        const zipShare = new ColumnShareModel({
            columnShareModelId: 'share-zip', physicalName: 'zip', logicalName: 'Zip',
            columnType: findColumnType('bigquery', 'int64')
        });
        const zipColumn = new SimpleColumnModel({
            columnModelId: 'col-zip', columnShareModelId: 'share-zip', physicalName: 'zip'
        });
        const innerWrapper = initStructWrapper({
            columnModelId: 'wrapper-geo', structColumnShareModelId: 'struct-geo', physicalName: 'geo_point'
        });
        const outerWrapper = initStructWrapper({
            columnModelId: 'wrapper-address', structColumnShareModelId: 'struct-address'
        });

        const innerStruct = new StructColumnShareModel({
            structShareModelId: 'struct-geo', physicalName: 'geo',
            columnEntries: [{ modelType: 'single', columnModelId: 'col-zip' }] as ColumnEntry[]
        });
        const outerStruct = new StructColumnShareModel({
            structShareModelId: 'struct-address', physicalName: 'address',
            columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-geo' }] as ColumnEntry[]
        });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'users',
            columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-address' }] as ColumnEntry[]
        });

        const erdDocument = buildDocument({
            tableModel,
            structColumnShareModels: [innerStruct, outerStruct],
            columnModels: [zipColumn, innerWrapper, outerWrapper],
            columnShareModels: [zipShare]
        });

        const ddl = buildDdl(erdDocument);

        expect(ddl).toContain('address STRUCT<geo_point STRUCT<zip INT64>>');
    });

    test('renders OPTIONS(description=...) using the overridden name for the struct column', () => {
        const streetShare = new ColumnShareModel({
            columnShareModelId: 'share-street', physicalName: 'street', logicalName: 'Street',
            columnType: findColumnType('bigquery', 'string')
        });
        const streetColumn = new SimpleColumnModel({
            columnModelId: 'col-street', columnShareModelId: 'share-street', physicalName: 'street'
        });
        const wrapperColumn = initStructWrapper({
            columnModelId: 'wrapper-address', structColumnShareModelId: 'struct-address',
            physicalName: 'home_address', logicalName: 'Home Address'
        });

        const structModel = new StructColumnShareModel({
            structShareModelId: 'struct-address', physicalName: 'address', logicalName: 'Address',
            description: 'user postal address',
            columnEntries: [{ modelType: 'single', columnModelId: 'col-street' }] as ColumnEntry[]
        });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'users',
            columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-address' }] as ColumnEntry[]
        });

        const erdDocument = buildDocument({
            tableModel, structColumnShareModels: [structModel],
            columnModels: [streetColumn, wrapperColumn], columnShareModels: [streetShare]
        });

        const ddl = buildDdl(erdDocument, true);

        // 先頭のカラム名はオーバーライド後の home_address、OPTIONS は
        // オーバーライド後の logicalName (Home Address) と struct 定義の description で構成される
        expect(ddl).toContain('home_address STRUCT<street STRING>');
        expect(ddl).toContain('OPTIONS(description="Home Address : user postal address")');
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
        const streetColumn = new SimpleColumnModel({
            columnModelId: 'col-street', columnShareModelId: 'share-street', physicalName: 'street'
        });
        const cityColumn = new SimpleColumnModel({
            columnModelId: 'col-city', columnShareModelId: 'share-city', physicalName: 'city'
        });
        const wrapperColumn = initStructWrapper({
            columnModelId: 'wrapper-address', structColumnShareModelId: 'struct-address'
        });

        const groupModel = new ColumnGroupModel({
            columnGroupId: 'group-geo', groupName: 'geo', columnModelIds: ['col-street', 'col-city']
        });

        const structModel = new StructColumnShareModel({
            structShareModelId: 'struct-address', physicalName: 'address',
            columnEntries: [{ modelType: 'group', columnGroupId: 'group-geo' }] as ColumnEntry[]
        });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'users',
            columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-address' }] as ColumnEntry[]
        });

        const erdDocument = buildDocument({
            tableModel,
            columnGroupModels: [groupModel],
            structColumnShareModels: [structModel],
            columnModels: [streetColumn, cityColumn, wrapperColumn],
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
        const zipColumn = new SimpleColumnModel({
            columnModelId: 'col-zip', columnShareModelId: 'share-zip', physicalName: 'zip'
        });
        const innerWrapper = initStructWrapper({
            columnModelId: 'wrapper-geo', structColumnShareModelId: 'struct-geo'
        });
        const outerWrapper = initStructWrapper({
            columnModelId: 'wrapper-address', structColumnShareModelId: 'struct-address'
        });

        const innerStruct = new StructColumnShareModel({
            structShareModelId: 'struct-geo', physicalName: 'geo', isArray: true,
            columnEntries: [{ modelType: 'single', columnModelId: 'col-zip' }] as ColumnEntry[]
        });
        const outerStruct = new StructColumnShareModel({
            structShareModelId: 'struct-address', physicalName: 'address',
            columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-geo' }] as ColumnEntry[]
        });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'users',
            columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-address' }] as ColumnEntry[]
        });

        const erdDocument = buildDocument({
            tableModel,
            structColumnShareModels: [innerStruct, outerStruct],
            columnModels: [zipColumn, innerWrapper, outerWrapper],
            columnShareModels: [zipShare]
        });

        const ddl = buildDdl(erdDocument);

        expect(ddl).toContain('address STRUCT<geo ARRAY<STRUCT<zip INT64>>>');
    });

    test('throws on circular struct references (A -> B -> A)', () => {
        const wrapperA = initStructWrapper({ columnModelId: 'wrapper-a', structColumnShareModelId: 'struct-a' });
        const wrapperNestedB = initStructWrapper({ columnModelId: 'wrapper-nested-b', structColumnShareModelId: 'struct-b' });
        const wrapperNestedA = initStructWrapper({ columnModelId: 'wrapper-nested-a', structColumnShareModelId: 'struct-a' });

        const structA = new StructColumnShareModel({
            structShareModelId: 'struct-a', physicalName: 'struct_a',
            columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-nested-b' }] as ColumnEntry[]
        });
        const structB = new StructColumnShareModel({
            structShareModelId: 'struct-b', physicalName: 'struct_b',
            columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-nested-a' }] as ColumnEntry[]
        });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'users',
            columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-a' }] as ColumnEntry[]
        });

        const erdDocument = buildDocument({
            tableModel, structColumnShareModels: [structA, structB],
            columnModels: [wrapperA, wrapperNestedB, wrapperNestedA]
        });

        expect(() => buildDdl(erdDocument)).toThrow('Struct is recursive definition.');
    });

    test('does not treat sibling reuse of the same struct as circular', () => {
        const zipShare = new ColumnShareModel({
            columnShareModelId: 'share-zip', physicalName: 'zip', logicalName: 'Zip',
            columnType: findColumnType('bigquery', 'int64')
        });
        const zipColumn = new SimpleColumnModel({
            columnModelId: 'col-zip', columnShareModelId: 'share-zip', physicalName: 'zip'
        });
        const sharedWrapperFirst = initStructWrapper({
            columnModelId: 'wrapper-geo-1', structColumnShareModelId: 'struct-geo', physicalName: 'home_geo'
        });
        const sharedWrapperSecond = initStructWrapper({
            columnModelId: 'wrapper-geo-2', structColumnShareModelId: 'struct-geo', physicalName: 'work_geo'
        });
        const outerWrapper = initStructWrapper({
            columnModelId: 'wrapper-address', structColumnShareModelId: 'struct-address'
        });

        const geoStruct = new StructColumnShareModel({
            structShareModelId: 'struct-geo', physicalName: 'geo',
            columnEntries: [{ modelType: 'single', columnModelId: 'col-zip' }] as ColumnEntry[]
        });
        const outerStruct = new StructColumnShareModel({
            structShareModelId: 'struct-address', physicalName: 'address',
            columnEntries: [
                { modelType: 'single', columnModelId: 'wrapper-geo-1' },
                { modelType: 'single', columnModelId: 'wrapper-geo-2' }
            ] as ColumnEntry[]
        });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'users',
            columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-address' }] as ColumnEntry[]
        });

        const erdDocument = buildDocument({
            tableModel,
            structColumnShareModels: [geoStruct, outerStruct],
            columnModels: [zipColumn, sharedWrapperFirst, sharedWrapperSecond, outerWrapper],
            columnShareModels: [zipShare]
        });

        const ddl = buildDdl(erdDocument);

        expect(ddl).toContain('address STRUCT<home_geo STRUCT<zip INT64>, work_geo STRUCT<zip INT64>>');
    });

    test('skips the struct column row when the struct definition is missing', () => {
        const idShare = new ColumnShareModel({
            columnShareModelId: 'share-id', physicalName: 'id', logicalName: 'Id',
            columnType: findColumnType('bigquery', 'int64')
        });
        const idColumn = new SimpleColumnModel({
            columnModelId: 'col-id', columnShareModelId: 'share-id', physicalName: 'id'
        });
        // ラッパーは存在するが、参照先の struct 定義を document に登録しない
        const wrapperColumn = initStructWrapper({
            columnModelId: 'wrapper-address', structColumnShareModelId: 'struct-missing'
        });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'users',
            columnEntries: [
                { modelType: 'single', columnModelId: 'col-id' },
                { modelType: 'single', columnModelId: 'wrapper-address' }
            ] as ColumnEntry[]
        });

        const erdDocument = buildDocument({
            tableModel,
            columnModels: [idColumn, wrapperColumn],
            columnShareModels: [idShare]
        });

        const ddl = buildDdl(erdDocument);

        expect(ddl).toBe(
            "/* create tables. */\n"
            + "CREATE TABLE users (\n"
            + "    id INT64\n"
            + ");\n"
            + "\n"
        );
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

        const idColumn = new SimpleColumnModel({
            columnModelId: 'col-id', columnShareModelId: 'share-id', physicalName: 'id',
            primaryKey: true, notNull: true
        });
        const codeColumn = new SimpleColumnModel({
            columnModelId: 'col-code', columnShareModelId: 'share-code', physicalName: 'code'
        });
        const streetColumn = new SimpleColumnModel({
            columnModelId: 'col-street', columnShareModelId: 'share-street', physicalName: 'street'
        });
        const wrapperColumn = initStructWrapper({
            columnModelId: 'wrapper-address', structColumnShareModelId: 'struct-address'
        });

        const structModel = new StructColumnShareModel({
            structShareModelId: 'struct-address', physicalName: 'address',
            columnEntries: [{ modelType: 'single', columnModelId: 'col-street' }] as ColumnEntry[]
        });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'users',
            columnEntries: [
                { modelType: 'single', columnModelId: 'col-id' },
                { modelType: 'single', columnModelId: 'wrapper-address' },
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
            tableModel, structColumnShareModels: [structModel],
            columnModels: [idColumn, codeColumn, streetColumn, wrapperColumn],
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
