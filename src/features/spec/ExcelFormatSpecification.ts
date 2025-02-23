import ExcelJS from "exceljs";

import createSpecification from "~/features/spec/create-specification";
import { DatabaseType, NullsOrderType, SortOrderType } from "~/models/database";
import { TableIndexOption, TableIndexType } from "~/models/database/TableIndexSupport";
import ErdDocument from "~/models/ErdDocument";

const exportExcelFormatSpecification = async (erdDocument: ErdDocument, image: ImageContent) => {
    const specs = createSpecification(erdDocument);
    const databaseType = erdDocument.databaseSettingModel.databaseType;

    const workbook = new ExcelJS.Workbook();

    // ER図のシート追加
    addDiagramSheet(workbook, image);

    // テーブル一覧のシート追加
    addTableListSheet(workbook, specs.exportTables);
    // カラム一覧のシート追加
    addColumnListSheet(workbook, databaseType, specs.exportColumns);

    // 各テーブル定義のシート追加
    for (const tableSpec of specs.exportTableSpecs()) {
        addTableSpecs(workbook, databaseType, tableSpec);
    }

    // テキストを上寄せ
    workbook.worksheets.forEach(worksheet => {
        worksheet.eachRow({ includeEmpty: true }, row => {
            row.eachCell({ includeEmpty: true }, cell => {
                cell.alignment = {
                    ...cell.alignment,
                    vertical: 'top'
                };
            });
        });
    });

    const excelBuffer = await workbook.xlsx.writeBuffer();

    return new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
};

type ImageContent = {
    base64Value: string,
    width: number,
    height: number
};

const addDiagramSheet = (workbook: ExcelJS.Workbook, image: ImageContent) => {
    const diagramSheet = workbook.addWorksheet("ER Diagram");
    const imageId = workbook.addImage({ base64: image.base64Value, extension: "png", });

    diagramSheet.addImage(imageId, {
        tl: { col: 1, row: 1 },
        ext: { width: image.width * 4 / 3, height: image.height * 4 / 3 }
    });
};

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBBDEFB' } };

type TableListGenerator = Generator<TableList, void, unknown>
type TableList = {
    physicalName: string;
    logicalName: string;
    description: string;
};

const addTableListSheet = (workbook: ExcelJS.Workbook, exportTables: () => TableListGenerator) => {

    const tableSheet = workbook.addWorksheet("Tables");
    tableSheet.columns = [
        { header: "TableName (physical)", key: "physicalName", width: 25, style: { alignment: { wrapText: false } } },
        { header: "TableName (logical)", key: "logicalName", width: 25, style: { alignment: { wrapText: false } } },
        { header: "Description", key: "description", width: 70 },
    ];
    tableSheet.getRow(1).font = { bold: true };
    tableSheet.getRow(1).eachCell(cell => {
        cell.font = { bold: true };
        cell.fill = HEADER_FILL;
    });

    // 1行目を固定
    tableSheet.views = [
        { state: "frozen", xSplit: 1, ySplit: 1, activeCell: "A2" }
    ];

    let physicalNameLength = 25;
    let logicalNameLength = 25;

    for (const tableSpec of exportTables()) {
        tableSheet.addRow(tableSpec);

        physicalNameLength = Math.max(physicalNameLength, tableSpec.physicalName.length + 2);
        logicalNameLength = Math.max(logicalNameLength, tableSpec.logicalName.length + 2);
    }

    physicalNameLength = Math.min(physicalNameLength, 50);
    logicalNameLength = Math.min(logicalNameLength, 50);

    // セル幅の設定
    tableSheet.columns[0].width = physicalNameLength;
    tableSheet.columns[1].width = logicalNameLength;

    setTableBorders(tableSheet);
    setPrintArea(tableSheet);
};

type ColumnListGenerator = Generator<ColumnList, void, unknown>;
type ColumnList = {
    physicalTableName: string;
    logicalTableName: string;
    physicalColumnName: string;
    logicalColumnName: string;
    columnType: string;
    precision: number | null;
    scale: number | null;
    unsigned: string;
    primaryKey: string;
    notNull: string;
    unique: string;
    autoIncrement: string;
    defaultValue: string;
    foreignRelation: string | null;
    description: string;
};

