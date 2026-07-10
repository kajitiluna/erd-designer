import { vi, describe, test, expect, beforeEach } from 'vitest';

vi.mock('vscode', () => ({}));

import { DocumentResource } from '~/agent-tools/DocumentResource';
import DocumentBudget from '~/agent-tools/DocumentBudget';
import { mcpRegisterColumn } from '~/agent-tools/tools/columns';
import { mcpRegisterColumnStruct } from '~/agent-tools/tools/struct-types';
import ColorValue from '~/models/ColorValue';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';
import ColumnModel from '~/models/database/ColumnModel';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import ColumnStructModel from '~/models/database/ColumnStructModel';
import { findDatabaseColumns } from '~/models/database/columns';
import TableModel, { ColumnModelType } from '~/models/database/TableModel';
import TableViewModel from '~/models/TableViewModel';
import { DatabaseType } from '~/models/database/DatabaseType';

// ---- フィクスチャ ----

const TEST_TABLE_ID = 'test-table-id-001';
const TEST_DOC_ID = 'testdoc12345678';

const testColors = {
    background: new ColorValue({ red: 255, green: 255, blue: 255 }),
    foreground: new ColorValue({ red: 0, green: 0, blue: 0 }),
};

const findColumnType = (databaseType: DatabaseType, name: string) => {
    const columnType = findDatabaseColumns(databaseType).find(candidate => candidate.name === name);
    if (columnType == null) {
        throw new Error(`column type not found: ${name}`);
    }
    return columnType;
};

const STRUCT_COLUMN_TYPE = findColumnType('bigquery', 'struct');
const STRING_COLUMN_TYPE = findColumnType('bigquery', 'string');
const INT64_COLUMN_TYPE = findColumnType('bigquery', 'int64');

type FixtureOptions = {
    columnStructModels?: ColumnStructModel[];
    columnModels?: ColumnModel[];
    columnShareModels?: ColumnShareModel[];
    tableColumnModelIds?: string[];
};

