import createSpecification from "~/features/spec/create-specification";
import {
    autoIncrementLabel, ColumnListSpecGenerator, OptionalColumnAttribute, TableDetailSpec, TableIndexSpec,
    TableListSpecGenerator, TableOptionSpec, UniqueKeyConstraintSpec
} from "~/features/spec/spec-util";
import { Database, DatabaseType } from "~/models/database";
import ErdDocument from "~/models/ErdDocument";

const exportSpreadSheetFormatSpecification = (erdDocument: ErdDocument) => {
    const specs = createSpecification(erdDocument);
    const databaseType = erdDocument.databaseSettingModel.databaseType;

    // テーブル一覧のシート
    const tableSheet = createTableListSheet(specs.exportTables);
    // カラム一覧のシート
    const columnSheet = createColumnListSheet(databaseType, specs.usedColumnAttributes, specs.exportColumns);

    // 各テーブル定義のシート
    const tableSpecSheetsWithMergeRange = Array.from(specs.exportTableSpecs())
        .map(tableSpec => createTableSpecSheet(databaseType, tableSpec));
    const tableSpecSheets = tableSpecSheetsWithMergeRange.map(sheet => {
        return {
            properties: sheet.properties,
            data: sheet.data,
        };
    });
    const mergeRangeSummaries = tableSpecSheetsWithMergeRange.flatMap(sheet => {
        return {
            title: sheet.properties.title,
            mergeRanges: sheet.mergeRanges,
        };
    });

    const spreadSheet = {
        properties: {
            title: erdDocument.documentName
        },
        sheets: [tableSheet, columnSheet, ...tableSpecSheets]
    };

    return { spreadSheet, mergeRangeSummaries };
};

const SHEET_NAME = {
    CONTENT: "Contents of sheet",
    TABLES: "List of tables",
    ATTRIBUTES: "List of attributes",
} as const;

const createTableListSheet = (exportTables: () => TableListSpecGenerator) => {
    const headers = [
        { title: "TableName (physical)", key: "physicalName", width: 180 },
        { title: "TableName (logical)", key: "logicalName", width: 180 },
        { title: "Description", key: "description", width: 500, wrapText: true },
    ];

    return initListSheet({
        title: SHEET_NAME.TABLES,
        headers: headers,
        rows: Array.from(exportTables())
    });
};

const createColumnListSheet = (
    databaseType: DatabaseType, usedColumnAttributes: readonly OptionalColumnAttribute[],
    exportColumns: () => ColumnListSpecGenerator
) => {
    return initListSheet({
        title: SHEET_NAME.ATTRIBUTES,
        headers: initColumnHeader(databaseType, usedColumnAttributes),
        rows: Array.from(exportColumns())
    });
};

