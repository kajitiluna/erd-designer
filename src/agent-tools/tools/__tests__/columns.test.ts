import { v4 as uuidV4 } from 'uuid';
import { vi, describe, test, expect, beforeEach } from 'vitest';

vi.mock('vscode', () => ({}));

import { DocumentResource } from '~/agent-tools/DocumentResource';
import DocumentBudget from '~/agent-tools/DocumentBudget';
import { mcpRegisterColumn } from '~/agent-tools/tools/columns';
import ColorValue from '~/models/ColorValue';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ColumnModel from '~/models/database/ColumnModel';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import SimpleColumnModel from '~/models/database/SimpleColumnModel';
import StructColumnModel from '~/models/database/StructColumnModel';
import StructColumnShareModel from '~/models/database/StructColumnShareModel';
import TableModel from '~/models/database/TableModel';
import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';
import TableViewModel from '~/models/TableViewModel';

// ---- フィクスチャ ----

const TEST_DOC_ID = 'testdoc12345678';
const TEST_TABLE_ID = 'test-table-id-001';

const INT64_COLUMN_TYPE_ID = 17;
const STRING_COLUMN_TYPE_ID = 325;

const testColors = {
    background: new ColorValue({ red: 255, green: 255, blue: 255 }),
    foreground: new ColorValue({ red: 0, green: 0, blue: 0 }),
};

const createColumnPair = (physicalName: string, columnTypeId: number = INT64_COLUMN_TYPE_ID) => {
    const columnShare = new ColumnShareModel({
        columnShareModelId: uuidV4(),
        physicalName,
        logicalName: physicalName,
        columnType: DatabaseSettingModel.create('bigquery').findColumnType(columnTypeId)!
    });
    const column = new SimpleColumnModel({ columnShareModelId: columnShare.columnShareModelId });
    return { column, columnShare };
};

type DocumentFixtureOptions = {
    databaseType?: 'bigquery' | 'postgres';
    structColumnShareModels?: StructColumnShareModel[];
    extraColumns?: ColumnModel[];
    extraColumnShares?: ColumnShareModel[];
    tableColumns?: TableModel['columnEntries'];
    // 既存の column1/column2 を引き継いで同一ドキュメント内で ID を一貫させたい場合に指定する。
    column1?: ColumnModel;
    column2?: ColumnModel;
};

const createTestDocument = (options: DocumentFixtureOptions = {}): {
    erdDocument: ErdDocument;
    tableView: TableViewModel;
    column1: ColumnModel;
    column2: ColumnModel;
} => {
    const databaseType = options.databaseType ?? 'bigquery';

    const pair1 = createColumnPair('field_one');
    const pair2 = createColumnPair('field_two', STRING_COLUMN_TYPE_ID);
    const column1 = options.column1 ?? pair1.column;
    const column2 = options.column2 ?? pair2.column;
    const columnShare1 = pair1.columnShare;
    const columnShare2 = pair2.columnShare;

    const tableModel = new TableModel({
        tableModelId: TEST_TABLE_ID,
        physicalName: 'test_table',
        columnEntries: options.tableColumns ?? [
            { modelType: 'single', columnModelId: column1.columnModelId },
            { modelType: 'single', columnModelId: column2.columnModelId },
        ]
    });
    const tableView = new TableViewModel({
        tableModel,
        corner: { top: 0, left: 0 },
        headerColor: testColors,
    });

    const erdDocument = ErdDocument.create({
        documentName: 'test',
        erdSettingModel: ErdSettingModel.create('test'),
        databaseSettingModel: DatabaseSettingModel.create(databaseType),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [tableView],
        columnModels: [column1, column2, ...(options.extraColumns ?? [])],
        columnShareModels: [columnShare1, columnShare2, ...(options.extraColumnShares ?? [])],
        structShareModels: options.structColumnShareModels ?? [],
    });

    return { erdDocument, tableView, column1, column2 };
};

const createDocumentBudget = (erdDocument: ErdDocument): DocumentBudget => {
    return new DocumentBudget({
        documentId: TEST_DOC_ID,
        uri: 'file:///test/test.erd',
        erdDocument,
        rectangles: new Map(),
    });
};

const createMockDocumentResource = (getBudget: () => DocumentBudget) => {
    return {
        findById: vi.fn((id: string) => (id === TEST_DOC_ID ? getBudget() : null)),
        notify: vi.fn(),
    } as unknown as DocumentResource;
};

type ToolCallback = (args: Record<string, unknown>) => Promise<unknown>;

