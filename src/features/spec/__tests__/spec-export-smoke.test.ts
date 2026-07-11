import { describe, test, expect } from 'vitest';

import exportExcelFormatSpecification from '~/features/spec/ExcelFormatSpecification';
import exportSpreadSheetFormatSpecification from '~/features/spec/GoogleSpreadSheetFormatSpecification';
import ColorValue from '~/models/ColorValue';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';
import ColumnModel from '~/models/database/ColumnModel';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import ColumnStructModel from '~/models/database/ColumnStructModel';
import { findDatabaseColumns } from '~/models/database/columns';
import { DatabaseType } from '~/models/database/DatabaseType';
import TableIndexModel, { IndexColumnModel } from '~/models/database/TableIndexModel';
import TableModel, { ColumnModelType } from '~/models/database/TableModel';
import TableUniqueKeysModel, { UniqueKeysColumnModel } from '~/models/database/TableUniqueKeysModel';
import TableViewModel from '~/models/TableViewModel';

// 仕様書出力 (Excel/GSheet) は SQLite 追加に伴うコード変更が不要という想定を全DB横断のスモークテストで確認する。
// SQLite は isMySqlCompatible (mysql/mariadb) にも postgres 分岐にも非該当のため、
// Unsigned列・NULLS Order列のどちらも出ないことを GSheet 側のヘッダで確認する。
const TEST_COLORS = {
    background: new ColorValue({ red: 255, green: 255, blue: 255 }),
    foreground: new ColorValue({ red: 0, green: 0, blue: 0 })
};

const buildSampleDocument = (databaseType: DatabaseType): ErdDocument => {
    const integerColumnType = findDatabaseColumns(databaseType)[0];

    const idColumnShare = new ColumnShareModel({
        columnShareModelId: 'share-id',
        physicalName: 'id',
        logicalName: 'ID',
        columnType: integerColumnType
    });
    const idColumn = new ColumnModel({
        columnModelId: 'col-id',
        columnShareModelId: idColumnShare.columnShareModelId,
        physicalName: 'id',
        primaryKey: true,
        notNull: true
    });

    const uniqueKeysModel = new TableUniqueKeysModel({
        tableUniqueKeysModelId: 'uk-id',
        uniqueKeysColumnModels: [
            new UniqueKeysColumnModel({ columnModelId: idColumn.columnModelId, sortOrderType: "" })
        ]
    });
    const tableIndexModel = new TableIndexModel({
        tableIndexModelId: 'idx-id',
        physicalName: 'idx_sample_id',
        indexColumnModels: [new IndexColumnModel({ columnModelId: idColumn.columnModelId })]
    });

    const tableModel = new TableModel({
        tableModelId: 'table-sample',
        physicalName: 'sample_table',
        columns: [{ modelType: 'single', columnModelId: idColumn.columnModelId }] as ColumnModelType[],
        uniqueKeysModels: [uniqueKeysModel],
        tableIndexModels: [tableIndexModel]
    });

    const tableViewModel = new TableViewModel({
        tableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS
    });

    return ErdDocument.create({
        documentName: `${databaseType}-spec-smoke`,
        erdSettingModel: ErdSettingModel.create(`${databaseType}-spec-smoke`),
        databaseSettingModel: DatabaseSettingModel.create(databaseType),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [tableViewModel],
        columnModels: [idColumn],
        columnShareModels: [idColumnShare]
    });
};

const buildSampleDocumentWithStruct = (databaseType: DatabaseType): ErdDocument => {
    const integerColumnType = findDatabaseColumns(databaseType)[0];

    const idColumnShare = new ColumnShareModel({
        columnShareModelId: 'share-id',
        physicalName: 'id',
        logicalName: 'ID',
        columnType: integerColumnType
    });
    const idColumn = new ColumnModel({
        columnModelId: 'col-id',
        columnShareModelId: idColumnShare.columnShareModelId,
        physicalName: 'id',
        primaryKey: true,
        notNull: true
    });

    const structColumnModel = new ColumnStructModel({
        columnStructId: 'struct-id',
        physicalName: 'address',
        logicalName: '住所',
        description: 'struct column for smoke test',
        notNull: true,
        columns: []
    });

    const tableModel = new TableModel({
        tableModelId: 'table-sample-struct',
        physicalName: 'sample_table_struct',
        columns: [
            { modelType: 'single', columnModelId: idColumn.columnModelId },
            { modelType: 'struct', columnStructId: structColumnModel.columnStructId }
        ] as ColumnModelType[]
    });

    const tableViewModel = new TableViewModel({
        tableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS
    });

    return ErdDocument.create({
        documentName: `${databaseType}-spec-smoke-struct`,
        erdSettingModel: ErdSettingModel.create(`${databaseType}-spec-smoke-struct`),
        databaseSettingModel: DatabaseSettingModel.create(databaseType),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [tableViewModel],
        columnModels: [idColumn],
        columnShareModels: [idColumnShare],
        columnStructModels: [structColumnModel]
    });
};