const initColumnHeader = (
    databaseType: DatabaseType, usedColumnAttributes: readonly OptionalColumnAttribute[],
    withTableInfo: boolean = true
): GridHeaderInfo[] => {
    const header0 = withTableInfo ? [
        { title: "TableName (physical)", key: "physicalTableName", width: 180 },
        { title: "TableName (logical)", key: "logicalTableName", width: 180 }
    ] : []

    const header1 = [
        { title: "ColumnName (physical)", key: "physicalColumnName", width: 180 },
        { title: "ColumnName (logical)", key: "logicalColumnName", width: 180 },
        { title: "Type", key: "columnType", width: 105 },
        { title: "Precision", key: "precision", type: "number", width: 50 },
        { title: "Scale", key: "scale", type: "number", width: 50 }
    ];

    const isMySqlCompatible = (databaseType === "mysql") || (databaseType === "mariadb");

    const header2 = isMySqlCompatible ? [
        { title: "Unsigned", key: "unsigned", horizontalAlignment: "CENTER", width: 60 }
    ] : [];

    const incrementLabel = autoIncrementLabel(databaseType);
    const header3 = [
        { title: "PK", key: "primaryKey", horizontalAlignment: "CENTER", width: 35 },
        { title: "NotNull", key: "notNull", horizontalAlignment: "CENTER", width: 50 },
        { title: "Unique", key: "unique", horizontalAlignment: "CENTER", width: 50 },
        ...((incrementLabel !== "") ? [{
            title: incrementLabel, key: "autoIncrement", horizontalAlignment: "CENTER", width: 55
        }] : []),
        { title: "Default", key: "defaultValue", width: 75 },
        { title: "Foreign Key", key: "foreignRelation", width: 120 },
        { title: "Description", key: "description", wrapText: true, width: 350 },
    ];

    // 使用有無に依らず基本列の位置を固定するため、使用されている属性の列だけを最終列(Description)の右側に足す。
    const header4 = [
        ...(usedColumnAttributes.includes("characterSet") ? [
            { title: "Character Set", key: "characterSet", width: 90 }
        ] : []),
        ...(usedColumnAttributes.includes("collate") ? [
            { title: "Collate", key: "collate", width: 120 }
        ] : []),
        ...(usedColumnAttributes.includes("checkExpression") ? [
            { title: "Check Expression", key: "checkExpression", wrapText: true, width: 200 }
        ] : []),
        ...(usedColumnAttributes.includes("optionExpression") ? [
            { title: "Other Option Expression", key: "optionExpression", wrapText: true, width: 200 }
        ] : []),
    ];

    return [...header0, ...header1, ...header2, ...header3, ...header4];
};