const getColumnToolCallback = (documentResource: DocumentResource, toolName: string): ToolCallback => {
    const config = mcpRegisterColumn(documentResource);
    const toolEntry = config.tools.find(tool => tool[0] === toolName);
    if (!toolEntry) throw new Error(`Tool "${toolName}" not found`);
    return toolEntry[2] as ToolCallback;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- MCP ツールのレスポンス形状はテスト内で緩く検証するため any を許容する
type LooseResponse = any;

const extractStructuredContent = (result: unknown): LooseResponse => {
    const typedResult = result as { structuredContent?: LooseResponse };
    if (typedResult.structuredContent !== undefined) {
        return typedResult.structuredContent;
    }
    return typedResult;
};

// ---- テスト ----

describe('update-column MCP tool', () => {
    let erdDocument: ErdDocument;
    let budget: DocumentBudget;
    let documentResource: DocumentResource;
    let column1: ColumnModel;
    let column2: ColumnModel;

    const refreshBudget = (nextDocument: ErdDocument) => {
        erdDocument = nextDocument;
        budget = createDocumentBudget(erdDocument);
    };

    beforeEach(() => {
        const fixture = createTestDocument();
        erdDocument = fixture.erdDocument;
        column1 = fixture.column1;
        column2 = fixture.column2;
        budget = createDocumentBudget(erdDocument);
        documentResource = createMockDocumentResource(() => budget);
        vi.mocked(documentResource.notify).mockImplementation((_id, doc) => {
            refreshBudget(doc as ErdDocument);
        });
    });

    describe('struct バリアントカラムの部分更新許可', () => {
        test('physicalName / logicalName / notNull は更新でき、entityType と structColumnShareModelId は維持される', async () => {
            const structModel = new StructColumnShareModel({
                physicalName: 'address',
                columnEntries: [{ modelType: 'single', columnModelId: column1.columnModelId }]
            });
            const wrapperColumn = new StructColumnModel({ structShareModelId: structModel.structShareModelId });
            const fixture = createTestDocument({
                column1, column2,
                structColumnShareModels: [structModel],
                extraColumns: [wrapperColumn],
                tableColumns: [
                    { modelType: 'single', columnModelId: wrapperColumn.columnModelId },
                    { modelType: 'single', columnModelId: column2.columnModelId },
                ]
            });
            refreshBudget(fixture.erdDocument);

            const callback = getColumnToolCallback(documentResource, 'update-column');
            const result = await callback({
                documentId: TEST_DOC_ID,
                columnId: wrapperColumn.columnModelId,
                column: {
                    overrideName: { physical: 'renamed_address', logical: 'Renamed Address' },
                    notNull: true
                }
            });
            const response = extractStructuredContent(result);

            expect(response.content[0].name).toBe('renamed_address');

            const updated = erdDocument.findColumnModel(wrapperColumn.columnModelId)!;
            expect(updated.entityType).toBe('struct');
            expect(ColumnModel.isStructColumn(updated) && updated.structShareModelId).toBe(structModel.structShareModelId);
            expect(updated.physicalName).toBe('renamed_address');
            expect(updated.logicalName).toBe('Renamed Address');
            expect(updated.notNull).toBe(true);
        });

        test.each([
            { label: 'primaryKey', column: { primaryKey: true } },
            { label: 'unique', column: { unique: true } },
            { label: 'columnShare (columnTypeId を含む新規 columnShare 定義)', column: {
                columnShare: {
                    columnName: { physical: 'renamed' },
                    columnTypeId: STRING_COLUMN_TYPE_ID
                }
            } },
        ])('columnShare 系パラメータ ($label) を指定すると invalid params エラーになる', async ({ column }) => {
            const structModel = new StructColumnShareModel({
                physicalName: 'address',
                columnEntries: [{ modelType: 'single', columnModelId: column1.columnModelId }]
            });
            const wrapperColumn = new StructColumnModel({ structShareModelId: structModel.structShareModelId });
            const fixture = createTestDocument({
                column1, column2,
                structColumnShareModels: [structModel],
                extraColumns: [wrapperColumn],
                tableColumns: [
                    { modelType: 'single', columnModelId: wrapperColumn.columnModelId },
                    { modelType: 'single', columnModelId: column2.columnModelId },
                ]
            });
            refreshBudget(fixture.erdDocument);

            const callback = getColumnToolCallback(documentResource, 'update-column');

            await expect(callback({
                documentId: TEST_DOC_ID,
                columnId: wrapperColumn.columnModelId,
                column
            })).rejects.toThrow(/Struct column does not support updating column-share properties/);
        });
    });

    describe('simple カラムの回帰確認', () => {
        test('simple カラムは従来どおり overrideName / notNull などを更新できる', async () => {
            const callback = getColumnToolCallback(documentResource, 'update-column');

            const result = await callback({
                documentId: TEST_DOC_ID,
                columnId: column1.columnModelId,
                column: {
                    overrideName: { physical: 'renamed_field_one' },
                    notNull: true
                }
            });
            const response = extractStructuredContent(result);

            expect(response.content[0].name).toBe('renamed_field_one');

            const updated = erdDocument.findColumnModel(column1.columnModelId)!;
            expect(updated.entityType).toBe('simple');
            expect(updated.physicalName).toBe('renamed_field_one');
            expect(updated.notNull).toBe(true);
        });
    });
});
