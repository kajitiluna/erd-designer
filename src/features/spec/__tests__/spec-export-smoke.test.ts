// @vitest-environment node
//
// Excel エクスポート結果 (Blob) を exceljs で読み戻して検証するテストを含む。デフォルトの jsdom 環境では
// ArrayBuffer/Blob が別 realm になり、jszip の instanceof 判定 (getTypeOf) が正しい型を認識できないため、
// このファイル全体を node 環境に切り替える。DOM 操作はこのファイルでは行っていない。
import ExcelJS from 'exceljs';
import { describe, test, expect } from 'vitest';

import { ImageContent } from '~/context/ExportSpecificationContext';
import exportExcelFormatSpecification from '~/features/spec/ExcelFormatSpecification';
import exportSpreadSheetFormatSpecification from '~/features/spec/GoogleSpreadSheetFormatSpecification';
import ColorValue from '~/models/ColorValue';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';
import ColumnEntry from '~/models/database/ColumnEntry';
import SimpleColumnModel from '~/models/database/SimpleColumnModel';
import StructColumnModel from '~/models/database/StructColumnModel';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import StructColumnShareModel from '~/models/database/StructColumnShareModel';
import { findDatabaseColumns } from '~/models/database/columns';
import { DatabaseType } from '~/models/database/DatabaseType';
import TableIndexModel, { IndexColumnModel } from '~/models/database/TableIndexModel';
import TableModel from '~/models/database/TableModel';
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
    const idColumn = new SimpleColumnModel({
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
        columnEntries: [{ modelType: 'single', columnModelId: idColumn.columnModelId }] as ColumnEntry[],
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
    const idColumn = new SimpleColumnModel({
        columnModelId: 'col-id',
        columnShareModelId: idColumnShare.columnShareModelId,
        physicalName: 'id',
        primaryKey: true,
        notNull: true
    });

    const structColumnModel = new StructColumnShareModel({
        structShareModelId: 'struct-id',
        physicalName: 'address',
        logicalName: '住所',
        description: 'struct column for smoke test',
        columnEntries: []
    });
    const structWrapperColumn = new StructColumnModel({
        columnModelId: 'col-struct-wrapper',
        notNull: true,
        structShareModelId: structColumnModel.structShareModelId
    });

    const tableModel = new TableModel({
        tableModelId: 'table-sample-struct',
        physicalName: 'sample_table_struct',
        columnEntries: [
            { modelType: 'single', columnModelId: idColumn.columnModelId },
            { modelType: 'single', columnModelId: structWrapperColumn.columnModelId }
        ] as ColumnEntry[]
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
        columnModels: [idColumn, structWrapperColumn],
        columnShareModels: [idColumnShare],
        structShareModels: [structColumnModel]
    });
};

const allDatabaseTypes: DatabaseType[] =
    ["postgres", "mysql", "mariadb", "ms_sqlserver", "sqlite", "snowflake", "bigquery"];

// content 中の startMarker から endMarker (または末尾) までを取り出す。
// 同じ見出し文字列 ("Sort Order" 等) が複数セクションに現れるため、対象セクションに絞って検証するために使う。
const extractSection = (content: string, startMarker: string, endMarker: string): string => {
    const startIndex = content.indexOf(startMarker);
    const endIndex = content.indexOf(endMarker, startIndex);
    return content.slice(startIndex, (endIndex === -1) ? content.length : endIndex);
};

// 仕様書の自動採番列ヘッダは帳票の列幅に収まる語でなければならず、Identity (MS SQL Server のみ) と
// Increment 以外は使用しない。ColumnEditDialog 用の DB 別ラベルの混入をここで検知する。
const AUTO_INCREMENT_HEADER_CANDIDATES = [
    "Identity", "Increment", "Auto Increment", "Autoincrement", "Generated Always As Identity"
];

// JSON 化した内容は "stringValue":"Identity" のように必ず引用符で囲まれるため、
// "Generated Always As Identity" が "Identity" に誤ヒットすることはない。
const findAutoIncrementHeaders = (headerContent: string): string[] => {
    return AUTO_INCREMENT_HEADER_CANDIDATES.filter(candidate => headerContent.includes(`"${candidate}"`));
};

const autoIncrementHeaderCases: [DatabaseType, string[]][] = [
    ["postgres", ["Increment"]],
    ["mysql", ["Increment"]],
    ["mariadb", ["Increment"]],
    ["ms_sqlserver", ["Identity"]],
    ["snowflake", ["Increment"]],
    ["sqlite", []],
    ["bigquery", []],
];

// exportExcelFormatSpecification が返す Blob を exceljs で読み戻し、実際に出力されるヘッダ文字列を検証する。
const exportExcelWorkbook = async (erdDocument: ErdDocument, image: ImageContent): Promise<ExcelJS.Workbook> => {
    const blob = await exportExcelFormatSpecification(erdDocument, image);
    const arrayBuffer = await blob.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    return workbook;
};

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

    test.each(autoIncrementHeaderCases)(
        'GoogleSpreadSheet column header for %s shows exactly %j as the autoIncrement label', (databaseType, expectedHeaders) => {
            const erdDocument = buildSampleDocument(databaseType);
            const { spreadSheet } = exportSpreadSheetFormatSpecification(erdDocument);

            const columnSheet = spreadSheet.sheets.find(sheet => sheet.properties.title.includes('Column'))
                ?? spreadSheet.sheets[1];
            const headerRow = JSON.stringify(columnSheet.data);

            expect(findAutoIncrementHeaders(headerRow)).toEqual(expectedHeaders);
        }
    );

    test.each(autoIncrementHeaderCases)(
        'Excel column header for %s shows exactly %j as the autoIncrement label', async (databaseType, expectedHeaders) => {
            const erdDocument = buildSampleDocument(databaseType);
            const image = { base64Value: MINIMAL_PNG_BASE64, width: 1, height: 1 };
            const workbook = await exportExcelWorkbook(erdDocument, image);
            const headerRow = JSON.stringify(workbook.getWorksheet('Attributes')?.getRow(1).values);

            expect(findAutoIncrementHeaders(headerRow ?? '')).toEqual(expectedHeaders);
        }
    );

    test('snowflake unique key spec section omits Sort Order (not orderable)', () => {
        const erdDocument = buildSampleDocument("snowflake");
        const { spreadSheet } = exportSpreadSheetFormatSpecification(erdDocument);
        const content = JSON.stringify(spreadSheet.sheets);

        const uniqueKeySection = extractSection(content, 'UniqueKey Columns', 'IndexName');
        expect(uniqueKeySection).toContain('ColumnName (physical)');
        expect(uniqueKeySection).not.toContain('Sort Order');
    });

    test('mysql unique key spec section includes Sort Order (orderable)', () => {
        const erdDocument = buildSampleDocument("mysql");
        const { spreadSheet } = exportSpreadSheetFormatSpecification(erdDocument);
        const content = JSON.stringify(spreadSheet.sheets);

        const uniqueKeySection = extractSection(content, 'UniqueKey Columns', 'IndexName');
        expect(uniqueKeySection).toContain('Sort Order');
    });
});
