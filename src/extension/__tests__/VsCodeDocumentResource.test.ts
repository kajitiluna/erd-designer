import { describe, test, expect, beforeEach } from 'vitest';

import type * as vscode from 'vscode';

import { VsCodeDocumentResource } from '~/extension/VsCodeDocumentResource';
import { generateDocumentId } from '~/agent-tools/DocumentResource';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import ErdDocument from '~/models/ErdDocument';

// ---- テスト用フィクスチャ ----

const TEST_URI = 'file:///test/document.erd';

const createTestDocument = (documentName: string): ErdDocument => {
    return ErdDocument.create({
        documentName,
        databaseSettingModel: DatabaseSettingModel.create('mysql')
    });
};

const createFakeTextDocument = (uri: string): vscode.TextDocument => {
    return { uri: { toString: () => uri } } as unknown as vscode.TextDocument;
};

const toJsonContent = (erdDocument: ErdDocument): string => {
    return JSON.stringify(erdDocument.toJSON());
};

describe('VsCodeDocumentResource', () => {
    let resource: VsCodeDocumentResource;

    beforeEach(() => {
        resource = new VsCodeDocumentResource();
    });

    test('register した内容がそのまま findByUri / findById から取得できる', () => {
        const initialDocument = createTestDocument('initial');
        const textDocument = createFakeTextDocument(TEST_URI);
        const jsonContent = toJsonContent(initialDocument);

        resource.register(textDocument, jsonContent, () => { });

        const documentId = generateDocumentId(TEST_URI);
        expect(resource.findByUri(TEST_URI)?.erdDocument.documentName).toBe('initial');
        expect(resource.findById(documentId)?.erdDocument.documentName).toBe('initial');
    });

    test('同一 URI への 2 回目の register は、既存のドキュメント内容を変更せずハンドラのみ追加する', () => {
        const initialDocument = createTestDocument('first-panel');
        const staleDocument = createTestDocument('second-panel-stale-content');
        const textDocument = createFakeTextDocument(TEST_URI);
        const initialJsonContent = toJsonContent(initialDocument);
        const staleJsonContent = toJsonContent(staleDocument);

        resource.register(textDocument, initialJsonContent, () => { });
        resource.register(textDocument, staleJsonContent, () => { });

        // 2 枚目の ready 受信時点の content で 1 枚目の登録内容が上書きされてはいけない
        expect(resource.findByUri(TEST_URI)?.erdDocument.documentName).toBe('first-panel');
    });

    test('notify は同一 URI を開く全パネルのハンドラへ届く', () => {
        const initialDocument = createTestDocument('initial');
        const updatedDocument = createTestDocument('updated');
        const textDocument = createFakeTextDocument(TEST_URI);
        const documentId = generateDocumentId(TEST_URI);

        const receivedByPanel1: string[] = [];
        const receivedByPanel2: string[] = [];
        const jsonContent = toJsonContent(initialDocument);

        resource.register(textDocument, jsonContent, updating => receivedByPanel1.push(updating));
        resource.register(textDocument, jsonContent, updating => receivedByPanel2.push(updating));

        resource.notify(documentId, updatedDocument);

        expect(receivedByPanel1).toHaveLength(1);
        expect(receivedByPanel2).toHaveLength(1);
        expect(JSON.parse(receivedByPanel1[0]).documentName).toBe('updated');
    });

    test('1 枚のパネルを閉じても、残りのパネルへの notify は届き続ける', () => {
        const initialDocument = createTestDocument('initial');
        const updatedDocument = createTestDocument('updated');
        const textDocument = createFakeTextDocument(TEST_URI);
        const documentId = generateDocumentId(TEST_URI);

        const receivedByPanel1: string[] = [];
        const receivedByPanel2: string[] = [];
        const jsonContent = toJsonContent(initialDocument);

        const unregisterPanel1 =
            resource.register(textDocument, jsonContent, updating => receivedByPanel1.push(updating));
        resource.register(textDocument, jsonContent, updating => receivedByPanel2.push(updating));

        unregisterPanel1();
        resource.notify(documentId, updatedDocument);

        expect(receivedByPanel1).toHaveLength(0);
        expect(receivedByPanel2).toHaveLength(1);

        // 片方が閉じただけではドキュメント自体は管理対象から外れない
        expect(resource.findByUri(TEST_URI)).not.toBeNull();
    });

    test('最後の 1 枚を閉じるとドキュメントが管理対象から外れる', () => {
        const initialDocument = createTestDocument('initial');
        const textDocument = createFakeTextDocument(TEST_URI);
        const documentId = generateDocumentId(TEST_URI);
        const jsonContent = toJsonContent(initialDocument);

        const unregisterPanel1 = resource.register(textDocument, jsonContent, () => { });
        const unregisterPanel2 = resource.register(textDocument, jsonContent, () => { });

        unregisterPanel1();
        expect(resource.findByUri(TEST_URI)).not.toBeNull();

        unregisterPanel2();
        expect(resource.findByUri(TEST_URI)).toBeNull();
        expect(resource.findById(documentId)).toBeNull();
    });

    test('同じハンドラの重複解除は何もしない', () => {
        const initialDocument = createTestDocument('initial');
        const textDocument = createFakeTextDocument(TEST_URI);
        const jsonContent = toJsonContent(initialDocument);

        const unregister = resource.register(textDocument, jsonContent, () => { });

        unregister();
        expect(() => unregister()).not.toThrow();
        expect(resource.findByUri(TEST_URI)).toBeNull();
    });
});
