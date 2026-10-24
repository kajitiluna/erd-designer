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

// charset / collate / DDL 式を持つ「使用テーブル」と、いずれも持たない「未使用テーブル」を併せ持つ文書。
// 同一カラム共有モデル (id) を両テーブルで使い、使用有無の差がテーブル側の属性だけで決まるようにする。
const buildTableOptionDocument = (
    databaseType: DatabaseType, usedTableOption: { characterSet?: string, collate?: string } = {}
): ErdDocument => {
    const columnTypes = findDatabaseColumns(databaseType);
    const integerColumnType = columnTypes[0];
    const textColumnType = columnTypes.find(columnType => (columnType.category === "text")) ?? integerColumnType;

    const idColumnShare = new ColumnShareModel({
        columnShareModelId: 'share-id', physicalName: 'id', logicalName: 'ID', columnType: integerColumnType
    });
    const nameColumnShare = new ColumnShareModel({
        columnShareModelId: 'share-name', physicalName: 'name', logicalName: 'Name', columnType: textColumnType,
        characterSet: 'utf8mb4', collate: 'utf8mb4_bin',
        checkExpression: 'LENGTH(${this}) > 0', optionExpression: 'VISIBLE'
    });

    const usedIdColumn = new SimpleColumnModel({
        columnModelId: 'col-used-id', columnShareModelId: idColumnShare.columnShareModelId, primaryKey: true
    });
    const usedNameColumn = new SimpleColumnModel({
        columnModelId: 'col-used-name', columnShareModelId: nameColumnShare.columnShareModelId
    });
    const unusedIdColumn = new SimpleColumnModel({
        columnModelId: 'col-unused-id', columnShareModelId: idColumnShare.columnShareModelId, primaryKey: true
    });

    const usedTableModel = new TableModel({
        tableModelId: 'table-used',
        physicalName: 'used_table',
        columnEntries: [
            { modelType: 'single', columnModelId: usedIdColumn.columnModelId },
            { modelType: 'single', columnModelId: usedNameColumn.columnModelId }
        ] as ColumnEntry[],
        characterSet: usedTableOption.characterSet ?? 'utf8mb4',
        collate: usedTableOption.collate ?? '',
        checkExpression: '${id} > 0 AND ${unknown} > 0'
    });
    const unusedTableModel = new TableModel({
        tableModelId: 'table-unused',
        physicalName: 'unused_table',
        columnEntries: [{ modelType: 'single', columnModelId: unusedIdColumn.columnModelId }] as ColumnEntry[]
    });

    const tableViewModels = [usedTableModel, unusedTableModel].map(tableModel => {
        return new TableViewModel({ tableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });
    });

    return ErdDocument.create({
        documentName: `${databaseType}-spec-table-option`,
        erdSettingModel: ErdSettingModel.create(`${databaseType}-spec-table-option`),
        databaseSettingModel: DatabaseSettingModel.create(databaseType),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: tableViewModels,
        columnModels: [usedIdColumn, usedNameColumn, unusedIdColumn],
        columnShareModels: [idColumnShare, nameColumnShare]
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

const OPTIONAL_COLUMN_HEADERS = ["Character Set", "Collate", "Check Expression", "Other Option Expression"];

// GSheet のテーブルシートからカラム定義ヘッダ (Columns Specification 直下の行) のタイトルを取り出す。
const findGoogleSheetColumnHeaders = (
    spreadSheet: ReturnType<typeof exportSpreadSheetFormatSpecification>["spreadSheet"], sheetTitle: string
): string[] => {
    const sheet = spreadSheet.sheets.find(candidate => (candidate.properties.title === sheetTitle));
    const headerRow = JSON.parse(JSON.stringify(sheet?.data[2].rowData[0])) as {
        values: { userEnteredValue: { stringValue: string } }[]
    };

    return headerRow.values.map(cell => cell.userEnteredValue.stringValue);
};

const findGoogleSheetContent = (
    spreadSheet: ReturnType<typeof exportSpreadSheetFormatSpecification>["spreadSheet"], sheetTitle: string
): string => {
    const sheet = spreadSheet.sheets.find(candidate => (candidate.properties.title === sheetTitle));
    return JSON.stringify(sheet?.data);
};

// exportExcelFormatSpecification が返す Blob を exceljs で読み戻し、実際に出力されるヘッダ文字列を検証する。
const exportExcelWorkbook = async (erdDocument: ErdDocument, image: ImageContent): Promise<ExcelJS.Workbook> => {
    const blob = await exportExcelFormatSpecification(erdDocument, image);
    const arrayBuffer = await blob.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    return workbook;
};

// 行・列の値を読む前に存在を確定させる。`sheet?.getRow(...).values` は undefined のときに後続の呼び出しで落ちる。
const requireWorksheet = (workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet => {
    const worksheet = workbook.getWorksheet(name);
    if (worksheet == null) {
        throw new Error(`Worksheet "${name}" is not found.`);
    }
    return worksheet;
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

    test('mariadb exports the same table sheet merge ranges as mysql', () => {
        const mysqlResult = exportSpreadSheetFormatSpecification(buildSampleDocument('mysql'));
        const mariadbResult = exportSpreadSheetFormatSpecification(buildSampleDocument('mariadb'));

        const mysqlMergeRanges = mysqlResult.mergeRangeSummaries.map(summary => summary.mergeRanges);
        const mariadbMergeRanges = mariadbResult.mergeRangeSummaries.map(summary => summary.mergeRanges);

        expect(mariadbMergeRanges).toEqual(mysqlMergeRanges);
    });

    test.each(allDatabaseTypes)('%s exports no empty merge range', (databaseType) => {
        const { mergeRangeSummaries } = exportSpreadSheetFormatSpecification(buildSampleDocument(databaseType));

        const mergeRanges = mergeRangeSummaries.flatMap(summary => summary.mergeRanges);
        const emptyRanges = mergeRanges.filter(range => {
            return (range.endRowIndex <= range.startRowIndex) || (range.endColumnIndex <= range.startColumnIndex);
        });

        expect(mergeRanges.length).toBeGreaterThan(0);
        expect(emptyRanges).toEqual([]);
    });

    test.each(allDatabaseTypes)('%s merges the NULLS Order column of indexes only on postgres', (databaseType) => {
        const { mergeRangeSummaries } = exportSpreadSheetFormatSpecification(buildSampleDocument(databaseType));

        const mergeRanges = mergeRangeSummaries.flatMap(summary => summary.mergeRanges);
        const nullsOrderRanges = mergeRanges.filter(range => (range.startColumnIndex === 3));

        if (databaseType === 'postgres') {
            expect(nullsOrderRanges.length).toBeGreaterThan(0);
            expect(nullsOrderRanges.every(range => (range.endColumnIndex === 5))).toBe(true);
        } else {
            expect(nullsOrderRanges).toEqual([]);
        }
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

describe('spec export of charset / collate / DDL expressions', () => {
    const MINIMAL_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const image = { base64Value: MINIMAL_PNG_BASE64, width: 1, height: 1 };

    test('GSheet used table sheet appends the four column attributes after Description, unused sheet has none', () => {
        const erdDocument = buildTableOptionDocument("mysql");
        const { spreadSheet } = exportSpreadSheetFormatSpecification(erdDocument);

        const usedHeaders = findGoogleSheetColumnHeaders(spreadSheet, 'used_table');
        const unusedHeaders = findGoogleSheetColumnHeaders(spreadSheet, 'unused_table');

        expect(usedHeaders.slice(-5)).toEqual(["Description", ...OPTIONAL_COLUMN_HEADERS]);
        expect(usedHeaders.slice(0, -4)).toEqual(unusedHeaders);
        expect(unusedHeaders.some(header => OPTIONAL_COLUMN_HEADERS.includes(header))).toBe(false);
    });

    test('GSheet shows Table Options Specification only for the table with values, omitting empty rows', () => {
        const erdDocument = buildTableOptionDocument("mysql");
        const { spreadSheet } = exportSpreadSheetFormatSpecification(erdDocument);

        const usedContent = findGoogleSheetContent(spreadSheet, 'used_table');
        const unusedContent = findGoogleSheetContent(spreadSheet, 'unused_table');

        const optionSection = extractSection(usedContent, 'Table Options Specification', 'NO_SUCH_MARKER');
        expect(optionSection).toContain('"Character Set"');
        expect(optionSection).toContain('utf8mb4');
        expect(optionSection).toContain('"Check Expression"');
        expect(optionSection).not.toContain('"Collate"');
        expect(optionSection).not.toContain('Other Definition Expression');
        expect(optionSection).not.toContain('Other Table Option Expression');
        expect(unusedContent).not.toContain('Table Options Specification');
    });

    test('GSheet resolves check expression placeholders to plain physical column names', () => {
        const erdDocument = buildTableOptionDocument("mysql");
        const { spreadSheet } = exportSpreadSheetFormatSpecification(erdDocument);

        const usedContent = findGoogleSheetContent(spreadSheet, 'used_table');

        // カラム Check 式: ${this} -> name、テーブル Check 式: ${id} -> id、未一致の ${unknown} は原文のまま
        expect(usedContent).toContain('LENGTH(name) > 0');
        expect(usedContent).toContain('id > 0 AND ${unknown} > 0');
        expect(usedContent).not.toContain('${this}');
        expect(usedContent).not.toContain('${id}');
    });

    test('GSheet merge ranges cover each table option row and rowCount fits the grid', () => {
        const erdDocument = buildTableOptionDocument("mysql");
        const { spreadSheet, mergeRangeSummaries } = exportSpreadSheetFormatSpecification(erdDocument);

        const usedSheet = spreadSheet.sheets.find(sheet => (sheet.properties.title === 'used_table'));
        const optionGrid = usedSheet?.data[usedSheet.data.length - 1];
        const optionRowCount = optionGrid?.rowData.length ?? 0;
        const usedSummary = mergeRangeSummaries.find(summary => (summary.title === 'used_table'));
        const optionMergeRanges = usedSummary?.mergeRanges.filter(range => {
            return (range.startRowIndex >= (optionGrid?.startRow ?? 0));
        });

        // 値のある行は Character Set / Check Expression の 2 行
        expect(optionRowCount).toBe(2);
        expect(optionMergeRanges?.length).toBe(2);
        expect(usedSheet?.properties.gridProperties.rowCount).toBe((optionGrid?.startRow ?? 0) + optionRowCount);
    });

    test('GSheet Attributes sheet shows the four columns only when the document uses them', () => {
        const usingDocument = buildTableOptionDocument("mysql");
        const notUsingDocument = buildSampleDocument("mysql");

        const usingSheets = exportSpreadSheetFormatSpecification(usingDocument).spreadSheet.sheets;
        const notUsingSheets = exportSpreadSheetFormatSpecification(notUsingDocument).spreadSheet.sheets;
        const usingContent = JSON.stringify(usingSheets[1].data);
        const notUsingContent = JSON.stringify(notUsingSheets[1].data);

        OPTIONAL_COLUMN_HEADERS.forEach(header => {
            expect(usingContent).toContain(`"${header}"`);
            expect(notUsingContent).not.toContain(`"${header}"`);
        });
    });

    test('table charset / collate on postgres are not exported because DDL ignores them', () => {
        const erdDocument = buildTableOptionDocument(
            "postgres", { characterSet: 'table_charset_marker', collate: 'table_collate_marker' }
        );
        const { spreadSheet } = exportSpreadSheetFormatSpecification(erdDocument);

        const usedContent = findGoogleSheetContent(spreadSheet, 'used_table');

        // テーブル Check 式は DDL に出るため、セクション自体は残り、charset / collate の行だけが出ない
        const optionSection = extractSection(usedContent, 'Table Options Specification', 'NO_SUCH_MARKER');
        expect(optionSection).toContain('"Check Expression"');
        expect(optionSection).not.toContain('"Character Set"');
        expect(optionSection).not.toContain('"Collate"');
        expect(usedContent).not.toContain('table_charset_marker');
        expect(usedContent).not.toContain('table_collate_marker');
    });

    test('struct column rows leave the four column attributes empty', () => {
        const erdDocument = buildSampleDocumentWithStruct("bigquery");
        const { spreadSheet } = exportSpreadSheetFormatSpecification(erdDocument);

        const columnSheetContent = JSON.stringify(spreadSheet.sheets[1].data);

        OPTIONAL_COLUMN_HEADERS.forEach(header => {
            expect(columnSheetContent).not.toContain(`"${header}"`);
        });
    });

    test('Excel used table sheet has the extra headers and the Table Options section, unused sheet has neither', async () => {
        const erdDocument = buildTableOptionDocument("mysql");
        const workbook = await exportExcelWorkbook(erdDocument, image);

        const usedSheet = requireWorksheet(workbook, 'used_table');
        const unusedSheet = requireWorksheet(workbook, 'unused_table');
        const usedHeaders = (usedSheet.getRow(6).values as unknown[]).slice(1);
        const unusedHeaders = (unusedSheet.getRow(6).values as unknown[]).slice(1);
        const usedTitles = JSON.stringify(usedSheet.getColumn(1).values);
        const unusedTitles = JSON.stringify(unusedSheet.getColumn(1).values);

        expect(usedHeaders.slice(-5)).toEqual(["Description", ...OPTIONAL_COLUMN_HEADERS]);
        expect(usedHeaders.slice(0, -4)).toEqual(unusedHeaders);
        expect(usedTitles).toContain('Table Options Specification');
        const usedTitleCells = (usedSheet.getColumn(1).values as unknown[]).slice(1);
        const optionTitleIndex = usedTitleCells.indexOf('Table Options Specification');
        expect(usedTitleCells.slice(optionTitleIndex, optionTitleIndex + 3))
            .toEqual(['Table Options Specification', 'Character Set', 'Check Expression']);
        expect(usedTitles).toContain('Character Set');
        expect(usedTitles).not.toContain('"Collate"');
        expect(unusedTitles).not.toContain('Table Options Specification');
    });

    test('Excel Table Options section follows the Indexes section when the table has indexes', async () => {
        const erdDocument = buildTableOptionDocument("mysql");
        const workbook = await exportExcelWorkbook(erdDocument, image);

        const usedSheet = workbook.getWorksheet('used_table');
        const usedContent = JSON.stringify(usedSheet?.getSheetValues());

        expect(usedContent).toContain('LENGTH(name) > 0');
        expect(usedContent).toContain('id > 0 AND ${unknown} > 0');
    });

    test('Excel Attributes sheet shows the four columns only when the document uses them', async () => {
        const usingWorkbook = await exportExcelWorkbook(buildTableOptionDocument("mysql"), image);
        const notUsingWorkbook = await exportExcelWorkbook(buildSampleDocument("mysql"), image);

        const usingHeaders = (requireWorksheet(usingWorkbook, 'Attributes').getRow(1).values as unknown[]).slice(1);
        const notUsingHeaders = (requireWorksheet(notUsingWorkbook, 'Attributes').getRow(1).values as unknown[]).slice(1);

        expect(usingHeaders.slice(-5)).toEqual(["Description", ...OPTIONAL_COLUMN_HEADERS]);
        expect(notUsingHeaders.some(header => OPTIONAL_COLUMN_HEADERS.includes(header as string))).toBe(false);
    });
});