const addColumnListSheet = (
    workbook: ExcelJS.Workbook, databaseType: DatabaseType, exportColumns: () => ColumnListGenerator
) => {
    const columnSheet = workbook.addWorksheet("Attributes");

    columnSheet.columns = initColumnHeader(databaseType);
    columnSheet.getRow(1).eachCell(cell => {
        cell.font = { bold: true };
        cell.fill = HEADER_FILL;
    });

    // 1行目を固定
    columnSheet.views = [
        { state: "frozen", xSplit: 1, ySplit: 1, activeCell: "A2" }
    ];

    let physicalTableLength = 25;
    let logicalTableLength = 25;
    let physicalColumnLength = 25;
    let logicalColumnLength = 25;

    for (const columnSpec of exportColumns()) {
        columnSheet.addRow(columnSpec);

        physicalTableLength = Math.max(physicalTableLength, columnSpec.physicalTableName.length + 2);
        logicalTableLength = Math.max(logicalTableLength, columnSpec.logicalTableName.length + 2);
        physicalColumnLength = Math.max(physicalColumnLength, columnSpec.physicalColumnName.length + 2);
        logicalColumnLength = Math.max(logicalColumnLength, columnSpec.logicalColumnName.length + 2);
    }

    physicalTableLength = Math.min(physicalTableLength, 50);
    logicalTableLength = Math.min(logicalTableLength, 50);
    physicalColumnLength = Math.min(physicalColumnLength, 50);
    logicalColumnLength = Math.min(logicalColumnLength, 50);

    // セル幅の設定
    columnSheet.columns[0].width = physicalTableLength;
    columnSheet.columns[1].width = logicalTableLength;
    columnSheet.columns[2].width = physicalColumnLength;
    columnSheet.columns[3].width = logicalColumnLength;

    setTableBorders(columnSheet);
    setPrintArea(columnSheet);
};

const initColumnHeader = (databaseType: DatabaseType, withTableInfo: boolean = true): Partial<ExcelJS.Column>[] => {
    const unwrapStyle: Partial<ExcelJS.Style> = { alignment: { wrapText: false } };
    const centerAlignmentStyle: Partial<ExcelJS.Style> = { alignment: { horizontal: 'center', wrapText: false } };

    const header0: Partial<ExcelJS.Column>[] = withTableInfo ? [
        { header: "TableName (physical)", key: "physicalTableName", width: 20, style: unwrapStyle },
        { header: "TableName (logical)", key: "logicalTableName", width: 20, style: unwrapStyle }
    ] : []

    const header1: Partial<ExcelJS.Column>[] = [
        { header: "ColumnName (physical)", key: "physicalColumnName", width: 20, style: unwrapStyle },
        { header: "ColumnName (logical)", key: "logicalColumnName", width: 20, style: unwrapStyle },
        { header: "Type", key: "columnType", width: 15, style: { alignment: { wrapText: false } } },
        { header: "Precision", key: "precision", width: 7, style: unwrapStyle },
        { header: "Scale", key: "scale", width: 7, style: unwrapStyle }
    ];

    const header2: Partial<ExcelJS.Column>[] = (databaseType === "mysql") ? [
        { header: "Unsigned", key: "unsigned", width: 8, style: centerAlignmentStyle }
    ] : [];

    const header3: Partial<ExcelJS.Column>[] = [
        { header: "PK", key: "primaryKey", width: 5, style: centerAlignmentStyle },
        { header: "NotNull", key: "notNull", width: 7, style: centerAlignmentStyle },
        { header: "Unique", key: "unique", width: 7, style: centerAlignmentStyle },
    ];

    const header4: Partial<ExcelJS.Column>[] = (databaseType === "mysql") ? [
        { header: "Increment", key: "autoIncrement", width: 10, style: centerAlignmentStyle }
    ] : [];

    const header5: Partial<ExcelJS.Column>[] = [
        { header: "Default", key: "defaultValue", width: 10, style: unwrapStyle },
        { header: "Foreign Key", key: "foreignRelation", width: 15, style: unwrapStyle },
        { header: "Description", key: "description", width: 50 },
    ];

    return [...header0, ...header1, ...header2, ...header3, ...header4, ...header5];
};