const createTableSpecSheet = (databaseType: DatabaseType, tableSpec: TableDetailSpec) => {
    const tableSummaryRecords = [
        { title: "TableName (physical)", value: tableSpec.physicalName },
        { title: "TableName (logical)", value: tableSpec.logicalName },
        { title: "Description", value: tableSpec.description, height: 60 }
    ];
    const totalSummaryInfo = doInitVerticalGridContent(tableSummaryRecords);
    const totalSummary = {
        startRow: 0,
        startColumn: 0,
        ...totalSummaryInfo
    };

    // カラム定義
    const columnGridTitle = {
        startRow: totalSummaryInfo.rowData.length + 1,
        startColumn: 0,
        rowData: [{ values: [initBoldCell("Columns Specification")] }],
    };

    const columnsHeader = initColumnHeader(databaseType, tableSpec.usedColumnAttributes, false);
    const { rowData: columnRowData, columnMetadata } = doInitGridContent({
        headers: columnsHeader, rows: Array.from(tableSpec.exportColumns())
    });
    const columnSummary = {
        startRow: columnGridTitle.startRow + 1,
        startColumn: 0,
        rowData: columnRowData,
        columnMetadata: columnMetadata
    };

    // テーブル定義サマリのマージ情報
    const summaryMergeRanges = [
        { startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: columnsHeader.length },
        { startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: columnsHeader.length },
        { startRowIndex: 2, endRowIndex: 3, startColumnIndex: 1, endColumnIndex: columnsHeader.length },
    ];

    let currentEndRow = columnSummary.startRow + columnRowData.length;
    const subTableMergeRanges = [];

    // 一意キー制約定義
    const uniqueKeyGridTitle = {
        startRow: currentEndRow + 1,
        startColumn: 0,
        rowData: [{ values: [initBoldCell("Unique Keys Specification")] }],
    };
    const uniqueKeyGrids = [];
    let uniqueKeyStartRow = uniqueKeyGridTitle.startRow + 1;
    for (const uniqueKeySpec of tableSpec.exportUniqueKeys()) {
        const { gridData, mergeRanges }
            = initUniqueKeyConstraintContent(uniqueKeyStartRow, databaseType, uniqueKeySpec);
        uniqueKeyStartRow += gridData.rowData.length + 1;
        uniqueKeyGrids.push(gridData);
        subTableMergeRanges.push(...mergeRanges);
    }

    if (uniqueKeyGrids.length > 0) {
        currentEndRow = uniqueKeyStartRow - 1;
    }

    // インデックス定義
    const tableIndexGridTitle = {
        startRow: currentEndRow + 1,
        startColumn: 0,
        rowData: [{ values: [initBoldCell("Indexes Specification")] }],
    };
    const tableIndexGrids = [];
    let tableIndexStartRow = tableIndexGridTitle.startRow + 1;
    for (const tableIndexSpec of tableSpec.exportTableIndexes()) {
        const { gridData, mergeRanges }
            = initTableIndexContent(tableIndexStartRow, databaseType, tableIndexSpec);

        tableIndexStartRow += gridData.rowData.length + 1;
        tableIndexGrids.push(gridData);
        subTableMergeRanges.push(...mergeRanges);
    }

    // currentEndRow は直前セクション末尾の空行を指す。インデックスが無い場合、tableIndexStartRow は未出力の
    // タイトル行の次を指すため、更新しない。
    if (tableIndexGrids.length > 0) {
        currentEndRow = tableIndexStartRow - 1;
    }

    // テーブルオプション定義(値のある項目が無ければセクションごと出力しない)
    const tableOptionRecords = initTableOptionRecords(tableSpec.tableOptions);
    const tableOptionGridTitle = {
        startRow: currentEndRow + 1,
        startColumn: 0,
        rowData: [{ values: [initBoldCell("Table Options Specification")] }],
    };
    const { gridData: tableOptionGrid, mergeRanges: tableOptionMergeRanges } = initTableOptionContent(
        tableOptionGridTitle.startRow + 1, columnsHeader.length, tableOptionRecords
    );
    const tableOptionGrids = (tableOptionRecords.length > 0) ? [tableOptionGridTitle, tableOptionGrid] : [];
    subTableMergeRanges.push(...tableOptionMergeRanges);

    const sheetProperty = {
        title: tableSpec.physicalName,
        sheetType: "GRID",
        gridProperties: {
            rowCount: (tableOptionRecords.length > 0)
                ? tableOptionGrid.startRow + tableOptionGrid.rowData.length
                : currentEndRow + 1,
            columnCount: columnsHeader.length,
            frozenRowCount: 1,
            frozenColumnCount: 1
        },
    };

    return {
        properties: sheetProperty,
        data: [totalSummary, columnGridTitle, columnSummary]
            .concat((uniqueKeyGrids.length > 0) ? [uniqueKeyGridTitle, ...uniqueKeyGrids] : [])
            .concat((tableIndexGrids.length > 0) ? [tableIndexGridTitle, ...tableIndexGrids] : [])
            .concat(tableOptionGrids),
        mergeRanges: summaryMergeRanges.concat(subTableMergeRanges)
    };
};

type TableOptionRecord = { title: string, value: string };

const initTableOptionRecords = (tableOptions: TableOptionSpec): TableOptionRecord[] => {
    const records: TableOptionRecord[] = [
        { title: "Character Set", value: tableOptions.characterSet },
        { title: "Collate", value: tableOptions.collate },
        { title: "Check Expression", value: tableOptions.checkExpression },
        { title: "Other Definition Expression", value: tableOptions.definitionExpression },
        { title: "Other Table Option Expression", value: tableOptions.optionExpression },
    ];

    return records.filter(record => (record.value !== ""));
};

const initTableOptionContent = (startRow: number, columnCount: number, records: TableOptionRecord[]) => {
    const contents = doInitVerticalGridContent(records);
    const gridData = {
        startRow: startRow,
        startColumn: 0,
        ...contents
    };

    // 値セルを最終列まで結合する(テーブル定義サマリと同じ構成)
    const mergeRanges = records.map((_, index) => {
        return {
            startRowIndex: startRow + index,
            endRowIndex: startRow + index + 1,
            startColumnIndex: 1,
            endColumnIndex: columnCount
        };
    });

    return { gridData, mergeRanges };
};

