import { vi, describe, test, expect, beforeEach } from 'vitest';

// vscode モジュールをモック（DocumentResource が依存）
vi.mock('vscode', () => ({}));

import { DocumentResource } from '~/agent-tools/DocumentResource';
import DocumentBudget from '~/agent-tools/DocumentBudget';
import { mcpRegisterErdDocument } from '~/agent-tools/tools/documents';
import ColorValue from '~/models/ColorValue';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import DisplayColumnStyle from '~/models/DisplayColumnStyle';
import DisplayNameStyle from '~/models/DisplayNameStyle';
import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';
import TableModel from '~/models/database/TableModel';
import TableViewModel from '~/models/TableViewModel';

// ---- テスト用フィクスチャ ----

const TEST_TABLE_ID = 'test-table-id-001';
const TEST_DOC_ID = 'testdoc12345678';

const testColors = {
    background: new ColorValue({ red: 255, green: 255, blue: 255 }),
    foreground: new ColorValue({ red: 0, green: 0, blue: 0 }),
};

const createTestTable = (tableModelId: string): TableViewModel => {
    const tableModel = new TableModel({ tableModelId, physicalName: 'test_table' });
    return new TableViewModel({
        tableModel,
        corner: { top: 0, left: 0 },
        headerColor: testColors,
    });
};

