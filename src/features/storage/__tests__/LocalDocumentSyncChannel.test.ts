import { describe, test, expect, vi } from "vitest";

import { localDocumentSyncChannelFactory, PublishResult } from "~/features/storage/LocalDocumentSyncChannel";
import { EXTERNAL_DOCUMENT_CHANGED_EVENT } from "~/components/constant";
import { InMemoryErdDocumentStorage } from "~/test-support/in-memory-erd-document-storage";
import DatabaseSettingModel from "~/models/DatabaseSettingModel";
import ErdDocument from "~/models/ErdDocument";

const DOCUMENT_KEY = "doc-1";
const CHANNEL_NAME = `erd-designer:local-document:${DOCUMENT_KEY}`;

const createTestDocument = (documentName: string): ErdDocument => {
    return ErdDocument.create({
        documentName,
        databaseSettingModel: DatabaseSettingModel.create("mysql")
    });
};

describe("LocalDocumentSyncChannel", () => {
    test("publish に成功すると accepted を返し、ストレージへ次の revision で保存される", async () => {
        const storage = new InMemoryErdDocumentStorage();
        const initialDocument = createTestDocument("initial");
        await storage.save(DOCUMENT_KEY, initialDocument, "create", 0);

        const channel = localDocumentSyncChannelFactory.create(storage, DOCUMENT_KEY, initialDocument, 1);
        const updatedDocument = createTestDocument("updated");

        const result = await channel.publish(updatedDocument, "edit");

        expect(result).toEqual({ result: "accepted" });
        const stored = await storage.find(DOCUMENT_KEY);
        expect(stored).toEqual({ erdDocument: updatedDocument, revision: 2 });
    });

    test("expectedRevision が古い場合は conflict を返し、ストレージは書き換わらない", async () => {
        const storage = new InMemoryErdDocumentStorage();
        const initialDocument = createTestDocument("initial");
        await storage.save(DOCUMENT_KEY, initialDocument, "create", 0);

        // 別タブが先に revision 2 まで進めてしまった状況を再現する
        const winnerDocument = createTestDocument("winner");
        await storage.save(DOCUMENT_KEY, winnerDocument, "winner's save", 1);

        const staleChannel = localDocumentSyncChannelFactory.create(storage, DOCUMENT_KEY, initialDocument, 1);
        const loserResult = await staleChannel.publish(createTestDocument("loser"), "loser's save");

        expect(loserResult).toEqual({ result: "conflict", latest: winnerDocument });

        const stored = await storage.find(DOCUMENT_KEY);
        expect(stored?.erdDocument).toBe(winnerDocument);
    });

    test("他タブから受信した内容をそのまま publish しても保存されない (echo 抑止)", async () => {
        const storage = new InMemoryErdDocumentStorage();
        const initialDocument = createTestDocument("initial");
        await storage.save(DOCUMENT_KEY, initialDocument, "create", 0);

        const senderChannel = localDocumentSyncChannelFactory.create(storage, DOCUMENT_KEY, initialDocument, 1);
        const receiverChannel = localDocumentSyncChannelFactory.create(storage, DOCUMENT_KEY, initialDocument, 1);
        const unsubscribeSender = senderChannel.subscribe();
        const unsubscribeReceiver = receiverChannel.subscribe();

        let nestedPublishResult: PublishResult | null = null;
        const handleEvent = (event: Event) => {
            const customEvent = event as CustomEvent;
            // MainView が受信したドキュメントをそのまま onSave (= publish) へ渡す挙動を模す
            receiverChannel.publish(customEvent.detail.erdDocument, "echoed save").then(result => {
                nestedPublishResult = result;
            });
        };
        window.addEventListener(EXTERNAL_DOCUMENT_CHANGED_EVENT, handleEvent);

        try {
            await senderChannel.publish(createTestDocument("updated-by-sender"), "edit from sender tab");

            await vi.waitFor(() => {
                expect(nestedPublishResult).not.toBeNull();
            }, { timeout: 1000 });

            expect(nestedPublishResult).toEqual({ result: "accepted" });

            // echo と判定され、受信した内容を保存し返してはいない (revision は sender の保存分の 2 のまま)
            const stored = await storage.find(DOCUMENT_KEY);
            expect(stored?.revision).toBe(2);
        } finally {
            window.removeEventListener(EXTERNAL_DOCUMENT_CHANGED_EVENT, handleEvent);
            unsubscribeSender();
            unsubscribeReceiver();
        }
    });

    test("他タブの publish が BroadcastChannel 経由でこちらの EXTERNAL_DOCUMENT_CHANGED_EVENT を発火させる", async () => {
        const storage = new InMemoryErdDocumentStorage();
        const initialDocument = createTestDocument("initial");
        await storage.save(DOCUMENT_KEY, initialDocument, "create", 0);

        const senderChannel = localDocumentSyncChannelFactory.create(storage, DOCUMENT_KEY, initialDocument, 1);
        const receiverChannel = localDocumentSyncChannelFactory.create(storage, DOCUMENT_KEY, initialDocument, 1);
        const unsubscribeSender = senderChannel.subscribe();
        const unsubscribeReceiver = receiverChannel.subscribe();

        const receivedDocuments: ErdDocument[] = [];
        const handleEvent = (event: Event) => {
            const customEvent = event as CustomEvent;
            receivedDocuments.push(customEvent.detail.erdDocument);
        };
        window.addEventListener(EXTERNAL_DOCUMENT_CHANGED_EVENT, handleEvent);

        try {
            await senderChannel.publish(createTestDocument("updated-by-sender"), "edit from sender tab");

            await vi.waitFor(() => {
                expect(receivedDocuments).toHaveLength(1);
            }, { timeout: 1000 });

            expect(receivedDocuments[0].documentName).toBe("updated-by-sender");
        } finally {
            window.removeEventListener(EXTERNAL_DOCUMENT_CHANGED_EVENT, handleEvent);
            unsubscribeSender();
            unsubscribeReceiver();
        }
    });

    // React の再マウント (StrictMode の二重実行やホットリロード) では
    // subscribe → 解除 → subscribe が起きる。ここで受信が死ぬと同期が止まる。
    test("subscribe / 解除 / subscribe を繰り返しても受信し続ける", async () => {
        const storage = new InMemoryErdDocumentStorage();
        const initialDocument = createTestDocument("initial");
        await storage.save(DOCUMENT_KEY, initialDocument, "create", 0);

        const channel = localDocumentSyncChannelFactory.create(storage, DOCUMENT_KEY, initialDocument, 1);
        const firstUnsubscribe = channel.subscribe();
        firstUnsubscribe();
        const secondUnsubscribe = channel.subscribe();

        const receivedDocuments: ErdDocument[] = [];
        const handleEvent = (event: Event) => {
            const customEvent = event as CustomEvent;
            receivedDocuments.push(customEvent.detail.erdDocument);
        };
        window.addEventListener(EXTERNAL_DOCUMENT_CHANGED_EVENT, handleEvent);

        const otherWindowChannel = new BroadcastChannel(CHANNEL_NAME);
        try {
            await storage.save(DOCUMENT_KEY, createTestDocument("from-other-window"), "other", 1);
            otherWindowChannel.postMessage({ revision: 2 });

            await vi.waitFor(() => {
                expect(receivedDocuments).toHaveLength(1);
            }, { timeout: 1000 });

            expect(receivedDocuments[0].documentName).toBe("from-other-window");
        } finally {
            otherWindowChannel.close();
            window.removeEventListener(EXTERNAL_DOCUMENT_CHANGED_EVENT, handleEvent);
            secondUnsubscribe();
        }
    });

    test("未購読のまま publish しても他ウィンドウへの通知は届く", async () => {
        const storage = new InMemoryErdDocumentStorage();
        const initialDocument = createTestDocument("initial");
        await storage.save(DOCUMENT_KEY, initialDocument, "create", 0);

        // subscribe を一度も呼ばない状態 (マウント前後の隙間) を再現する
        const channel = localDocumentSyncChannelFactory.create(storage, DOCUMENT_KEY, initialDocument, 1);

        const notifications: unknown[] = [];
        const otherWindowChannel = new BroadcastChannel(CHANNEL_NAME);
        otherWindowChannel.onmessage = event => notifications.push(event.data);

        try {
            const result = await channel.publish(createTestDocument("saved-while-unsubscribed"), "edit");
            expect(result).toEqual({ result: "accepted" });

            await vi.waitFor(() => {
                expect(notifications).toHaveLength(1);
            }, { timeout: 1000 });
        } finally {
            otherWindowChannel.close();
        }
    });

    test("通知に失敗しても、成功した保存は accepted のまま返る", async () => {
        const storage = new InMemoryErdDocumentStorage();
        const initialDocument = createTestDocument("initial");
        await storage.save(DOCUMENT_KEY, initialDocument, "create", 0);

        const channel = localDocumentSyncChannelFactory.create(storage, DOCUMENT_KEY, initialDocument, 1);
        const unsubscribe = channel.subscribe();

        // 購読中のチャネルが閉じられている状況 (postMessage が throw する) を作る
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
        const postMessageSpy = vi.spyOn(BroadcastChannel.prototype, "postMessage")
            .mockImplementation(() => { throw new Error("BroadcastChannel is closed."); });

        try {
            const result = await channel.publish(createTestDocument("updated"), "edit");

            expect(result).toEqual({ result: "accepted" });
            const stored = await storage.find(DOCUMENT_KEY);
            expect(stored?.erdDocument.documentName).toBe("updated");
            expect(stored?.revision).toBe(2);
        } finally {
            postMessageSpy.mockRestore();
            warnSpy.mockRestore();
            unsubscribe();
        }
    });
});
