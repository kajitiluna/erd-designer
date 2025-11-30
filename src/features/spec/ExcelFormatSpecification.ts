import ExcelJS from "exceljs";

import { ImageContent } from "~/context/ExportSpecificationContext";
import createSpecification from "~/features/spec/create-specification";
import {
    ColumnListSpecGenerator, TableIndexSpec, TableListSpecGenerator,
    TableDetailSpec, TableDetailSpecGenerator,
    UniqueKeyConstraintSpec
} from "~/features/spec/spec-util";
import { DatabaseType } from "~/models/database";
import ErdDocument from "~/models/ErdDocument";

const exportExcelFormatSpecification = async (erdDocument: ErdDocument, image: ImageContent) => {
    const specs = createSpecification(erdDocument);
    const databaseType = erdDocument.databaseSettingModel.databaseType;

    const workbook = new ExcelJS.Workbook();

    // 目次シートの追加
    addContentSheet(workbook, specs.exportTableSpecs, specs.findSheetName);
    // ER図のシート追加
    addDiagramSheet(workbook, image);
    // テーブル一覧のシート追加
    addTableListSheet(workbook, specs.exportTables);
    // カラム一覧のシート追加
    addColumnListSheet(workbook, databaseType, specs.exportColumns);

    // 各テーブル定義のシート追加
    for (const tableSpec of specs.exportTableSpecs()) {
        const sheetName = specs.findSheetName(tableSpec.physicalName);
        addTableSpecs(workbook, sheetName, databaseType, tableSpec);
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

const SHEET_NAME = {
    CONTENT: "Contents",
    ER_DIAGRAM: "ER Diagram",
    TABLES: "Tables",
    ATTRIBUTES: "Attributes",
} as const;

const addContentSheet = (
    workbook: ExcelJS.Workbook, exportTableSpecs: () => TableDetailSpecGenerator,
    findSheetName: (tableName: string) => string
) => {
    const initCellValueWithLink = (value: string) => ({ text: value, hyperlink: `#'${value}'!A1` });

    const contentSheet = workbook.addWorksheet(SHEET_NAME.CONTENT);

    contentSheet.columns = [
        { header: "Type", key: "sheetType", width: 10 },
        { header: "Sheet Name", key: "sheetName", width: 25 },
        { header: "Description", key: "description", width: 70, style: { alignment: { wrapText: true } } },
    ];
    contentSheet.getRow(1).eachCell(cell => {
        cell.font = { bold: true };
        cell.fill = HEADER_FILL;
    });

    contentSheet.addRows([
        {
            sheetType: "Diagram", description: "The diagram of entity relation.",
            sheetName: initCellValueWithLink(SHEET_NAME.ER_DIAGRAM)
        },
        {
            sheetType: "List", description: "The list of all tables.",
            sheetName: initCellValueWithLink(SHEET_NAME.TABLES)
        },
        {
            sheetType: "List", description: "The list of all columns.",
            sheetName: initCellValueWithLink(SHEET_NAME.ATTRIBUTES)
        },
    ]);
    for (const tableSpec of exportTableSpecs()) {
        const sheetName = findSheetName(tableSpec.physicalName);

        contentSheet.addRow({
            sheetType: "Table", description: tableSpec.description,
            sheetName: { text: tableSpec.physicalName, hyperlink: `#'${sheetName}'!A1` }
        });
    }
    // リンクの書式設定
    contentSheet.getColumn(2).eachCell((cell, rowNumber) => {
        if (rowNumber === 1) {
            return;
        }

        cell.font = { color: { argb: 'FF0000FF' }, underline: true };
    });

    setTableBorders(contentSheet);

    contentSheet.insertRows(1, [["Contents"], []]);

    // 3行を固定
    contentSheet.views = [
        { state: "frozen", xSplit: 1, ySplit: 3, activeCell: "A1" }
    ];

    setPrintArea(contentSheet);
};

const addDiagramSheet = (workbook: ExcelJS.Workbook, image: ImageContent) => {
    const diagramSheet = workbook.addWorksheet(SHEET_NAME.ER_DIAGRAM);
    const imageId = workbook.addImage({ base64: image.base64Value, extension: "png", });

    diagramSheet.addImage(imageId, {
        tl: { col: 1, row: 1 },
        ext: { width: image.width, height: image.height }
    });
};

// cSpell:ignore FFBBDEFB argb
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBBDEFB' } } as const;

const addTableListSheet = (workbook: ExcelJS.Workbook, exportTables: () => TableListSpecGenerator) => {
    const tableSheet = workbook.addWorksheet(SHEET_NAME.TABLES);
    tableSheet.columns = [
        { header: "TableName (physical)", key: "physicalName", width: 25 },
        { header: "TableName (logical)", key: "logicalName", width: 25 },
        { header: "Description", key: "description", width: 70, style: { alignment: { wrapText: true } } },
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

    let physicalLength = 25;
    let logicalLength = 25;

    for (const tableSpec of exportTables()) {
        tableSheet.addRow(tableSpec);

        physicalLength = Math.max(physicalLength, tableSpec.physicalName.length + 2);
        logicalLength = Math.max(logicalLength, tableSpec.logicalName.length + 2);
    }

    physicalLength = Math.min(physicalLength, 50);
    logicalLength = Math.min(logicalLength, 50);

    // セル幅の設定
    tableSheet.columns[0].width = physicalLength;
    tableSheet.columns[1].width = logicalLength;

    setTableBorders(tableSheet);
    setPrintArea(tableSheet);
};


const addColumnListSheet = (
    workbook: ExcelJS.Workbook, databaseType: DatabaseType, exportColumns: () => ColumnListSpecGenerator
) => {
    const columnSheet = workbook.addWorksheet(SHEET_NAME.ATTRIBUTES);

    const columnsHeader = initColumnHeader(databaseType);
    columnSheet.columns = columnsHeader;
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
    const centerAlignmentStyle: Partial<ExcelJS.Style> = { alignment: { horizontal: 'center' } };

    const header0: Partial<ExcelJS.Column>[] = withTableInfo ? [
        { header: "TableName (physical)", key: "physicalTableName", width: 20 },
        { header: "TableName (logical)", key: "logicalTableName", width: 20 }
    ] : []

    const header1: Partial<ExcelJS.Column>[] = [
        { header: "ColumnName (physical)", key: "physicalColumnName", width: 20 },
        { header: "ColumnName (logical)", key: "logicalColumnName", width: 20 },
        { header: "Type", key: "columnType", width: 15 },
        { header: "Precision", key: "precision", width: 7 },
        { header: "Scale", key: "scale", width: 7 }
    ];

    const header2: Partial<ExcelJS.Column>[] = (databaseType === "mysql") ? [
        { header: "Unsigned", key: "unsigned", width: 8, style: centerAlignmentStyle }
    ] : [];

    const header3: Partial<ExcelJS.Column>[] = [
        { header: "PK", key: "primaryKey", width: 5, style: centerAlignmentStyle },
        { header: "NotNull", key: "notNull", width: 7, style: centerAlignmentStyle },
        { header: "Unique", key: "unique", width: 7, style: centerAlignmentStyle },
        {
            header: (databaseType === "mysql") ? "Increment" : "Identity",
            key: "autoIncrement", width: (databaseType === "mysql") ? 10 : 8, style: centerAlignmentStyle
        },
        { header: "Default", key: "defaultValue", width: 10 },
        { header: "Foreign Key", key: "foreignRelation", width: 15 },
        { header: "Description", key: "description", width: 50, style: { alignment: { wrapText: true } } },
    ];

    return [...header0, ...header1, ...header2, ...header3];
};

const addTableSpecs = (
    workbook: ExcelJS.Workbook, sheetName: string, databaseType: DatabaseType, tableSpec: TableDetailSpec
) => {
    const tableSheet = workbook.addWorksheet(sheetName);

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
    const descriptionCell = descriptionRow.getCell(2);
    descriptionCell.alignment = { wrapText: true };

    const columnsSpecTitle = tableSheet.getCell(5, 1);
    columnsSpecTitle.font = { bold: true };

    tableSheet.addRow([]);

    let nextTitleRowNumber = tableColumnCount + 8;

    // 複合一意キー定義の追加
    const uniqueKeySpecs = Array.from(tableSpec.exportUniqueKeys());
    if (uniqueKeySpecs.length > 0) {
        tableSheet.addRow(["Unique Keys Specification"]);
        const uniqueKeyTitleCell = tableSheet.getCell(nextTitleRowNumber, 1);
        uniqueKeyTitleCell.font = { bold: true };

        let uniqueKeyRowNumber = nextTitleRowNumber + 1;
        for (const uniqueKeySpec of uniqueKeySpecs) {
            const shiftRows = doAddUniqueKeySpecForTable(tableSheet, uniqueKeyRowNumber, databaseType, uniqueKeySpec);
            uniqueKeyRowNumber += shiftRows;
        }

        nextTitleRowNumber = uniqueKeyRowNumber;
    }

    // インデクス定義の追加
    const tableIndexSpecs = Array.from(tableSpec.exportTableIndexes());
    if (tableIndexSpecs.length === 0) {
        setPrintArea(tableSheet);
        return;
    }

    tableSheet.addRow(["Indexes Specification"]);
    const indexTitleCell = tableSheet.getCell(nextTitleRowNumber, 1);
    indexTitleCell.font = { bold: true };

    let tableIndexRowNumber = nextTitleRowNumber + 1;
    for (const tableIndexSpec of tableIndexSpecs) {
        const shiftRows = doAddIndexSpecForTable(tableSheet, tableIndexRowNumber, databaseType, tableIndexSpec);
        tableIndexRowNumber += shiftRows;
    }

    setPrintArea(tableSheet);
};

const doAddUniqueKeySpecForTable = (
    tableSheet: ExcelJS.Worksheet, startRowNumber: number,
    databaseType: DatabaseType, uniqueKeySpec: UniqueKeyConstraintSpec
) => {
    const indexColumnHeader = (databaseType === "postgres")
        ? ["UniqueKey Columns", "ColumnName (physical)"]
        : ["UniqueKey Columns", "ColumnName (physical)", "Sort Order"];
    const indexColumnValues = uniqueKeySpec.uniqueKeyColumns.map(
        column => (databaseType === "postgres")
            ? ["", column.physicalName]
            : ["", column.physicalName, column.sortOrder]
    );

    tableSheet.addRows([
        ["ConstraintName", uniqueKeySpec.constraintName],
        ["Description", uniqueKeySpec.description],
        indexColumnHeader,
        ...indexColumnValues,
        []
    ]);

    // Description セルの高さ調整
    const descriptionRow = tableSheet.getRow(startRowNumber + 1);
    descriptionRow.height = 45;
    const descriptionCell = descriptionRow.getCell(2);
    descriptionCell.alignment = { wrapText: true };

    // タイトルセルの書式設定
    const titleHeaderIndexes = [
        [0, 1], // ConstraintName
        [1, 1], // Description
        [2, 1], [2, 2] // Unique key Columns header
    ];
    if (databaseType !== "postgres") {
        titleHeaderIndexes.push([2, 3]);
    }
    titleHeaderIndexes.forEach(index => {
        const titleCell = tableSheet.getCell(startRowNumber + index[0], index[1]);
        titleCell.font = { bold: true };
        titleCell.fill = HEADER_FILL;
    });

    // セルのマージ
    const mergeEndColumn = columnAlphabet(3);
    [0, 1].forEach(index => {
        tableSheet.mergeCells(`B${startRowNumber + index}:${mergeEndColumn}${startRowNumber + index}`);
    });
    tableSheet.mergeCells(`A${startRowNumber + 2}:A${startRowNumber + 2 + uniqueKeySpec.uniqueKeyColumns.length}`);
    if (databaseType === "postgres") {
        for (let index = 0; index < uniqueKeySpec.uniqueKeyColumns.length + 1; index++) {
            tableSheet.mergeCells(`B${startRowNumber + 2 + index}:C${startRowNumber + 2 + index}`);
        }
    }

    setTableBorders(tableSheet, {
        headerRowNumber: startRowNumber,
        recordCount: uniqueKeySpec.uniqueKeyColumns.length + 3,
        columnCount: 3,
        header: "vertical"
    });

    return uniqueKeySpec.uniqueKeyColumns.length + 4;
};

const doAddIndexSpecForTable = (
    tableSheet: ExcelJS.Worksheet, startRowNumber: number,
    databaseType: DatabaseType, tableIndexSpec: TableIndexSpec
) => {
    const indexColumnHeader = (databaseType === "postgres")
        ? ["Indexed Columns", "ColumnName (physical)", "Sort Order", "NULLS Order"]
        : ["Indexed Columns", "ColumnName (physical)", "Sort Order"];
    const indexColumnValues = tableIndexSpec.indexedColumns.map(
        column => (databaseType === "postgres")
            ? ["", column.physicalName, column.sortOrder, column.nullsOrder]
            : ["", column.physicalName, column.sortOrder]
    )

    tableSheet.addRows([
        ["IndexName", tableIndexSpec.indexName],
        ["IndexType", tableIndexSpec.indexType],
        ["Option", tableIndexSpec.indexOption],
        ["Description", tableIndexSpec.description],
        indexColumnHeader,
        ...indexColumnValues,
        []
    ]);

    // Description セルの高さ調整
    const descriptionRow = tableSheet.getRow(startRowNumber + 3);
    descriptionRow.height = 45;
    const descriptionCell = descriptionRow.getCell(2);
    descriptionCell.alignment = { wrapText: true };

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
    tableSheet.mergeCells(`A${startRowNumber + 4}:A${startRowNumber + 4 + tableIndexSpec.indexedColumns.length}`);
    if (databaseType === "postgres") {
        for (let index = 0; index < tableIndexSpec.indexedColumns.length + 1; index++) {
            tableSheet.mergeCells(`D${startRowNumber + 4 + index}:E${startRowNumber + 4 + index}`);
        }
    }

    setTableBorders(tableSheet, {
        headerRowNumber: startRowNumber,
        recordCount: tableIndexSpec.indexedColumns.length + 5,
        columnCount: (databaseType === "postgres" ? 5 : 3),
        header: "vertical"
    });

    return tableIndexSpec.indexedColumns.length + 6;
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
    const lastDigit = alphabet[index % 26];
    if (index < 26) {
        return lastDigit;
    }

    return columnAlphabet(Math.floor(index / 26) - 1) + lastDigit;
};

export default exportExcelFormatSpecification;