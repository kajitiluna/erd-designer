import { v4 as uuidV4 } from 'uuid';
import { vi, describe, test, expect, beforeEach } from 'vitest';

vi.mock('vscode', () => ({}));

import { DocumentResource } from '~/agent-tools/DocumentResource';
import DocumentBudget from '~/agent-tools/DocumentBudget';
import { mcpRegisterColumnStruct } from '~/agent-tools/tools/struct-types';
import { mcpRegisterColumn } from '~/agent-tools/tools/columns';
import { mcpRegisterTable } from '~/agent-tools/tools/tables';
import ColorValue from '~/models/ColorValue';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ColumnModel from '~/models/database/ColumnModel';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import ColumnStructModel from '~/models/database/ColumnStructModel';
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
    const column = new ColumnModel({ columnShareModelId: columnShare.columnShareModelId });
    return { column, columnShare };
};

type DocumentFixtureOptions = {
    databaseType?: 'bigquery' | 'postgres';
    columnStructModels?: ColumnStructModel[];
    extraColumns?: ColumnModel[];
    extraColumnShares?: ColumnShareModel[];
    tableColumns?: TableModel['columns'];
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
        columns: options.tableColumns ?? [
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
        columnStructModels: options.columnStructModels ?? [],
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

const getStructToolCallback = (documentResource: DocumentResource, toolName: string): ToolCallback => {
    const config = mcpRegisterColumnStruct(documentResource);
    const toolEntry = config.tools.find(tool => tool[0] === toolName);
    if (!toolEntry) throw new Error(`Tool "${toolName}" not found`);
    return toolEntry[2] as ToolCallback;
};

const getColumnToolCallback = (documentResource: DocumentResource, toolName: string): ToolCallback => {
    const config = mcpRegisterColumn(documentResource);
    const toolEntry = config.tools.find(tool => tool[0] === toolName);
    if (!toolEntry) throw new Error(`Tool "${toolName}" not found`);
    return toolEntry[2] as ToolCallback;
};

const getTableToolCallback = (documentResource: DocumentResource, toolName: string): ToolCallback => {
    const config = mcpRegisterTable(documentResource);
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

describe('struct-types MCP tools', () => {
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

    describe('create-column-struct / list / find / update / delete (CRUD)', () => {
        test('create-column-struct でカラム参照から struct を作成できる', async () => {
            const callback = getStructToolCallback(documentResource, 'create-column-struct');

            const result = await callback({
                documentId: TEST_DOC_ID,
                columnStruct: {
                    columnName: { physical: 'address' },
                    columns: [{ columnId: column1.columnModelId }, { columnId: column2.columnModelId }]
                }
            });

            const response = extractStructuredContent(result);
            expect(response.columnStructId).toBeDefined();
            expect(response.columnName.physical).toBe('address');
            expect(response.columns).toHaveLength(2);
            expect(response.columns[0]).toEqual(expect.objectContaining({
                modelType: 'single', columnId: column1.columnModelId
            }));

            const created = erdDocument.findColumnStructModel(response.columnStructId);
            expect(created).not.toBeNull();
        });

        test('list-column-structs で作成済み struct が一覧取得できる', async () => {
            const structModel = new ColumnStructModel({
                physicalName: 'address',
                columns: [{ modelType: 'single', columnModelId: column1.columnModelId }]
            });
            const fixture = createTestDocument({ column1, column2, columnStructModels: [structModel] });
            refreshBudget(fixture.erdDocument);

            const callback = getStructToolCallback(documentResource, 'list-column-structs');
            const result = await callback({ documentId: TEST_DOC_ID });
            const response = extractStructuredContent(result);

            expect(response.items).toHaveLength(1);
            expect(response.items[0].columnStructId).toBe(structModel.columnStructId);
        });

        test('find-column-struct で詳細1件を取得できる', async () => {
            const structModel = new ColumnStructModel({
                physicalName: 'address',
                columns: [{ modelType: 'single', columnModelId: column1.columnModelId }]
            });
            const fixture = createTestDocument({ column1, column2, columnStructModels: [structModel] });
            refreshBudget(fixture.erdDocument);

            const callback = getStructToolCallback(documentResource, 'find-column-struct');
            const result = await callback({ documentId: TEST_DOC_ID, columnStructId: structModel.columnStructId });
            const response = extractStructuredContent(result);

            expect(response.columnStructId).toBe(structModel.columnStructId);
            expect(response.columnName.physical).toBe('address');
        });

        test('update-column-struct で部分更新ができる', async () => {
            const structModel = new ColumnStructModel({
                physicalName: 'address',
                columns: [{ modelType: 'single', columnModelId: column1.columnModelId }]
            });
            const fixture = createTestDocument({ column1, column2, columnStructModels: [structModel] });
            refreshBudget(fixture.erdDocument);

            const callback = getStructToolCallback(documentResource, 'update-column-struct');
            const result = await callback({
                documentId: TEST_DOC_ID,
                columnStructId: structModel.columnStructId,
                columnStruct: { isArray: true }
            });
            const response = extractStructuredContent(result);

            expect(response.isArray).toBe(true);
            expect(response.columnName.physical).toBe('address'); // 未指定フィールドは維持される
        });

        test('delete-column-struct で struct を削除できる', async () => {
            const structModel = new ColumnStructModel({
                physicalName: 'address',
                columns: [{ modelType: 'single', columnModelId: column1.columnModelId }]
            });
            const fixture = createTestDocument({ column1, column2, columnStructModels: [structModel] });
            refreshBudget(fixture.erdDocument);

            const callback = getStructToolCallback(documentResource, 'delete-column-struct');
            const result = await callback({ documentId: TEST_DOC_ID, columnStructId: structModel.columnStructId });
            const response = extractStructuredContent(result);

            expect(response.success).toBe(true);
            expect(erdDocument.findColumnStructModel(structModel.columnStructId)).toBeNull();
        });
    });

    describe('バリデーション', () => {
        test('存在しない columnId を参照すると invalid params エラー', async () => {
            const callback = getStructToolCallback(documentResource, 'create-column-struct');

            await expect(callback({
                documentId: TEST_DOC_ID,
                columnStruct: {
                    columnName: { physical: 'address' },
                    columns: [{ columnId: 'not-exist-column-id' }]
                }
            })).rejects.toThrow();
        });

        test('supportsStructType が false (postgres) のドキュメントでは create がエラーになる', async () => {
            const fixture = createTestDocument({ databaseType: 'postgres' });
            refreshBudget(fixture.erdDocument);

            const callback = getStructToolCallback(documentResource, 'create-column-struct');

            await expect(callback({
                documentId: TEST_DOC_ID,
                columnStruct: {
                    columnName: { physical: 'address' },
                    columns: [{ columnId: fixture.column1.columnModelId }]
                }
            })).rejects.toThrow();
        });

        test('自己参照の循環はエラーになる', async () => {
            // struct A を作成後、update で A 自身を members に含めようとする
            const structA = new ColumnStructModel({
                physicalName: 'struct_a',
                columns: [{ modelType: 'single', columnModelId: column1.columnModelId }]
            });
            const fixture = createTestDocument({ column1, column2, columnStructModels: [structA] });
            refreshBudget(fixture.erdDocument);

            const callback = getStructToolCallback(documentResource, 'update-column-struct');

            await expect(callback({
                documentId: TEST_DOC_ID,
                columnStructId: structA.columnStructId,
                columnStruct: {
                    columns: [{ columnStructId: structA.columnStructId }]
                }
            })).rejects.toThrow(/Circular struct reference/);
        });

        test('A→B→A の間接循環はエラーになる', async () => {
            const structB = new ColumnStructModel({
                physicalName: 'struct_b',
                columns: [{ modelType: 'single', columnModelId: column1.columnModelId }]
            });
            const structA = new ColumnStructModel({
                physicalName: 'struct_a',
                columns: [{ modelType: 'struct', columnStructId: structB.columnStructId }]
            });
            const fixture = createTestDocument({ column1, column2, columnStructModels: [structA, structB] });
            refreshBudget(fixture.erdDocument);

            const callback = getStructToolCallback(documentResource, 'update-column-struct');

            // structB の members に structA を追加 → A -> B -> A の循環
            await expect(callback({
                documentId: TEST_DOC_ID,
                columnStructId: structB.columnStructId,
                columnStruct: {
                    columns: [
                        { columnId: column1.columnModelId },
                        { columnStructId: structA.columnStructId }
                    ]
                }
            })).rejects.toThrow(/Circular struct reference/);
        });
    });

    describe('add-column-struct-to-table / remove-column-struct-from-table', () => {
        test('add-column-struct-to-table でテーブルに struct エントリを追加できる (position 指定)', async () => {
            const structModel = new ColumnStructModel({
                physicalName: 'address',
                columns: [{ modelType: 'single', columnModelId: column1.columnModelId }]
            });
            const fixture = createTestDocument({ column1, column2, columnStructModels: [structModel] });
            refreshBudget(fixture.erdDocument);

            const callback = getStructToolCallback(documentResource, 'add-column-struct-to-table');
            await callback({
                documentId: TEST_DOC_ID,
                tableId: TEST_TABLE_ID,
                columnStructId: structModel.columnStructId,
                position: { type: 'start' }
            });

            const updatedTable = erdDocument.findTableViewModel(TEST_TABLE_ID)!;
            expect(updatedTable.tableModel.columns[0]).toEqual({
                modelType: 'struct', columnStructId: structModel.columnStructId
            });
        });

        test('add-column-struct-to-table で before 指定 (columnId anchor) が機能する', async () => {
            const structModel = new ColumnStructModel({
                physicalName: 'address',
                columns: [{ modelType: 'single', columnModelId: column1.columnModelId }]
            });
            const fixture = createTestDocument({ column1, column2, columnStructModels: [structModel] });
            refreshBudget(fixture.erdDocument);

            const callback = getStructToolCallback(documentResource, 'add-column-struct-to-table');
            await callback({
                documentId: TEST_DOC_ID,
                tableId: TEST_TABLE_ID,
                columnStructId: structModel.columnStructId,
                position: { type: 'before', columnId: column2.columnModelId }
            });

            const updatedTable = erdDocument.findTableViewModel(TEST_TABLE_ID)!;
            const columns = updatedTable.tableModel.columns;
            const structIndex = columns.findIndex(column => (column.modelType === 'struct'));
            const column2Index = columns.findIndex(column =>
                (column.modelType === 'single') && (column.columnModelId === column2.columnModelId));
            expect(column2Index).toBe(structIndex + 1);
        });

        test('同一テーブルへの重複追加はエラーになる', async () => {
            const structModel = new ColumnStructModel({
                physicalName: 'address',
                columns: [{ modelType: 'single', columnModelId: column1.columnModelId }]
            });
            const fixture = createTestDocument({
                column1, column2,
                columnStructModels: [structModel],
                tableColumns: [
                    { modelType: 'struct', columnStructId: structModel.columnStructId },
                    { modelType: 'single', columnModelId: column2.columnModelId },
                ]
            });
            refreshBudget(fixture.erdDocument);

            const callback = getStructToolCallback(documentResource, 'add-column-struct-to-table');

            await expect(callback({
                documentId: TEST_DOC_ID,
                tableId: TEST_TABLE_ID,
                columnStructId: structModel.columnStructId,
                position: { type: 'end' }
            })).rejects.toThrow();
        });

        test('remove-column-struct-from-table でテーブルから struct エントリを除去できる (struct 自体は残る)', async () => {
            const structModel = new ColumnStructModel({
                physicalName: 'address',
                columns: [{ modelType: 'single', columnModelId: column1.columnModelId }]
            });
            const fixture = createTestDocument({
                column1, column2,
                columnStructModels: [structModel],
                tableColumns: [
                    { modelType: 'struct', columnStructId: structModel.columnStructId },
                    { modelType: 'single', columnModelId: column2.columnModelId },
                ]
            });
            refreshBudget(fixture.erdDocument);

            const callback = getStructToolCallback(documentResource, 'remove-column-struct-from-table');
            await callback({
                documentId: TEST_DOC_ID,
                tableId: TEST_TABLE_ID,
                columnStructId: structModel.columnStructId
            });

            const updatedTable = erdDocument.findTableViewModel(TEST_TABLE_ID)!;
            expect(updatedTable.tableModel.columns.some(column => (column.modelType === 'struct'))).toBe(false);
            // struct モデル自体は残っている
            expect(erdDocument.findColumnStructModel(structModel.columnStructId)).not.toBeNull();
        });
    });

    describe('reorder-columns-in-table (struct 対応)', () => {
        test('struct エントリを移動できる', async () => {
            const structModel = new ColumnStructModel({
                physicalName: 'address',
                columns: [{ modelType: 'single', columnModelId: column1.columnModelId }]
            });
            const fixture = createTestDocument({
                column1, column2,
                columnStructModels: [structModel],
                tableColumns: [
                    { modelType: 'single', columnModelId: column1.columnModelId },
                    { modelType: 'single', columnModelId: column2.columnModelId },
                    { modelType: 'struct', columnStructId: structModel.columnStructId },
                ],
            });
            refreshBudget(fixture.erdDocument);

            const callback = getColumnToolCallback(documentResource, 'reorder-columns-in-table');
            await callback({
                documentId: TEST_DOC_ID,
                tableId: TEST_TABLE_ID,
                reorders: [
                    { columnStructId: structModel.columnStructId, position: { type: 'start' } }
                ]
            });

            const updatedTable = erdDocument.findTableViewModel(TEST_TABLE_ID)!;
            expect(updatedTable.tableModel.columns[0]).toEqual({
                modelType: 'struct', columnStructId: structModel.columnStructId
            });
        });
    });

    describe('find-table columnDefinitions', () => {
        test('struct エントリが columnDefinitions に含まれる', async () => {
            const structModel = new ColumnStructModel({
                physicalName: 'address',
                columns: [{ modelType: 'single', columnModelId: column1.columnModelId }]
            });
            const fixture = createTestDocument({
                column1, column2,
                columnStructModels: [structModel],
                tableColumns: [
                    { modelType: 'single', columnModelId: column1.columnModelId },
                    { modelType: 'struct', columnStructId: structModel.columnStructId },
                ]
            });
            refreshBudget(fixture.erdDocument);

            const callback = getTableToolCallback(documentResource, 'find-table');
            const result = await callback({ documentId: TEST_DOC_ID, tableId: TEST_TABLE_ID });
            const response = extractStructuredContent(result);

            const structDefinition = response.columnDefinitions.find(
                (definition: { modelType: string }) => (definition.modelType === 'struct')
            );
            expect(structDefinition).toBeDefined();
            expect(structDefinition.columnStructId).toBe(structModel.columnStructId);
        });
    });
});
