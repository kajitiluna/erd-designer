import { StrictMode } from "react";
import { renderHook } from "@testing-library/react";
import { describe, test, expect, vi, afterEach } from "vitest";

import useLocalDocumentSync from "~/features/storage/useLocalDocumentSync";
import { EXTERNAL_DOCUMENT_CHANGED_EVENT } from "~/components/constant";
import { InMemoryErdDocumentStorage } from "~/test-support/in-memory-erd-document-storage";
import DatabaseSettingModel from "~/models/DatabaseSettingModel";
import ErdDocument from "~/models/ErdDocument";

const DOCUMENT_KEY = "document-key-1";
const CHANNEL_NAME = `erd-designer:local-document:${DOCUMENT_KEY}`;

const createTestDocument = (documentName: string): ErdDocument => {
    return ErdDocument.create({
        documentName,
        databaseSettingModel: DatabaseSettingModel.create("mysql")
    });
};

type ImportedDocuments = {
    received: ErdDocument[],
    stopListening: () => void
};

const listenImportedDocuments = (): ImportedDocuments => {
    const received: ErdDocument[] = [];
    const handleEvent = (event: Event) => {
        const customEvent = event as CustomEvent;
        received.push(customEvent.detail.erdDocument);
    };
    window.addEventListener(EXTERNAL_DOCUMENT_CHANGED_EVENT, handleEvent);

    return {
        received,
        stopListening: () => window.removeEventListener(EXTERNAL_DOCUMENT_CHANGED_EVENT, handleEvent)
    };
};

describe("useLocalDocumentSync", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    // 実アプリは <StrictMode> 配下で動くため、開発ビルドでは effect が setup → cleanup → setup と
    // 二重実行される。購読がその再マウントを生き延びないと、利用者が踏んだ
    // 「他ウィンドウの編集が一切反映されない」状態になる。
    test("StrictMode の再マウント後も、他ウィンドウの保存通知を 1 度だけ取り込む", async () => {
        const documentStorage = new InMemoryErdDocumentStorage();
        const initialDocument = createTestDocument("initial");
        await documentStorage.save(DOCUMENT_KEY, initialDocument, "create", 0);

        const listener = listenImportedDocuments();
        const { unmount } = renderHook(
            () => useLocalDocumentSync({
                documentStorage, documentKey: DOCUMENT_KEY,
                erdDocument: initialDocument, initialRevision: 1
            }),
            { wrapper: StrictMode }
        );

        // 別ウィンドウが保存し、その事実をブロードキャストした状況を作る
        const otherWindowChannel = new BroadcastChannel(CHANNEL_NAME);
        try {
            await documentStorage.save(DOCUMENT_KEY, createTestDocument("edited-by-other-window"), "other", 1);
            otherWindowChannel.postMessage({ revision: 2 });

            await vi.waitFor(() => {
                expect(listener.received.length).toBeGreaterThan(0);
            }, { timeout: 1000 });

            // 購読が二重に生き残っていると同じ変更を複数回取り込んでしまうため、
            // 落ち着いた後に「ちょうど 1 回」であることまで確かめる。
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(listener.received).toHaveLength(1);
            expect(listener.received[0].documentName).toBe("edited-by-other-window");
        } finally {
            otherWindowChannel.close();
            listener.stopListening();
            unmount();
        }
    });

    test("StrictMode の再マウント後も、自分の保存が他ウィンドウへ通知される", async () => {
        const documentStorage = new InMemoryErdDocumentStorage();
        const initialDocument = createTestDocument("initial");
        await documentStorage.save(DOCUMENT_KEY, initialDocument, "create", 0);

        const { result, unmount } = renderHook(
            () => useLocalDocumentSync({
                documentStorage, documentKey: DOCUMENT_KEY,
                erdDocument: initialDocument, initialRevision: 1
            }),
            { wrapper: StrictMode }
        );

        const notifications: unknown[] = [];
        const otherWindowChannel = new BroadcastChannel(CHANNEL_NAME);
        otherWindowChannel.onmessage = event => notifications.push(event.data);

        try {
            result.current.onSave(createTestDocument("edited-here"), "local edit");

            await vi.waitFor(() => {
                expect(notifications).toHaveLength(1);
            }, { timeout: 1000 });

            const saved = await documentStorage.find(DOCUMENT_KEY);
            expect(saved?.erdDocument.documentName).toBe("edited-here");
            expect(saved?.revision).toBe(2);
        } finally {
            otherWindowChannel.close();
            unmount();
        }
    });

    test("アンマウント後は購読が解除され、他ウィンドウの通知を取り込まない", async () => {
        const documentStorage = new InMemoryErdDocumentStorage();
        const initialDocument = createTestDocument("initial");
        await documentStorage.save(DOCUMENT_KEY, initialDocument, "create", 0);

        const listener = listenImportedDocuments();
        const { unmount } = renderHook(
            () => useLocalDocumentSync({
                documentStorage, documentKey: DOCUMENT_KEY,
                erdDocument: initialDocument, initialRevision: 1
            }),
            { wrapper: StrictMode }
        );
        unmount();

        const otherWindowChannel = new BroadcastChannel(CHANNEL_NAME);
        try {
            await documentStorage.save(DOCUMENT_KEY, createTestDocument("after-unmount"), "other", 1);
            otherWindowChannel.postMessage({ revision: 2 });

            // 取り込みが起きないことの確認なので、一定時間待って何も来ないことを見る
            await new Promise(resolve => setTimeout(resolve, 100));
            expect(listener.received).toHaveLength(0);
        } finally {
            otherWindowChannel.close();
            listener.stopListening();
        }
    });
});