type TableSpec = {
    physicalName: string;
    logicalName: string;
    description: string;
    exportColumns: () => ColumnListGenerator;
    exportTableIndexes: () => TableIndexGenerator;
};

type TableIndexGenerator = Generator<TableIndex, void, unknown>;
type TableIndex = {
    indexName: string;
    indexType: TableIndexType;
    indexOption: TableIndexOption;
    description: string;
    indexedColumns: {
        physicalName: string;
        sortOrder: SortOrderType;
        nullsOrder: NullsOrderType;
    }[];
};

const addTableSpecs = (
    workbook: ExcelJS.Workbook, databaseType: DatabaseType, tableSpec: TableSpec
) => {
    const tableSheet = workbook.addWorksheet(tableSpec.physicalName);

    const columnsHeader = initColumnHeader(databaseType, false);
    tableSheet.columns = columnsHeader;
    tableSheet.getRow(1).eachCell(cell => {
        cell.font = { bold: true };
        cell.fill = HEADER_FILL;
    });
    // 1行目を固定
    tableSheet.views = [
        { state: "frozen", xSplit: 1, ySplit: 1, activeCell: "A1" }
    ];

    // はじめにカラム定義のヘッダを追加しているので、カラムを追加
    let tableColumnCount = 0;
    for (const columnSpec of tableSpec.exportColumns()) {
        tableSheet.addRow(columnSpec);
        tableColumnCount++;
    }
    setTableBorders(tableSheet);

    // テーブル定義を記載する行を頭に挿入
    tableSheet.insertRows(1, [
        ["TableName (physical)", tableSpec.physicalName],
        ["TableName (logical)", tableSpec.logicalName],
        ["Description", tableSpec.description],
        {},
        ["Columns Specification"]
    ]);
    for (let rowNumber = 1; rowNumber <= 3; rowNumber++) {
        tableSheet.mergeCells(`B${rowNumber}:${columnAlphabet(columnsHeader.length)}${rowNumber}`);
        const headerCell = tableSheet.getCell(rowNumber, 1);
        headerCell.fill = HEADER_FILL;
        headerCell.font = { bold: true };
    }
    setTableBorders(tableSheet, { headerRowNumber: 1, recordCount: 3, header: "vertical" });

    // Description セルの高さ調整
    const descriptionRow = tableSheet.getRow(3);
    descriptionRow.height = 45;

    const columnsSpecTitle = tableSheet.getCell(5, 1);
    columnsSpecTitle.font = { bold: true };

    tableSheet.addRow([]);

    const tableIndexes = Array.from(tableSpec.exportTableIndexes());
    if (tableIndexes.length === 0) {
        setPrintArea(tableSheet);
        return;
    }

    tableSheet.addRow(["Indexes Specification"]);
    const indexTitleCell = tableSheet.getCell(tableColumnCount + 8, 1);
    indexTitleCell.font = { bold: true };

    let tableIndexRowNumber = tableColumnCount + 9;
    for (const tableIndex of tableIndexes) {
        const shiftRows = doAddIndexSpecForTable(tableSheet, tableIndexRowNumber, databaseType, tableIndex);
        tableIndexRowNumber += shiftRows;
    }

    setPrintArea(tableSheet);
};

