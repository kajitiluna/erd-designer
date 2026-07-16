import { v4 as uuidV4 } from 'uuid';
import { vi, describe, test, expect, beforeEach } from 'vitest';

vi.mock('vscode', () => ({}));

import { DocumentResource } from '~/agent-tools/DocumentResource';
import DocumentBudget from '~/agent-tools/DocumentBudget';
import { mcpRegisterStructColumnShare } from '~/agent-tools/tools/struct-column-shares';
import { mcpRegisterColumn } from '~/agent-tools/tools/columns';
import { mcpRegisterTable } from '~/agent-tools/tools/tables';
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

const getStructToolCallback = (documentResource: DocumentResource, toolName: string): ToolCallback => {
    const config = mcpRegisterStructColumnShare(documentResource);
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

describe('struct-column-shares MCP tools', () => {
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

    describe('create-struct-column-share / list / find / update / delete (CRUD)', () => {
        test('create-struct-column-share でカラム参照から struct を作成できる', async () => {
            const callback = getStructToolCallback(documentResource, 'create-struct-column-share');

            const result = await callback({
                documentId: TEST_DOC_ID,
                structColumnShare: {
                    columnName: { physical: 'address' },
                    columns: [{ columnId: column1.columnModelId }, { columnId: column2.columnModelId }]
                }
            });

            const response = extractStructuredContent(result);
            expect(response.structColumnShareModelId).toBeDefined();
            expect(response.columnName.physical).toBe('address');
            expect(response.columns).toHaveLength(2);
            expect(response.columns[0]).toEqual(expect.objectContaining({
                modelType: 'single', columnId: column1.columnModelId
            }));

            const created = erdDocument.findStructColumnShareModel(response.structColumnShareModelId);
            expect(created).not.toBeNull();
        });

        test('list-struct-column-shares で作成済み struct が一覧取得できる', async () => {
            const structModel = new StructColumnShareModel({
                physicalName: 'address',
                columnEntries: [{ modelType: 'single', columnModelId: column1.columnModelId }]
            });
            const fixture = createTestDocument({ column1, column2, structColumnShareModels: [structModel] });
            refreshBudget(fixture.erdDocument);

            const callback = getStructToolCallback(documentResource, 'list-struct-column-shares');
            const result = await callback({ documentId: TEST_DOC_ID });
            const response = extractStructuredContent(result);

            expect(response.items).toHaveLength(1);
            expect(response.items[0].structColumnShareModelId).toBe(structModel.structShareModelId);
        });

        test('find-struct-column-share で詳細1件を取得できる', async () => {
            const structModel = new StructColumnShareModel({
                physicalName: 'address',
                columnEntries: [{ modelType: 'single', columnModelId: column1.columnModelId }]
            });
            const fixture = createTestDocument({ column1, column2, structColumnShareModels: [structModel] });
            refreshBudget(fixture.erdDocument);

            const callback = getStructToolCallback(documentResource, 'find-struct-column-share');
            const result = await callback({ documentId: TEST_DOC_ID, structColumnShareModelId: structModel.structShareModelId });
            const response = extractStructuredContent(result);

            expect(response.structColumnShareModelId).toBe(structModel.structShareModelId);
            expect(response.columnName.physical).toBe('address');
        });

        test('update-struct-column-share で部分更新ができる', async () => {
            const structModel = new StructColumnShareModel({
                physicalName: 'address',
                columnEntries: [{ modelType: 'single', columnModelId: column1.columnModelId }]
            });
            const fixture = createTestDocument({ column1, column2, structColumnShareModels: [structModel] });
            refreshBudget(fixture.erdDocument);

            const callback = getStructToolCallback(documentResource, 'update-struct-column-share');
            const result = await callback({
                documentId: TEST_DOC_ID,
                structColumnShareModelId: structModel.structShareModelId,
                structColumnShare: { isArray: true }
            });
            const response = extractStructuredContent(result);

            expect(response.isArray).toBe(true);
            expect(response.columnName.physical).toBe('address'); // 未指定フィールドは維持される
        });

        test('delete-struct-column-share で struct を削除できる', async () => {
            const structModel = new StructColumnShareModel({
                physicalName: 'address',
                columnEntries: [{ modelType: 'single', columnModelId: column1.columnModelId }]
            });
            const fixture = createTestDocument({ column1, column2, structColumnShareModels: [structModel] });
            refreshBudget(fixture.erdDocument);

            const callback = getStructToolCallback(documentResource, 'delete-struct-column-share');
            const result = await callback({ documentId: TEST_DOC_ID, structColumnShareModelId: structModel.structShareModelId });
            const response = extractStructuredContent(result);

            expect(response.success).toBe(true);
            expect(erdDocument.findStructColumnShareModel(structModel.structShareModelId)).toBeNull();
        });

        test('create-struct-column-share でネスト struct (structColumnShareModelId ref) を作成できる', async () => {
            const innerStruct = new StructColumnShareModel({
                physicalName: 'inner',
                columnEntries: [{ modelType: 'single', columnModelId: column1.columnModelId }]
            });
            const fixture = createTestDocument({ column1, column2, structColumnShareModels: [innerStruct] });
            refreshBudget(fixture.erdDocument);

            const callback = getStructToolCallback(documentResource, 'create-struct-column-share');
            const result = await callback({
                documentId: TEST_DOC_ID,
                structColumnShare: {
                    columnName: { physical: 'outer' },
                    columns: [
                        { columnId: column2.columnModelId },
                        { structColumnShareModelId: innerStruct.structShareModelId }
                    ]
                }
            });

            const response = extractStructuredContent(result);
            expect(response.columns).toHaveLength(2);

            const nestedEntry = response.columns.find(
                (entry: { modelType: string }) => (entry.modelType === 'struct')
            );
            expect(nestedEntry).toBeDefined();
            expect(nestedEntry.structColumnShareModelId).toBe(innerStruct.structShareModelId);

            // ネストメンバーはラッパー ColumnModel (single エントリ) として生成されている
            const outerStruct = erdDocument.findStructColumnShareModel(response.structColumnShareModelId)!;
            const wrapperEntry = outerStruct.columnEntries.find(entry =>
                (entry.modelType === 'single') && (entry.columnModelId === nestedEntry.columnId));
            expect(wrapperEntry).toBeDefined();
            const wrapperColumn = erdDocument.findColumnModel(nestedEntry.columnId);
            expect(wrapperColumn?.entityType).toBe('struct');
            expect((wrapperColumn != null) && ColumnModel.isStructColumn(wrapperColumn) && wrapperColumn.structShareModelId)
                .toBe(innerStruct.structShareModelId);
        });
    });

    describe('バリデーション', () => {
        test('存在しない columnId を参照すると invalid params エラー', async () => {
            const callback = getStructToolCallback(documentResource, 'create-struct-column-share');

            await expect(callback({
                documentId: TEST_DOC_ID,
                structColumnShare: {
                    columnName: { physical: 'address' },
                    columns: [{ columnId: 'not-exist-column-id' }]
                }
            })).rejects.toThrow();
        });

        test('supportsStructType が false (postgres) のドキュメントでは create がエラーになる', async () => {
            const fixture = createTestDocument({ databaseType: 'postgres' });
            refreshBudget(fixture.erdDocument);

            const callback = getStructToolCallback(documentResource, 'create-struct-column-share');

            await expect(callback({
                documentId: TEST_DOC_ID,
                structColumnShare: {
                    columnName: { physical: 'address' },
                    columns: [{ columnId: fixture.column1.columnModelId }]
                }
            })).rejects.toThrow();
        });

        test('自己参照の循環はエラーになる', async () => {
            // struct A を作成後、update で A 自身を members に含めようとする
            const structA = new StructColumnShareModel({
                physicalName: 'struct_a',
                columnEntries: [{ modelType: 'single', columnModelId: column1.columnModelId }]
            });
            const fixture = createTestDocument({ column1, column2, structColumnShareModels: [structA] });
            refreshBudget(fixture.erdDocument);

            const callback = getStructToolCallback(documentResource, 'update-struct-column-share');

            await expect(callback({
                documentId: TEST_DOC_ID,
                structColumnShareModelId: structA.structShareModelId,
                structColumnShare: {
                    columns: [{ structColumnShareModelId: structA.structShareModelId }]
                }
            })).rejects.toThrow(/Circular struct reference/);
        });

        test('A→B→A の間接循環はエラーになる', async () => {
            const structB = new StructColumnShareModel({
                physicalName: 'struct_b',
                columnEntries: [{ modelType: 'single', columnModelId: column1.columnModelId }]
            });
            const wrapperForB = new StructColumnModel({ structShareModelId: structB.structShareModelId });
            const structA = new StructColumnShareModel({
                physicalName: 'struct_a',
                columnEntries: [{ modelType: 'single', columnModelId: wrapperForB.columnModelId }]
            });
            const fixture = createTestDocument({
                column1, column2,
                structColumnShareModels: [structA, structB],
                extraColumns: [wrapperForB]
            });
            refreshBudget(fixture.erdDocument);

            const callback = getStructToolCallback(documentResource, 'update-struct-column-share');

            // structB の members に structA を追加 → A -> B -> A の循環
            await expect(callback({
                documentId: TEST_DOC_ID,
                structColumnShareModelId: structB.structShareModelId,
                structColumnShare: {
                    columns: [
                        { columnId: column1.columnModelId },
                        { structColumnShareModelId: structA.structShareModelId }
                    ]
                }
            })).rejects.toThrow(/Circular struct reference/);
        });
    });

    describe('add-struct-column-to-table / remove-struct-column-from-table', () => {
        test('add-struct-column-to-table でテーブルに struct エントリを追加できる (position 指定)', async () => {
            const structModel = new StructColumnShareModel({
                physicalName: 'address',
                columnEntries: [{ modelType: 'single', columnModelId: column1.columnModelId }]
            });
            const fixture = createTestDocument({ column1, column2, structColumnShareModels: [structModel] });
            refreshBudget(fixture.erdDocument);

            const callback = getStructToolCallback(documentResource, 'add-struct-column-to-table');
            await callback({
                documentId: TEST_DOC_ID,
                tableId: TEST_TABLE_ID,
                structColumnShareModelId: structModel.structShareModelId,
                position: { type: 'start' }
            });

            const updatedTable = erdDocument.findTableViewModel(TEST_TABLE_ID)!;
            const firstEntry = updatedTable.tableModel.columnEntries[0];
            expect(firstEntry.modelType).toBe('single');
            const wrapperColumn = (firstEntry.modelType === 'single')
                ? erdDocument.findColumnModel(firstEntry.columnModelId) : null;
            expect(wrapperColumn).not.toBeNull();
            expect(wrapperColumn!.entityType).toBe('struct');
            expect(ColumnModel.isStructColumn(wrapperColumn!) && wrapperColumn!.structShareModelId)
                .toBe(structModel.structShareModelId);
        });

        test('add-struct-column-to-table で before 指定 (columnId anchor) が機能する', async () => {
            const structModel = new StructColumnShareModel({
                physicalName: 'address',
                columnEntries: [{ modelType: 'single', columnModelId: column1.columnModelId }]
            });
            const fixture = createTestDocument({ column1, column2, structColumnShareModels: [structModel] });
            refreshBudget(fixture.erdDocument);

            const callback = getStructToolCallback(documentResource, 'add-struct-column-to-table');
            await callback({
                documentId: TEST_DOC_ID,
                tableId: TEST_TABLE_ID,
                structColumnShareModelId: structModel.structShareModelId,
                position: { type: 'before', columnId: column2.columnModelId }
            });

            const updatedTable = erdDocument.findTableViewModel(TEST_TABLE_ID)!;
            const columns = updatedTable.tableModel.columnEntries;
            const structIndex = columns.findIndex(column => {
                if (column.modelType !== 'single') {
                    return false;
                }
                const columnModel = erdDocument.findColumnModel(column.columnModelId);
                return (columnModel != null) && (columnModel.entityType === 'struct');
            });
            const column2Index = columns.findIndex(column =>
                (column.modelType === 'single') && (column.columnModelId === column2.columnModelId));
            expect(column2Index).toBe(structIndex + 1);
        });

        test('同一テーブルへの重複追加はエラーになる', async () => {
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

            const callback = getStructToolCallback(documentResource, 'add-struct-column-to-table');

            await expect(callback({
                documentId: TEST_DOC_ID,
                tableId: TEST_TABLE_ID,
                structColumnShareModelId: structModel.structShareModelId,
                position: { type: 'end' }
            })).rejects.toThrow();
        });

        test('remove-struct-column-from-table でテーブルから struct エントリを除去できる (struct 自体は残る)', async () => {
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

            const callback = getStructToolCallback(documentResource, 'remove-struct-column-from-table');
            await callback({
                documentId: TEST_DOC_ID,
                tableId: TEST_TABLE_ID,
                structColumnShareModelId: structModel.structShareModelId
            });

            const updatedTable = erdDocument.findTableViewModel(TEST_TABLE_ID)!;
            expect(updatedTable.tableModel.columnEntries.some(column =>
                (column.modelType === 'single') && (column.columnModelId === wrapperColumn.columnModelId)
            )).toBe(false);
            // ラッパー ColumnModel 自体も自動削除される
            expect(erdDocument.findColumnModel(wrapperColumn.columnModelId)).toBeNull();
            // struct モデル自体は残っている
            expect(erdDocument.findStructColumnShareModel(structModel.structShareModelId)).not.toBeNull();
        });
    });

    describe('reorder-columns-in-table (struct 対応)', () => {
        test('struct エントリを移動できる', async () => {
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
                    { modelType: 'single', columnModelId: column1.columnModelId },
                    { modelType: 'single', columnModelId: column2.columnModelId },
                    { modelType: 'single', columnModelId: wrapperColumn.columnModelId },
                ],
            });
            refreshBudget(fixture.erdDocument);

            const callback = getColumnToolCallback(documentResource, 'reorder-columns-in-table');
            await callback({
                documentId: TEST_DOC_ID,
                tableId: TEST_TABLE_ID,
                reorders: [
                    { structColumnShareModelId: structModel.structShareModelId, position: { type: 'start' } }
                ]
            });

            const updatedTable = erdDocument.findTableViewModel(TEST_TABLE_ID)!;
            expect(updatedTable.tableModel.columnEntries[0]).toEqual({
                modelType: 'single', columnModelId: wrapperColumn.columnModelId
            });
        });
    });

    describe('find-table columnDefinitions', () => {
        test('struct エントリが columnDefinitions に含まれる', async () => {
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
                    { modelType: 'single', columnModelId: column1.columnModelId },
                    { modelType: 'single', columnModelId: wrapperColumn.columnModelId },
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
            expect(structDefinition.structColumnShareModelId).toBe(structModel.structShareModelId);
        });
    });
});