const initUniqueKeyConstraintContent = (
    startRow: number, databaseType: DatabaseType, uniqueKeySpec: UniqueKeyConstraintSpec
) => {
    const showsSortOrder = Database.get(databaseType).uniqueKeySupport.orderable;
    const subHeaders = showsSortOrder
        ? [
            { title: "ColumnName (physical)", key: "physicalName" },
            { title: "Sort Order", key: "sortOrder" }
        ]
        : [{ title: "ColumnName (physical)", key: "physicalName" }];

    const records = [
        { title: "ConstraintName", value: uniqueKeySpec.constraintName },
        { title: "Description", value: uniqueKeySpec.description, height: 60 },
        {
            title: "UniqueKey Columns",
            value: { headers: subHeaders, rows: uniqueKeySpec.uniqueKeyColumns }
        },
    ];

    const contents = doInitVerticalGridContent(records);
    const gridData = {
        startRow: startRow,
        startColumn: 0,
        ...contents
    };

    // セル結合の情報
    const endColumnIndex = 3;
    const mergeRanges = [
        { startRowIndex: startRow, endRowIndex: startRow + 1, startColumnIndex: 1, endColumnIndex },
        { startRowIndex: startRow + 1, endRowIndex: startRow + 2, startColumnIndex: 1, endColumnIndex },
        {
            startRowIndex: startRow + 2, endRowIndex: startRow + 3 + uniqueKeySpec.uniqueKeyColumns.length,
            startColumnIndex: 0, endColumnIndex: 1
        },
    ].concat(
        showsSortOrder ? [] : [
            { startRowIndex: startRow + 2, endRowIndex: startRow + 3, startColumnIndex: 1, endColumnIndex },
            ...uniqueKeySpec.uniqueKeyColumns.map((_, index) => {
                return {
                    startRowIndex: startRow + 3 + index,
                    endRowIndex: startRow + 4 + index,
                    startColumnIndex: 1,
                    endColumnIndex
                };
            })
        ]
    );

    return { gridData, mergeRanges };
};

const initTableIndexContent = (
    startRow: number, databaseType: DatabaseType, tableIndexSpec: TableIndexSpec
) => {
    const showsNullsOrder = (databaseType === "postgres");
    const subHeaders = [
        { title: "ColumnName (physical)", key: "physicalName" },
        { title: "Sort Order", key: "sortOrder" }
    ];
    if (showsNullsOrder) {
        subHeaders.push({ title: "NULLS Order", key: "nullsOrder" });
    }

    const records = [
        { title: "IndexName", value: tableIndexSpec.indexName },
        { title: "IndexType", value: tableIndexSpec.indexType },
        { title: "Option", value: tableIndexSpec.indexOption },
        { title: "Description", value: tableIndexSpec.description, height: 60 },
        {
            title: "Indexed Columns",
            value: { headers: subHeaders, rows: tableIndexSpec.indexedColumns }
        },
    ];

    const contents = doInitVerticalGridContent(records);
    const gridData = {
        startRow: startRow,
        startColumn: 0,
        ...contents
    };

    // セル結合の情報
    const endColumnIndex = showsNullsOrder ? 5 : 3;
    const mergeRanges = [
        { startRowIndex: startRow, endRowIndex: startRow + 1, startColumnIndex: 1, endColumnIndex },
        { startRowIndex: startRow + 1, endRowIndex: startRow + 2, startColumnIndex: 1, endColumnIndex },
        { startRowIndex: startRow + 2, endRowIndex: startRow + 3, startColumnIndex: 1, endColumnIndex },
        { startRowIndex: startRow + 3, endRowIndex: startRow + 4, startColumnIndex: 1, endColumnIndex },
        {
            startRowIndex: startRow + 4, endRowIndex: startRow + 5 + tableIndexSpec.indexedColumns.length,
            startColumnIndex: 0, endColumnIndex: 1
        },
    ].concat(
        showsNullsOrder ? [
            { startRowIndex: startRow + 4, endRowIndex: startRow + 5, startColumnIndex: 3, endColumnIndex },
            ...tableIndexSpec.indexedColumns.map((_, index) => {
                return {
                    startRowIndex: startRow + 5 + index,
                    endRowIndex: startRow + 6 + index,
                    startColumnIndex: 3,
                    endColumnIndex
                };
            })
        ] : []
    );

    return { gridData, mergeRanges };
};