// テーブルの columns には tableColumnModelIds のみを含め、struct のメンバーカラムは
// columnModels / columnShareModels 経由でのみ ErdDocument に登録する
// (create-ddl-struct.test.ts の buildStructDocument と同じ方針)。
const createTestDocument = ({
    columnStructModels = [], columnModels = [], columnShareModels = [], tableColumnModelIds = []
}: FixtureOptions): ErdDocument => {
    const tableModel = new TableModel({
        tableModelId: TEST_TABLE_ID,
        physicalName: 'test_table',
        columns: tableColumnModelIds.map(columnModelId => {
            return { modelType: 'single', columnModelId } as ColumnModelType;
        })
    });
    const tableView = new TableViewModel({ tableModel, corner: { top: 200, left: 100 }, headerColor: testColors });

    return ErdDocument.create({
        documentName: 'test',
        erdSettingModel: ErdSettingModel.create('test'),
        databaseSettingModel: DatabaseSettingModel.create('bigquery'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [tableView],
        columnStructModels,
        columnModels,
        columnShareModels
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

// 単一メンバーカラム (name: string) を持つ ColumnModel/ColumnShareModel のペアを作る
const buildMemberColumn = (columnModelId: string, columnShareModelId: string, physicalName: string) => {
    const columnShareModel = new ColumnShareModel({
        columnShareModelId,
        physicalName,
        logicalName: physicalName,
        columnType: STRING_COLUMN_TYPE
    });
    const columnModel = new ColumnModel({
        columnModelId,
        columnShareModelId,
        physicalName
    });
    return { columnModel, columnShareModel };
};

// ---- テスト ----

describe('struct-types MCP tools', () => {
    let erdDocument: ErdDocument;
    let budget: DocumentBudget;
    let documentResource: DocumentResource;

    const setDocument = (nextDocument: ErdDocument) => {
        erdDocument = nextDocument;
        budget = createDocumentBudget(erdDocument);
    };

    beforeEach(() => {
        const nameMember = buildMemberColumn('col-name', 'share-name', 'name');
        const ageMember = buildMemberColumn('col-age-src', 'share-age', 'age');
        const ageColumnShareModel = new ColumnShareModel({ ...ageMember.columnShareModel, columnType: INT64_COLUMN_TYPE });

        setDocument(createTestDocument({
            columnModels: [nameMember.columnModel, ageMember.columnModel],
            columnShareModels: [nameMember.columnShareModel, ageColumnShareModel],
            tableColumnModelIds: []
        }));
        documentResource = createMockDocumentResource(() => budget);
        vi.mocked(documentResource.notify).mockImplementation((_id, doc) => {
            setDocument(doc as ErdDocument);
        });
    });

    describe('create -> list / find -> update -> delete', () => {
        test('create-column-struct でメンバーカラムを参照する struct を作成できる', async () => {
            const createCallback = getStructToolCallback(documentResource, 'create-column-struct');

            const created = await createCallback({
                documentId: TEST_DOC_ID,
                columnStruct: {
                    structName: 'person',
                    columnIds: ['col-name', 'col-age-src'],
                    description: 'a person struct'
                }
            }) as { structuredContent: { columnStructId: string; structName: string; columns: unknown[] } };

            const structuredContent = created.structuredContent;
            expect(structuredContent.structName).toBe('person');
            expect(structuredContent.columns).toHaveLength(2);
            expect(documentResource.notify).toHaveBeenCalledTimes(1);

            const columnStructId = structuredContent.columnStructId;

            // list-column-structs
            const listCallback = getStructToolCallback(documentResource, 'list-column-structs');
            const listResult = await listCallback({ documentId: TEST_DOC_ID }) as { structuredContent: { items: unknown[] } };
            expect(listResult.structuredContent.items).toHaveLength(1);

            // find-column-struct
            const findCallback = getStructToolCallback(documentResource, 'find-column-struct');
            const findResult = await findCallback({
                documentId: TEST_DOC_ID, columnStructId
            }) as { structuredContent: { structName: string } };
            expect(findResult.structuredContent.structName).toBe('person');

            // update-column-struct
            const updateCallback = getStructToolCallback(documentResource, 'update-column-struct');
            const updateResult = await updateCallback({
                documentId: TEST_DOC_ID,
                columnStructId,
                columnStruct: { structName: 'person_v2' }
            }) as { structuredContent: { structName: string; columns: unknown[] } };
            expect(updateResult.structuredContent.structName).toBe('person_v2');
            expect(updateResult.structuredContent.columns).toHaveLength(2);

            // delete-column-struct
            const deleteCallback = getStructToolCallback(documentResource, 'delete-column-struct');
            const deleteResult = await deleteCallback({
                documentId: TEST_DOC_ID, columnStructId
            }) as { structuredContent: { success: boolean } };
            expect(deleteResult.structuredContent.success).toBe(true);

            const listAfterDelete = await listCallback({ documentId: TEST_DOC_ID }) as { structuredContent: { items: unknown[] } };
            expect(listAfterDelete.structuredContent.items).toHaveLength(0);
        });

        test('filter.columnIds で AND 条件によるフィルタが機能する', async () => {
            const createCallback = getStructToolCallback(documentResource, 'create-column-struct');
            await createCallback({
                documentId: TEST_DOC_ID,
                columnStruct: { structName: 'person', columnIds: ['col-name', 'col-age-src'] }
            });

            const listCallback = getStructToolCallback(documentResource, 'list-column-structs');

            const matched = await listCallback({
                documentId: TEST_DOC_ID, filter: { columnIds: ['col-name'] }
            }) as { structuredContent: { items: unknown[] } };
            expect(matched.structuredContent.items).toHaveLength(1);

            const unmatched = await listCallback({
                documentId: TEST_DOC_ID, filter: { columnIds: ['col-name', 'not-exist'] }
            }) as { structuredContent: { items: unknown[] } };
            expect(unmatched.structuredContent.items).toHaveLength(0);
        });
    });

    describe('存在しない columnIds でエラー', () => {
        test('create-column-struct: 存在しない columnId を含むとエラーになる', async () => {
            const createCallback = getStructToolCallback(documentResource, 'create-column-struct');

            await expect(createCallback({
                documentId: TEST_DOC_ID,
                columnStruct: { structName: 'invalid', columnIds: ['not-exist'] }
            })).rejects.toMatchObject({ message: expect.stringContaining('Column not found') });
        });

        test('update-column-struct: 存在しない columnId を含むとエラーになる', async () => {
            const createCallback = getStructToolCallback(documentResource, 'create-column-struct');
            const created = await createCallback({
                documentId: TEST_DOC_ID,
                columnStruct: { structName: 'person', columnIds: ['col-name'] }
            }) as { structuredContent: { columnStructId: string } };

            const updateCallback = getStructToolCallback(documentResource, 'update-column-struct');
            await expect(updateCallback({
                documentId: TEST_DOC_ID,
                columnStructId: created.structuredContent.columnStructId,
                columnStruct: { columnIds: ['not-exist'] }
            })).rejects.toMatchObject({ message: expect.stringContaining('Column not found') });
        });
    });

    describe('循環参照でエラー', () => {
        test('自己参照 (struct のメンバー自身の columnShare を同じ struct に向ける) はエラーになる', async () => {
            // struct-a を作成 (メンバーは col-name のみ)
            const createCallback = getStructToolCallback(documentResource, 'create-column-struct');
            const createdA = await createCallback({
                documentId: TEST_DOC_ID,
                columnStruct: { structName: 'struct-a', columnIds: ['col-name'] }
            }) as { structuredContent: { columnStructId: string } };
            const structAId = createdA.structuredContent.columnStructId;

            // col-name は既に struct-a のメンバーであるため、col-name の columnShare
            // (share-name) の columnStructId を struct-a 自身に向けようとすると自己参照エラーになる
            const updateColumnShareCallback = getColumnToolCallback(documentResource, 'update-column-share');
            await expect(updateColumnShareCallback({
                documentId: TEST_DOC_ID,
                columnShareId: 'share-name',
                columnShare: { columnTypeId: STRUCT_COLUMN_TYPE.id, columnStructId: structAId }
            })).rejects.toMatchObject({ message: expect.stringContaining('Circular STRUCT reference') });
        });

        test('A -> B -> A の循環はエラーになる', async () => {
            const createCallback = getStructToolCallback(documentResource, 'create-column-struct');

            // struct-a はメンバー col-name を持つ
            const createdA = await createCallback({
                documentId: TEST_DOC_ID,
                columnStruct: { structName: 'struct-a', columnIds: ['col-name'] }
            }) as { structuredContent: { columnStructId: string } };
            const structAId = createdA.structuredContent.columnStructId;

            // struct-b はメンバー col-age-src を持つ
            const createdB = await createCallback({
                documentId: TEST_DOC_ID,
                columnStruct: { structName: 'struct-b', columnIds: ['col-age-src'] }
            }) as { structuredContent: { columnStructId: string } };
            const structBId = createdB.structuredContent.columnStructId;

            // col-age-src (share-age) を struct 型に変え、columnStructId を struct-a に向ける
            // (struct-b のメンバーが struct-a を指す = struct-b -> struct-a)
            const updateColumnShareCallback = getColumnToolCallback(documentResource, 'update-column-share');
            await updateColumnShareCallback({
                documentId: TEST_DOC_ID,
                columnShareId: 'share-age',
                columnShare: { columnTypeId: STRUCT_COLUMN_TYPE.id, columnStructId: structAId }
            });

            // struct-a を col-age-src をメンバーに含めて更新しようとすると、
            // struct-a -> (col-age-src) -> struct-a という循環になるためエラー
            const updateCallback = getStructToolCallback(documentResource, 'update-column-struct');
            await expect(updateCallback({
                documentId: TEST_DOC_ID,
                columnStructId: structAId,
                columnStruct: { columnIds: ['col-name', 'col-age-src'] }
            })).rejects.toMatchObject({ message: expect.stringContaining('Circular STRUCT reference') });

            // 参考: structBId を使う経路自体は生きている (別テーブルでの独立参照)
            const findCallback = getStructToolCallback(documentResource, 'find-column-struct');
            const foundB = await findCallback({
                documentId: TEST_DOC_ID, columnStructId: structBId
            }) as { structuredContent: { structName: string } };
            expect(foundB.structuredContent.structName).toBe('struct-b');
        });
    });

    describe('columns ツール側: columnStructId の検証', () => {
        test('update-column-share: columnStructId が存在しない struct を指すとエラーになる', async () => {
            const updateColumnShareCallback = getColumnToolCallback(documentResource, 'update-column-share');

            await expect(updateColumnShareCallback({
                documentId: TEST_DOC_ID,
                columnShareId: 'share-name',
                columnShare: { columnTypeId: STRUCT_COLUMN_TYPE.id, columnStructId: 'not-exist-struct' }
            })).rejects.toMatchObject({ code: -32002 });
        });

        test('update-column-share: withStructFields でない型に columnStructId を指定するとエラーになる', async () => {
            const createCallback = getStructToolCallback(documentResource, 'create-column-struct');
            const created = await createCallback({
                documentId: TEST_DOC_ID,
                columnStruct: { structName: 'person', columnIds: ['col-age-src'] }
            }) as { structuredContent: { columnStructId: string } };

            const updateColumnShareCallback = getColumnToolCallback(documentResource, 'update-column-share');
            await expect(updateColumnShareCallback({
                documentId: TEST_DOC_ID,
                columnShareId: 'share-name',
                columnShare: { columnStructId: created.structuredContent.columnStructId }
            })).rejects.toMatchObject({ message: expect.stringContaining('Column struct must not be specified') });
        });

        test('update-column-share: columnStructId 変更が A -> B -> A の循環を引き起こす場合エラーになる', async () => {
            const nameMember = buildMemberColumn('col-name-b', 'share-name-b', 'name_b');
            setDocument(erdDocument.updateColumnModels([nameMember.columnModel], [nameMember.columnShareModel]));

            const createCallback = getStructToolCallback(documentResource, 'create-column-struct');

            // struct-a: メンバー col-name
            const createdA = await createCallback({
                documentId: TEST_DOC_ID,
                columnStruct: { structName: 'struct-a', columnIds: ['col-name'] }
            }) as { structuredContent: { columnStructId: string } };
            const structAId = createdA.structuredContent.columnStructId;

            // struct-b: メンバー col-name-b (struct-a とは独立したカラムをメンバーに持つ)
            const createdB = await createCallback({
                documentId: TEST_DOC_ID,
                columnStruct: { structName: 'struct-b', columnIds: ['col-name-b'] }
            }) as { structuredContent: { columnStructId: string } };
            const structBId = createdB.structuredContent.columnStructId;

            // col-age-src の share を struct 型にし、struct-b を指すようにする
            const updateColumnShareCallback = getColumnToolCallback(documentResource, 'update-column-share');
            await updateColumnShareCallback({
                documentId: TEST_DOC_ID,
                columnShareId: 'share-age',
                columnShare: { columnTypeId: STRUCT_COLUMN_TYPE.id, columnStructId: structBId }
            });
            // struct-a のメンバーに col-age-src (struct-b を指す) を加える -> struct-a -> struct-b
            const updateCallback = getStructToolCallback(documentResource, 'update-column-struct');
            await updateCallback({
                documentId: TEST_DOC_ID,
                columnStructId: structAId,
                columnStruct: { columnIds: ['col-name', 'col-age-src'] }
            });

            // struct-b のメンバーである col-name-b の columnShare (share-name-b) の
            // columnStructId を struct-a に向けようとすると、
            // struct-b -> struct-a -> struct-b という循環になるためエラー
            await expect(updateColumnShareCallback({
                documentId: TEST_DOC_ID,
                columnShareId: 'share-name-b',
                columnShare: { columnTypeId: STRUCT_COLUMN_TYPE.id, columnStructId: structAId }
            })).rejects.toMatchObject({ message: expect.stringContaining('Circular STRUCT reference') });
        });

        test('update-column: columnShare 新規作成時に対象カラムが属する struct への循環はエラーになる', async () => {
            // struct-a: メンバー col-age-src
            const createCallback = getStructToolCallback(documentResource, 'create-column-struct');
            const createdA = await createCallback({
                documentId: TEST_DOC_ID,
                columnStruct: { structName: 'struct-a', columnIds: ['col-age-src'] }
            }) as { structuredContent: { columnStructId: string } };
            const structAId = createdA.structuredContent.columnStructId;

            // col-name を対象に、update-column で columnShare を新規作成し、
            // columnStructId を struct-a に向ける。col-name は struct-a のメンバーではないため、
            // 単体では循環にならないことをまず確認する (負のケース)。
            const updateColumnCallback = getColumnToolCallback(documentResource, 'update-column');
            const okResult = await updateColumnCallback({
                documentId: TEST_DOC_ID,
                columnId: 'col-name',
                column: {
                    columnShare: {
                        columnName: { physical: 'name2' },
                        columnTypeId: STRUCT_COLUMN_TYPE.id,
                        columnStructId: structAId
                    }
                }
            }) as { content: unknown[] };
            expect(okResult.content).toBeDefined();

            // col-age-src (struct-a のメンバー) を対象に、update-column で columnShare を
            // 新規作成し、columnStructId を struct-a 自身に向けると自己参照になりエラー
            await expect(updateColumnCallback({
                documentId: TEST_DOC_ID,
                columnId: 'col-age-src',
                column: {
                    columnShare: {
                        columnName: { physical: 'age2' },
                        columnTypeId: STRUCT_COLUMN_TYPE.id,
                        columnStructId: structAId
                    }
                }
            })).rejects.toMatchObject({ message: expect.stringContaining('Circular STRUCT reference') });
        });
    });
});
