import { vi, describe, test, expect, beforeEach } from 'vitest';

// vscode モジュールをモック（DocumentResource が依存）
vi.mock('vscode', () => ({}));

import { DocumentResource } from '~/agent-tools/DocumentResource';
import DocumentBudget from '~/agent-tools/DocumentBudget';
import { mcpRegisterPerspective } from '~/agent-tools/tools/perspectives';
import ColorValue from '~/models/ColorValue';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';
import MemoViewModel from '~/models/MemoViewModel';
import PerspectiveModel from '~/models/PerspectiveModel';
import RectangleViewModel from '~/models/RectangleViewModel';
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

const createTestMemo = (): MemoViewModel => {
    const rect = new RectangleViewModel({ positionX: 0, positionY: 0, width: 100, height: 50 });
    return MemoViewModel.create(rect, testColors);
};

const createTestDocument = (testMemo: MemoViewModel): ErdDocument => {
    const tableView = createTestTable(TEST_TABLE_ID);
    return ErdDocument.create({
        documentName: 'test',
        erdSettingModel: ErdSettingModel.create('test'),
        databaseSettingModel: DatabaseSettingModel.create('mysql'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [tableView],
        foregroundMemoViewModels: [testMemo],
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

const createMockDocumentResource = (budget: DocumentBudget | null) => {
    return {
        findById: vi.fn((id: string) => (id === TEST_DOC_ID ? budget : null)),
        notify: vi.fn(),
    } as unknown as DocumentResource;
};

// ---- ヘルパー: ツールコールバック取得 ----

type ToolCallback = (args: Record<string, unknown>) => Promise<unknown>;

const getToolCallback = (documentResource: DocumentResource, toolName: string): ToolCallback => {
    const config = mcpRegisterPerspective(documentResource);
    const toolEntry = config.tools.find(tool => tool[0] === toolName);
    if (!toolEntry) throw new Error(`Tool "${toolName}" not found`);
    return toolEntry[2] as ToolCallback;
};

// ---- テスト ----

describe('perspectives MCP tools', () => {
    let testMemo: MemoViewModel;
    let erdDocument: ErdDocument;
    let budget: DocumentBudget;
    let documentResource: DocumentResource;

    beforeEach(() => {
        testMemo = createTestMemo();
        erdDocument = createTestDocument(testMemo);
        budget = createDocumentBudget(erdDocument);
        documentResource = createMockDocumentResource(budget);
    });

    // ----------------------------------------------------------------
    // add-perspective
    // ----------------------------------------------------------------

    describe('add-perspective', () => {
        test('有効な tableId を containIds に指定すると成功する', async () => {
            const callback = getToolCallback(documentResource, 'add-perspective');
            const result = await callback({
                documentId: TEST_DOC_ID,
                perspective: {
                    perspectiveName: 'Test Perspective',
                    containIds: [TEST_TABLE_ID],
                },
            });
            expect(result).toBeDefined();
        });

        test('有効な memoId を containIds に指定すると成功する', async () => {
            const callback = getToolCallback(documentResource, 'add-perspective');
            const result = await callback({
                documentId: TEST_DOC_ID,
                perspective: {
                    perspectiveName: 'Test Perspective',
                    containIds: [testMemo.memoId],
                },
            });
            expect(result).toBeDefined();
        });

        test('空の containIds では成功する', async () => {
            const callback = getToolCallback(documentResource, 'add-perspective');
            const result = await callback({
                documentId: TEST_DOC_ID,
                perspective: {
                    perspectiveName: 'Test Perspective',
                    containIds: [],
                },
            });
            expect(result).toBeDefined();
        });

        test('存在しない id を containIds に指定するとエラーになる (M3)', async () => {
            const callback = getToolCallback(documentResource, 'add-perspective');
            await expect(
                callback({
                    documentId: TEST_DOC_ID,
                    perspective: {
                        perspectiveName: 'Test Perspective',
                        containIds: ['non-existent-id'],
                    },
                })
            ).rejects.toThrow('containIds not found as table or memo: non-existent-id');
        });
    });

    // ----------------------------------------------------------------
    // update-perspective
    // ----------------------------------------------------------------

    describe('update-perspective', () => {
        let existingPerspective: PerspectiveModel;

        beforeEach(() => {
            // 既存パースペクティブを持つドキュメントを用意
            existingPerspective = PerspectiveModel.create('Existing Perspective')
                .updateAllContainIds([TEST_TABLE_ID]);
            const setting = erdDocument.erdSettingModel.updatePerspective(existingPerspective);
            erdDocument = ErdDocument.create({
                documentName: erdDocument.documentName,
                erdSettingModel: setting,
                databaseSettingModel: erdDocument.databaseSettingModel,
                schemaConfig: erdDocument.schemaConfig,
                tableViewModels: erdDocument.getTableViewModels(),
                foregroundMemoViewModels: erdDocument.getMemoViewModels().frontMemos,
                backgroundMemoViewModels: erdDocument.getMemoViewModels().backMemos,
            });
            budget = createDocumentBudget(erdDocument);
            documentResource = createMockDocumentResource(budget);
        });

        test('addingIds と removingIds に同じ id を指定すると id が残る (H2: 削除→追加)', async () => {
            const callback = getToolCallback(documentResource, 'update-perspective');
            // notify が呼ばれたときに渡されたドキュメントを取得
            let updatedDocument: ErdDocument | null = null;
            vi.mocked(documentResource.notify).mockImplementation((_id, doc) => {
                updatedDocument = doc as ErdDocument;
            });

            await callback({
                documentId: TEST_DOC_ID,
                perspectiveId: existingPerspective.perspectiveId,
                updating: {
                    addingIds: [TEST_TABLE_ID],
                    removingIds: [TEST_TABLE_ID],
                },
            });

            expect(updatedDocument).not.toBeNull();
            const updatedPerspective = updatedDocument!.erdSettingModel
                .findPerspectiveModel(existingPerspective.perspectiveId);
            expect(updatedPerspective).not.toBeNull();
            // 削除後に追加されるので、最終的に含まれる
            expect(updatedPerspective!.getContainIds()).toContain(TEST_TABLE_ID);
        });

        test('removingIds のみで id が除去される', async () => {
            const callback = getToolCallback(documentResource, 'update-perspective');
            let updatedDocument: ErdDocument | null = null;
            vi.mocked(documentResource.notify).mockImplementation((_id, doc) => {
                updatedDocument = doc as ErdDocument;
            });

            await callback({
                documentId: TEST_DOC_ID,
                perspectiveId: existingPerspective.perspectiveId,
                updating: {
                    removingIds: [TEST_TABLE_ID],
                },
            });

            const updatedPerspective = updatedDocument!.erdSettingModel
                .findPerspectiveModel(existingPerspective.perspectiveId);
            expect(updatedPerspective!.getContainIds()).not.toContain(TEST_TABLE_ID);
        });

        test('存在しない id を addingIds に指定するとエラーになる (M3)', async () => {
            const callback = getToolCallback(documentResource, 'update-perspective');
            await expect(
                callback({
                    documentId: TEST_DOC_ID,
                    perspectiveId: existingPerspective.perspectiveId,
                    updating: {
                        addingIds: ['non-existent-id'],
                    },
                })
            ).rejects.toThrow('addingIds not found as table or memo: non-existent-id');
        });
    });
});