const HEADER_COLOR_STYLE = {
    "rgbColor": { "red": 187 / 255, "green": 222 / 255, "blue": 251 / 255 }
} as const

type GridContentArgs = {
    headers: GridHeaderInfo[],
    rows: { [key: string]: string | number | null }[]
};
type InitListSheetArgs = { title: string } & GridContentArgs;
type GridHeaderInfo = {
    key: string,
    title: string,
    type?: "string" | "number" | null,
    horizontalAlignment?: "LEFT" | "CENTER" | "RIGHT",
    width?: number,
    wrapText?: boolean
};

const initListSheet = ({ title, headers, rows }: InitListSheetArgs) => {
    const sheetProperty = {
        title: title,
        sheetType: "GRID",
        gridProperties: {
            rowCount: rows.length + 1,
            columnCount: headers.length,
            frozenRowCount: 1,
            frozenColumnCount: 1
        },
    };

    const contents = doInitGridContent({ headers, rows });

    return {
        properties: sheetProperty,
        data: [{
            startRow: 0,
            startColumn: 0,
            ...contents
        }]
    };
};

const doInitGridContent = ({ headers, rows }: GridContentArgs) => {
    const headerCells = headers.map((header, index) => {
        return {
            userEnteredValue: { stringValue: header.title },
            userEnteredFormat: {
                backgroundColorStyle: HEADER_COLOR_STYLE,
                borders: {
                    top: { style: "SOLID_MEDIUM" },
                    bottom: { style: "SOLID" },
                    left: { style: (index === 0) ? "SOLID_MEDIUM" : "SOLID" },
                    right: { style: (index === headers.length - 1) ? "SOLID_MEDIUM" : "SOLID" }
                },
                verticalAlignment: "TOP",
                textFormat: { bold: true },
            }
        };
    });

    let withMetadata = false;
    const columnMetadata = headers.map(header => {
        if (header.width == null) {
            return {};
        }

        withMetadata = true;

        return {
            pixelSize: header.width,
        };
    });

    const records = rows.map((row, rowIndex) => {
        const cells = headers.map((header, columnIndex) => {
            const format = {
                borders: {
                    top: { style: "DOTTED" },
                    bottom: { style: (rowIndex === rows.length - 1) ? "SOLID_MEDIUM" : "DOTTED" },
                    left: { style: (columnIndex === 0) ? "SOLID_MEDIUM" : "SOLID" },
                    right: { style: (columnIndex === headers.length - 1) ? "SOLID_MEDIUM" : "SOLID" }
                },
                verticalAlignment: "TOP",
                wrapStrategy: header.wrapText ? "WRAP" : "OVERFLOW_CELL",
                ...(header.horizontalAlignment && { horizontalAlignment: header.horizontalAlignment }),
            };

            const value = row[header.key];
            if (value == null) {
                return { userEnteredValue: { stringValue: "" }, userEnteredFormat: format };
            }

            if (header.type === "number") {
                return { userEnteredValue: { numberValue: value }, userEnteredFormat: format };
            }

            return { userEnteredValue: { stringValue: value }, userEnteredFormat: format };
        });

        return { values: cells };
    });

    return {
        rowData: [{ values: headerCells }, ...records],
        ...(withMetadata ? { columnMetadata: columnMetadata } : {}),
    };
};

type VerticalGridContentArgs = {
    title: string,
    value: string | GridContentArgs,
    height?: number
};