const createTestDocument = (): ErdDocument => {
    const tableView = createTestTable(TEST_TABLE_ID);
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

const CREATED_FILE_URI = 'file:///test/created.erd';

const createMockDocumentResource = (budget: DocumentBudget | null) => {
    return {
        findById: vi.fn((id: string) => (id === TEST_DOC_ID ? budget : null)),
        notify: vi.fn(),
        create: vi.fn(async () => {
            return { documentId: TEST_DOC_ID, fileUri: CREATED_FILE_URI };
        }),
    } as unknown as DocumentResource;
};

// ---- ヘルパー: ツールコールバック取得 ----

type ToolCallback = (args: Record<string, unknown>) => Promise<unknown>;

const getToolCallback = (documentResource: DocumentResource, toolName: string): ToolCallback => {
    const config = mcpRegisterErdDocument(documentResource);
    const toolEntry = config.tools.find(tool => tool[0] === toolName);
    if (!toolEntry) throw new Error(`Tool "${toolName}" not found`);
    return toolEntry[2] as ToolCallback;
};

// ---- テスト ----

describe('documents MCP tools', () => {
    let erdDocument: ErdDocument;
    let budget: DocumentBudget;
    let documentResource: DocumentResource;

    beforeEach(() => {
        erdDocument = createTestDocument();
        budget = createDocumentBudget(erdDocument);
        documentResource = createMockDocumentResource(budget);
    });

    describe('update-document', () => {
        test('displayColumnStyle を指定すると ErdSettingModel に反映される', async () => {
            const callback = getToolCallback(documentResource, 'update-document');
            await callback({
                documentId: TEST_DOC_ID,
                document: { displayColumnStyle: 'pk' },
            });

            const notifyMock = documentResource.notify as unknown as ReturnType<typeof vi.fn>;
            const nextDocument = notifyMock.mock.calls[0][1] as ErdDocument;
            expect(nextDocument.erdSettingModel.displayColumnStyle.equals(DisplayColumnStyle.ONLY_PK)).toBe(true);
        });

        test('displayNameStyle と displayColumnStyle を同時指定すると両方反映される', async () => {
            const callback = getToolCallback(documentResource, 'update-document');
            await callback({
                documentId: TEST_DOC_ID,
                document: { displayNameStyle: 'physical', displayColumnStyle: 'none' },
            });

            const notifyMock = documentResource.notify as unknown as ReturnType<typeof vi.fn>;
            const nextDocument = notifyMock.mock.calls[0][1] as ErdDocument;
            expect(nextDocument.erdSettingModel.displayNameStyle.equals(DisplayNameStyle.PHYSICAL)).toBe(true);
            expect(nextDocument.erdSettingModel.displayColumnStyle.equals(DisplayColumnStyle.NONE)).toBe(true);
        });

        test('documentName のみ指定した場合は表示設定が変わらない', async () => {
            const callback = getToolCallback(documentResource, 'update-document');
            await callback({
                documentId: TEST_DOC_ID,
                document: { documentName: 'renamed' },
            });

            const notifyMock = documentResource.notify as unknown as ReturnType<typeof vi.fn>;
            const nextDocument = notifyMock.mock.calls[0][1] as ErdDocument;
            expect(nextDocument.documentName).toBe('renamed');
            expect(nextDocument.erdSettingModel.displayNameStyle.equals(erdDocument.erdSettingModel.displayNameStyle))
                .toBe(true);
            expect(nextDocument.erdSettingModel.displayColumnStyle.equals(erdDocument.erdSettingModel.displayColumnStyle))
                .toBe(true);
        });
    });

    describe('create-document', () => {
        const fetchCreatedDocument = (resource: DocumentResource): ErdDocument => {
            const createMock = resource.create as unknown as ReturnType<typeof vi.fn>;
            return createMock.mock.calls[0][1] as ErdDocument;
        };

        test('documentName 未指定時は拡張子を除いたファイル名が使われる', async () => {
            const callback = getToolCallback(documentResource, 'create-document');
            await callback({ filePath: '/tmp/order_book.erd', databaseType: 'postgres' });

            const createMock = documentResource.create as unknown as ReturnType<typeof vi.fn>;
            expect(createMock.mock.calls[0][0]).toBe('/tmp/order_book.erd');
            expect(fetchCreatedDocument(documentResource).documentName).toBe('order_book');
        });

        test('file URI で指定してもファイル名から documentName を導出する', async () => {
            const callback = getToolCallback(documentResource, 'create-document');
            await callback({ filePath: 'file:///tmp/order_book.erd', databaseType: 'postgres' });

            const createMock = documentResource.create as unknown as ReturnType<typeof vi.fn>;
            expect(createMock.mock.calls[0][0]).toBe('/tmp/order_book.erd');
            expect(fetchCreatedDocument(documentResource).documentName).toBe('order_book');
        });

        test('documentName 指定時は前後の空白を除いた値が使われる', async () => {
            const callback = getToolCallback(documentResource, 'create-document');
            await callback({
                filePath: '/tmp/order_book.erd',
                databaseType: 'postgres',
                documentName: '  Order Book  ',
            });

            expect(fetchCreatedDocument(documentResource).documentName).toBe('Order Book');
        });

        test('databaseType が新規ドキュメントに反映される', async () => {
            const callback = getToolCallback(documentResource, 'create-document');
            await callback({ filePath: '/tmp/analytics.erd', databaseType: 'bigquery' });

            const createdDocument = fetchCreatedDocument(documentResource);
            expect(createdDocument.databaseSettingModel.databaseType).toBe('bigquery');
            expect(createdDocument.getDatabase().name).toBe('BigQuery');
        });

        test('作成したドキュメントは空で、レスポンスに documentId が含まれる', async () => {
            const callback = getToolCallback(documentResource, 'create-document');
            const result = await callback({
                filePath: '/tmp/order_book.erd',
                databaseType: 'mysql',
            }) as { content: { text: string }[] };
            const response = JSON.parse(result.content[0].text);

            expect(fetchCreatedDocument(documentResource).getTableViewModels()).toHaveLength(0);
            expect(response.documentId).toBe(TEST_DOC_ID);
            expect(response.filePath).toBe(CREATED_FILE_URI);
            expect(response.documentName).toBe('order_book');
            expect(response.databaseName).toBe('MySQL');
        });

        test('拡張子が .erd でない場合はエラーになり、作成されない', async () => {
            const callback = getToolCallback(documentResource, 'create-document');

            await expect(callback({ filePath: '/tmp/order_book.txt', databaseType: 'mysql' }))
                .rejects.toThrow();
            expect(documentResource.create).not.toHaveBeenCalled();
        });
    });

    describe('find-document', () => {
        test('レスポンスの setting に現在の表示設定が含まれる', async () => {
            const settingUpdated = erdDocument.updateErdSetting(
                erdDocument.erdSettingModel.update({
                    displayNameStyle: DisplayNameStyle.LOGICAL,
                    displayColumnStyle: DisplayColumnStyle.PK_OR_FK,
                })
            );
            const settingBudget = createDocumentBudget(settingUpdated);
            const settingResource = createMockDocumentResource(settingBudget);

            const callback = getToolCallback(settingResource, 'find-document');
            const result = await callback({ documentId: TEST_DOC_ID }) as { content: { text: string }[] };
            const response = JSON.parse(result.content[0].text);

            expect(response.setting.displayNameStyle).toBe('logical');
            expect(response.setting.displayColumnStyle).toBe('pk_fk');
        });
    });
});
