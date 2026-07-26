import { vi, describe, test, expect, beforeEach } from 'vitest';

vi.mock('vscode', () => ({}));

import { DocumentResource } from '~/agent-tools/DocumentResource';
import DocumentBudget from '~/agent-tools/DocumentBudget';
import { mcpRegisterTable } from '~/agent-tools/tools/tables';
import ColorValue from '~/models/ColorValue';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';
import ColumnEntry from '~/models/database/ColumnEntry';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import SimpleColumnModel from '~/models/database/SimpleColumnModel';
import TableModel from '~/models/database/TableModel';
import TableViewModel from '~/models/TableViewModel';

// ---- フィクスチャ ----

const TEST_TABLE_ID = 'test-table-id-001';
const TEST_DOC_ID = 'testdoc12345678';

const testColors = {
    background: new ColorValue({ red: 255, green: 255, blue: 255 }),
    foreground: new ColorValue({ red: 0, green: 0, blue: 0 }),
};

const createTestTableAt = (tableModelId: string, left: number, top: number): TableViewModel => {
    const tableModel = new TableModel({ tableModelId, physicalName: 'test_table' });
    return new TableViewModel({ tableModel, corner: { top, left }, headerColor: testColors });
};

const createTestDocument = (tableView: TableViewModel): ErdDocument => {
    return ErdDocument.create({
        documentName: 'test',
        erdSettingModel: ErdSettingModel.create('test'),
        databaseSettingModel: DatabaseSettingModel.create('mysql'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [tableView],
    });
};

const createDocumentBudget = (erdDocument: ErdDocument): DocumentBudget => {
    return new DocumentBudget({
        documentId: TEST_DOC_ID,
        uri: 'file:///test/test.erd',
        erdDocument,
        rectangles: new Map(),
    });
};

const createMockDocumentResource = (budget: DocumentBudget) => {
    return {
        findById: vi.fn((id: string) => (id === TEST_DOC_ID ? budget : null)),
        notify: vi.fn(),
    } as unknown as DocumentResource;
};

type ToolCallback = (args: Record<string, unknown>) => Promise<unknown>;

const getToolCallback = (documentResource: DocumentResource, toolName: string): ToolCallback => {
    const config = mcpRegisterTable(documentResource);
    const toolEntry = config.tools.find(tool => tool[0] === toolName);
    if (!toolEntry) throw new Error(`Tool "${toolName}" not found`);
    return toolEntry[2] as ToolCallback;
};

// ---- テスト ----

describe('tables MCP tools', () => {
    let tableView: TableViewModel;
    let erdDocument: ErdDocument;
    let budget: DocumentBudget;
    let documentResource: DocumentResource;

    beforeEach(() => {
        tableView = createTestTableAt(TEST_TABLE_ID, 100, 200);
        erdDocument = createTestDocument(tableView);
        budget = createDocumentBudget(erdDocument);
        documentResource = createMockDocumentResource(budget);
    });

    describe('update-table (H1: x=0, y=0 バグ修正)', () => {
        test('x=0, y=0 を指定すると座標が 0 に更新される', async () => {
            const callback = getToolCallback(documentResource, 'update-table');
            let updatedDocument: ErdDocument | null = null;
            vi.mocked(documentResource.notify).mockImplementation((_id, doc) => {
                updatedDocument = doc as ErdDocument;
            });

            await callback({
                documentId: TEST_DOC_ID,
                tableId: TEST_TABLE_ID,
                table: {
                    view: {
                        position: { x: 0, y: 0 }
                    }
                }
            });

            expect(updatedDocument).not.toBeNull();
            const updatedTable = updatedDocument!.findTableViewModel(TEST_TABLE_ID);
            expect(updatedTable).not.toBeNull();
            // 0,0 に更新されること（以前の 100,200 にフォールバックしないこと）
            expect(updatedTable!.corner.left).toBe(0);
            expect(updatedTable!.corner.top).toBe(0);
        });

        test('x=0 のみ指定すると x だけ 0 になり y は維持される', async () => {
            const callback = getToolCallback(documentResource, 'update-table');
            let updatedDocument: ErdDocument | null = null;
            vi.mocked(documentResource.notify).mockImplementation((_id, doc) => {
                updatedDocument = doc as ErdDocument;
            });

            await callback({
                documentId: TEST_DOC_ID,
                tableId: TEST_TABLE_ID,
                table: {
                    view: {
                        position: { x: 0 }
                    }
                }
            });

            const updatedTable = updatedDocument!.findTableViewModel(TEST_TABLE_ID);
            expect(updatedTable!.corner.left).toBe(0);
            expect(updatedTable!.corner.top).toBe(200); // y は変更なし
        });

        test('y=0 のみ指定すると y だけ 0 になり x は維持される', async () => {
            const callback = getToolCallback(documentResource, 'update-table');
            let updatedDocument: ErdDocument | null = null;
            vi.mocked(documentResource.notify).mockImplementation((_id, doc) => {
                updatedDocument = doc as ErdDocument;
            });

            await callback({
                documentId: TEST_DOC_ID,
                tableId: TEST_TABLE_ID,
                table: {
                    view: {
                        position: { y: 0 }
                    }
                }
            });

            const updatedTable = updatedDocument!.findTableViewModel(TEST_TABLE_ID);
            expect(updatedTable!.corner.left).toBe(100); // x は変更なし
            expect(updatedTable!.corner.top).toBe(0);
        });

        test('通常の座標値に更新できる', async () => {
            const callback = getToolCallback(documentResource, 'update-table');
            let updatedDocument: ErdDocument | null = null;
            vi.mocked(documentResource.notify).mockImplementation((_id, doc) => {
                updatedDocument = doc as ErdDocument;
            });

            await callback({
                documentId: TEST_DOC_ID,
                tableId: TEST_TABLE_ID,
                table: {
                    view: {
                        position: { x: 300, y: 400 }
                    }
                }
            });

            const updatedTable = updatedDocument!.findTableViewModel(TEST_TABLE_ID);
            expect(updatedTable!.corner.left).toBe(300);
            expect(updatedTable!.corner.top).toBe(400);
        });

        test('position を省略すると座標は変更されない', async () => {
            const callback = getToolCallback(documentResource, 'update-table');
            let updatedDocument: ErdDocument | null = null;
            vi.mocked(documentResource.notify).mockImplementation((_id, doc) => {
                updatedDocument = doc as ErdDocument;
            });

            await callback({
                documentId: TEST_DOC_ID,
                tableId: TEST_TABLE_ID,
                table: {
                    view: {}
                }
            });

            const updatedTable = updatedDocument!.findTableViewModel(TEST_TABLE_ID);
            expect(updatedTable!.corner.left).toBe(100);
            expect(updatedTable!.corner.top).toBe(200);
        });
    });

    describe('capability ゲート (add-unique-constraint / add-table-index)', () => {
        const createBigQueryTestDocument = (): ErdDocument => {
            const columnShare1 = new ColumnShareModel({
                columnShareModelId: 'share-col-1', physicalName: 'col1', logicalName: 'col1',
                columnType: DatabaseSettingModel.create('bigquery').findColumnType(17)!
            });
            const columnShare2 = new ColumnShareModel({
                columnShareModelId: 'share-col-2', physicalName: 'col2', logicalName: 'col2',
                columnType: DatabaseSettingModel.create('bigquery').findColumnType(17)!
            });
            const column1 = new SimpleColumnModel({ columnModelId: 'col-1', columnShareModelId: 'share-col-1' });
            const column2 = new SimpleColumnModel({ columnModelId: 'col-2', columnShareModelId: 'share-col-2' });

            const tableModel = new TableModel({
                tableModelId: TEST_TABLE_ID,
                physicalName: 'test_table',
                columnEntries: [
                    { modelType: 'single', columnModelId: 'col-1' },
                    { modelType: 'single', columnModelId: 'col-2' }
                ] as ColumnEntry[]
            });
            const bigQueryTableView = new TableViewModel({ tableModel, corner: { top: 0, left: 0 }, headerColor: testColors });

            return ErdDocument.create({
                documentName: 'test-bigquery',
                erdSettingModel: ErdSettingModel.create('test-bigquery'),
                databaseSettingModel: DatabaseSettingModel.create('bigquery'),
                schemaConfig: DbSchemaConfig.create(),
                tableViewModels: [bigQueryTableView],
                columnModels: [column1, column2],
                columnShareModels: [columnShare1, columnShare2]
            });
        };

        test('supportsUniqueKey が false (BigQuery) では add-unique-constraint がエラーになる', async () => {
            const bigQueryBudget = createDocumentBudget(createBigQueryTestDocument());
            const bigQueryResource = createMockDocumentResource(bigQueryBudget);
            const callback = getToolCallback(bigQueryResource, 'add-unique-constraint');

            await expect(callback({
                documentId: TEST_DOC_ID,
                tableId: TEST_TABLE_ID,
                uniqueConstraints: [{
                    uniqueConstraint: { uniqueKeys: [{ columnId: 'col-1' }, { columnId: 'col-2' }] }
                }]
            })).rejects.toThrow();
        });

        test('supportsIndex が false (BigQuery) では add-table-index がエラーになる', async () => {
            const bigQueryBudget = createDocumentBudget(createBigQueryTestDocument());
            const bigQueryResource = createMockDocumentResource(bigQueryBudget);
            const callback = getToolCallback(bigQueryResource, 'add-table-index');

            await expect(callback({
                documentId: TEST_DOC_ID,
                tableId: TEST_TABLE_ID,
                tableIndexes: [{
                    tableIndex: { indexColumns: [{ columnId: 'col-1' }] }
                }]
            })).rejects.toThrow();
        });
    });
});