const allDatabaseTypes: DatabaseType[] =
    ["postgres", "mysql", "mariadb", "ms_sqlserver", "sqlite", "snowflake", "bigquery"];

describe('spec export smoke test (all database types)', () => {
    test.each(allDatabaseTypes)('GoogleSpreadSheet export does not throw for %s', (databaseType) => {
        const erdDocument = buildSampleDocument(databaseType);
        expect(() => exportSpreadSheetFormatSpecification(erdDocument)).not.toThrow();
    });

    // ExcelJS の addMedia は有効な画像データを要求するため、1x1 の透明PNGを使う (base64Valueは空文字だと失敗する)。
    const MINIMAL_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

    test.each(allDatabaseTypes)('Excel export does not throw for %s', async (databaseType) => {
        const erdDocument = buildSampleDocument(databaseType);
        const image = { base64Value: MINIMAL_PNG_BASE64, width: 1, height: 1 };
        await expect(exportExcelFormatSpecification(erdDocument, image)).resolves.toBeDefined();
    });

    test('sqlite column header has neither Unsigned nor NULLS Order columns', () => {
        const erdDocument = buildSampleDocument("sqlite");
        const { spreadSheet } = exportSpreadSheetFormatSpecification(erdDocument);

        const columnSheet = spreadSheet.sheets.find(sheet => sheet.properties.title.includes('Column'))
            ?? spreadSheet.sheets[1];
        const headerRow = JSON.stringify(columnSheet.data);

        expect(headerRow).not.toContain('Unsigned');
        expect(headerRow).not.toContain('NULLS Order');
    });

    test('snowflake column header has neither Unsigned nor NULLS Order columns', () => {
        const erdDocument = buildSampleDocument("snowflake");
        const { spreadSheet } = exportSpreadSheetFormatSpecification(erdDocument);

        const columnSheet = spreadSheet.sheets.find(sheet => sheet.properties.title.includes('Column'))
            ?? spreadSheet.sheets[1];
        const headerRow = JSON.stringify(columnSheet.data);

        expect(headerRow).not.toContain('Unsigned');
        expect(headerRow).not.toContain('NULLS Order');
    });

    test('bigquery column header has neither Unsigned nor NULLS Order columns', () => {
        const erdDocument = buildSampleDocument("bigquery");
        const { spreadSheet } = exportSpreadSheetFormatSpecification(erdDocument);

        const columnSheet = spreadSheet.sheets.find(sheet => sheet.properties.title.includes('Column'))
            ?? spreadSheet.sheets[1];
        const headerRow = JSON.stringify(columnSheet.data);

        expect(headerRow).not.toContain('Unsigned');
        expect(headerRow).not.toContain('NULLS Order');
    });

    test('bigquery column sheet includes struct entry with STRUCT type and description', () => {
        const erdDocument = buildSampleDocumentWithStruct("bigquery");
        const { spreadSheet } = exportSpreadSheetFormatSpecification(erdDocument);

        const columnSheet = spreadSheet.sheets.find(sheet => sheet.properties.title.includes('Column'))
            ?? spreadSheet.sheets[1];
        const columnSheetContent = JSON.stringify(columnSheet.data);

        expect(columnSheetContent).toContain('address');
        expect(columnSheetContent).toContain('STRUCT');
        expect(columnSheetContent).toContain('struct column for smoke test');
    });

    test('bigquery struct entry with notNull shows NotNull mark in column sheet', async () => {
        const erdDocument = buildSampleDocumentWithStruct("bigquery");
        const image = { base64Value: MINIMAL_PNG_BASE64, width: 1, height: 1 };

        await expect(exportExcelFormatSpecification(erdDocument, image)).resolves.toBeDefined();
    });
});