const doAddIndexSpecForTable = (
    tableSheet: ExcelJS.Worksheet, startRowNumber: number,
    databaseType: DatabaseType, tableIndex: TableIndex
) => {
    const indexColumnHeader = (databaseType === "postgres") ? [
        "Indexed Columns", "ColumnName (physical)", "Sort Order", "NULLS Order"
    ] : [
        "Indexed Columns", "ColumnName (physical)", "Sort Order"
    ];
    const indexColumnValues = tableIndex.indexedColumns.map(column => (databaseType === "postgres") ? [
        "", column.physicalName, column.sortOrder, column.nullsOrder ? `NULLS ${column.nullsOrder}` : ""
    ] : ["", column.physicalName, column.sortOrder]
    )

    tableSheet.addRows([
        ["IndexName", tableIndex.indexName],
        ["IndexType", tableIndex.indexType],
        ["Option", tableIndex.indexOption],
        ["Description", tableIndex.description],
        indexColumnHeader,
        ...indexColumnValues,
        []
    ]);

    // Description セルの高さ調整
    const descriptionRow = tableSheet.getRow(startRowNumber + 3);
    descriptionRow.height = 45;

    // タイトルセルの書式設定
    const titleHeaderIndexes = [
        [0, 1], // IndexName
        [1, 1], // IndexType
        [2, 1], // Option
        [3, 1], // Description
        [4, 1], [4, 2], [4, 3] // Index Columns header
    ];
    if (databaseType === "postgres") {
        titleHeaderIndexes.push([4, 4]);
    }
    titleHeaderIndexes.forEach(index => {
        const titleCell = tableSheet.getCell(startRowNumber + index[0], index[1]);
        titleCell.font = { bold: true };
        titleCell.fill = HEADER_FILL;
    });

    // セルのマージ
    const mergeEndColumn = columnAlphabet(databaseType === "postgres" ? 5 : 3);
    [0, 1, 2, 3].forEach(index => {
        tableSheet.mergeCells(`B${startRowNumber + index}:${mergeEndColumn}${startRowNumber + index}`);
    });
    tableSheet.mergeCells(`A${startRowNumber + 4}:A${startRowNumber + 4 + tableIndex.indexedColumns.length}`);
    if (databaseType === "postgres") {
        for (let index = 0; index < tableIndex.indexedColumns.length + 1; index++) {
            tableSheet.mergeCells(`D${startRowNumber + 4 + index}:E${startRowNumber + 4 + index}`);
        }
    }

    setTableBorders(tableSheet, {
        headerRowNumber: startRowNumber,
        recordCount: tableIndex.indexedColumns.length + 5,
        columnCount: (databaseType === "postgres" ? 5 : 3),
        header: "vertical"
    });

    return tableIndex.indexedColumns.length + 6;
};

type TableBorderOption = {
    headerRowNumber?: number;
    recordCount?: number | null;
    columnCount?: number | null;
    header?: "horizontal" | "vertical";
};

const setTableBorders = (tableSheet: ExcelJS.Worksheet, option: TableBorderOption = {}) => {
    const borderColor: Partial<ExcelJS.Color> = { argb: 'FF000000' };

    const headerRowNumber = option.headerRowNumber ?? 1;

    const totalRows = ((option.recordCount != null) && (option.recordCount >= 0))
        ? option.recordCount + headerRowNumber + (option.header === "vertical" ? -1 : 0)
        : tableSheet.rowCount;
    const totalCols = option.columnCount ? option.columnCount : tableSheet.columns.length;

    const initBottomBorder = (rowIndex: number): Partial<ExcelJS.Border> => {
        if ((rowIndex === 1) && (option.header !== "vertical")) {
            return { style: "thin", color: borderColor };
        }

        if (rowIndex === totalRows) {
            return { style: "thick", color: borderColor };
        }

        return {};
    };

    for (let rowNumber = headerRowNumber; rowNumber <= totalRows; rowNumber++) {
        const row = tableSheet.getRow(rowNumber);

        row.eachCell({ includeEmpty: true }, (cell, colIndex) => {
            cell.border = {
                top: { style: (rowNumber === headerRowNumber) ? "thick" : "hair", color: borderColor },
                bottom: initBottomBorder(rowNumber),
                left: { style: (colIndex === 1) ? "thick" : "thin", color: borderColor },
                right: { style: (colIndex === totalCols) ? "thick" : "thin", color: borderColor },
            };
        });
    }
};

const setPrintArea = (tableSheet: ExcelJS.Worksheet) => {
    const totalCols = tableSheet.columns.length;

    tableSheet.pageSetup = {
        printArea: `A1:${columnAlphabet(totalCols)}${tableSheet.rowCount}`,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1,
        orientation: "portrait"
    };
};

const columnAlphabet = (columnNumber: number): string => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    const index = columnNumber - 1;
    return alphabet[index % 26] + (index >= 26 ? alphabet[Math.floor(index / 26) - 1] : "");
};

export default exportExcelFormatSpecification;