const doInitVerticalGridContent = (contents: VerticalGridContentArgs[]) => {
    let rowLength = contents.length;

    const rowData = contents.flatMap((content, rowIndex) => {
        const titleCell = {
            userEnteredValue: { stringValue: content.title },
            userEnteredFormat: {
                backgroundColorStyle: HEADER_COLOR_STYLE,
                borders: {
                    top: { style: (rowIndex === 0) ? "SOLID_MEDIUM" : "DOTTED" },
                    bottom: { style: (rowIndex === rowLength - 1) ? "SOLID_MEDIUM" : "DOTTED" },
                    left: { style: "SOLID_MEDIUM" },
                    right: { style: "SOLID" }
                },
                verticalAlignment: "TOP",
                textFormat: { bold: true },
            }
        };

        if (typeof content.value === "string") {
            const valueCell = {
                userEnteredValue: { stringValue: content.value },
                userEnteredFormat: {
                    borders: {
                        top: { style: (rowIndex === 0) ? "SOLID_MEDIUM" : "DOTTED" },
                        bottom: { style: (rowIndex === rowLength - 1) ? "SOLID_MEDIUM" : "DOTTED" },
                        left: { style: "SOLID" },
                        right: { style: "SOLID_MEDIUM" }
                    },
                    verticalAlignment: "TOP",
                    wrapStrategy: "WRAP",
                }
            };

            return [{ values: [titleCell, valueCell] }];
        }

        const { headers, rows } = content.value;
        rowLength += rows.length;

        const subtitleCells = headers.map((header, columnIndex) => {
            return {
                userEnteredValue: { stringValue: header.title },
                userEnteredFormat: {
                    backgroundColorStyle: HEADER_COLOR_STYLE,
                    borders: {
                        top: { style: "DOTTED" },
                        bottom: { style: "DOTTED" },
                        left: { style: "SOLID" },
                        right: { style: (columnIndex === headers.length - 1) ? "SOLID_MEDIUM" : "SOLID" }
                    },
                    verticalAlignment: "TOP",
                    textFormat: { bold: true },
                }
            };
        });

        const subRows = rows.map((row, subRowIndex) => {
            const cells = headers.map((header, columnIndex) => {
                const format = {
                    borders: {
                        top: { style: "DOTTED" },
                        bottom: { style: (subRowIndex + rowIndex === rowLength - 2) ? "SOLID_MEDIUM" : "DOTTED" },
                        left: { style: "SOLID" },
                        right: { style: (columnIndex === headers.length - 1) ? "SOLID_MEDIUM" : "SOLID" }
                    },
                    verticalAlignment: "TOP",
                    wrapStrategy: header.wrapText ? "WRAP" : "OVERFLOW_CELL",
                    ...(header.horizontalAlignment && { horizontalAlignment: header.horizontalAlignment }),
                };

                const value = row[header.key];
                if (value == null) {
                    return { userEnteredValue: { stringValue: "" }, userEnteredFormat: format };
                }

                if (header.type === "number") {
                    return { userEnteredValue: { numberValue: value }, userEnteredFormat: format };
                }

                return { userEnteredValue: { stringValue: value }, userEnteredFormat: format };
            });

            return { values: [{}, ...cells] };
        });

        return [{ values: [titleCell, ...subtitleCells] }, ...subRows];
    });

    const rowMetadata = contents.flatMap(content => {
        const metadata = [content.height ? { pixelSize: content.height } : {}];

        if (typeof content.value === "string") {
            return metadata;
        }

        for (const _subRows of content.value.rows) {
            metadata.push({});
        }

        return metadata;
    });


    return { rowData, rowMetadata };
};

const initBoldCell = (value: string) => {
    return {
        userEnteredValue: { stringValue: value },
        userEnteredFormat: {
            textFormat: { bold: true }
        }
    };
};

export default exportSpreadSheetFormatSpecification;