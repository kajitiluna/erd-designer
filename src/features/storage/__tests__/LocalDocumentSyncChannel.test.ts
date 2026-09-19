import { describe, test, expect, vi } from "vitest";

import { localDocumentSyncChannelFactory, PublishResult } from "~/features/storage/LocalDocumentSyncChannel";
import ErdDocumentStorage, { FoundDocument, SaveResult } from "~/features/storage/ErdDocumentStorage";
import ErdDocumentSummary from "~/features/storage/ErdDocumentSummary";
import { EXTERNAL_DOCUMENT_CHANGED_EVENT } from "~/components/constant";
import DatabaseSettingModel from "~/models/DatabaseSettingModel";
import ErdDocument from "~/models/ErdDocument";

const createTestDocument = (documentName: string): ErdDocument => {
    return ErdDocument.create({
        documentName,
        databaseSettingModel: DatabaseSettingModel.create("mysql")
    });
};

type StoredRecord = { erdDocument: ErdDocument, revision: number };

/**
 * 実ブラウザでは複数タブが同一の IndexedDB を共有する。テストでは
 * LocalDocumentSyncChannel が実際に呼ぶ find/save だけを裏付ける共有インメモリストレージで代替する。
 */
class InMemoryErdDocumentStorage implements ErdDocumentStorage {

    private readonly records: Map<string, StoredRecord>;

    constructor() {
        this.records = new Map();
    }

    public isAvailable(): boolean {
        return true;
    }

    public findAll(): Promise<ErdDocumentSummary[]> {
        return Promise.resolve([]);
    }

    public find(key: string): Promise<FoundDocument | null> {
        const record = this.records.get(key);
        return Promise.resolve((record != null) ? { ...record } : null);
    }

    public save(key: string, erdDocument: ErdDocument, _loggingMessage: string, expectedRevision: number): Promise<SaveResult> {
        const existing = this.records.get(key);
        const existingRevision = existing?.revision ?? 0;

        if ((existing != null) && (existingRevision !== expectedRevision)) {
            return Promise.resolve({ result: "conflict", latest: existing.erdDocument, latestRevision: existingRevision });
        }

        const nextRevision = expectedRevision + 1;
        this.records.set(key, { erdDocument, revision: nextRevision });

        return Promise.resolve({ result: "saved", revision: nextRevision });
    }

    public delete(key: string): Promise<void> {
        this.records.delete(key);
        return Promise.resolve();
    }
}

describe("LocalDocumentSyncChannel", () => {
    test("publish に成功すると accepted を返し、ストレージへ次の revision で保存される", async () => {
        const storage = new InMemoryErdDocumentStorage();
        const initialDocument = createTestDocument("initial");
        await storage.save("doc-1", initialDocument, "create", 0);

        const channel = localDocumentSyncChannelFactory.create(storage, "doc-1", initialDocument, 1);
        const updatedDocument = createTestDocument("updated");

        const result = await channel.publish(updatedDocument, "edit");

        expect(result).toEqual({ result: "accepted" });
        const stored = await storage.find("doc-1");
        expect(stored).toEqual({ erdDocument: updatedDocument, revision: 2 });

        channel.close();
    });

    test("expectedRevision が古い場合は conflict を返し、ストレージは書き換わらない", async () => {
        const storage = new InMemoryErdDocumentStorage();
        const initialDocument = createTestDocument("initial");
        await storage.save("doc-1", initialDocument, "create", 0);

        // 別タブが先に revision 2 まで進めてしまった状況を再現する
        const winnerDocument = createTestDocument("winner");
        await storage.save("doc-1", winnerDocument, "winner's save", 1);

        const staleChannel = localDocumentSyncChannelFactory.create(storage, "doc-1", initialDocument, 1);
        const loserResult = await staleChannel.publish(createTestDocument("loser"), "loser's save");

        expect(loserResult).toEqual({ result: "conflict", latest: winnerDocument });

        const stored = await storage.find("doc-1");
        expect(stored?.erdDocument).toBe(winnerDocument);

        staleChannel.close();
    });

    test("他タブから受信した内容をそのまま publish しても保存されない (echo 抑止)", async () => {
        const storage = new InMemoryErdDocumentStorage();
        const initialDocument = createTestDocument("initial");
        await storage.save("doc-1", initialDocument, "create", 0);

        const senderChannel = localDocumentSyncChannelFactory.create(storage, "doc-1", initialDocument, 1);
        const receiverChannel = localDocumentSyncChannelFactory.create(storage, "doc-1", initialDocument, 1);

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
            const stored = await storage.find("doc-1");
            expect(stored?.revision).toBe(2);
        } finally {
            window.removeEventListener(EXTERNAL_DOCUMENT_CHANGED_EVENT, handleEvent);
            senderChannel.close();
            receiverChannel.close();
        }
    });

    test("他タブの publish が BroadcastChannel 経由でこちらの EXTERNAL_DOCUMENT_CHANGED_EVENT を発火させる", async () => {
        const storage = new InMemoryErdDocumentStorage();
        const initialDocument = createTestDocument("initial");
        await storage.save("doc-1", initialDocument, "create", 0);

        const senderChannel = localDocumentSyncChannelFactory.create(storage, "doc-1", initialDocument, 1);
        const receiverChannel = localDocumentSyncChannelFactory.create(storage, "doc-1", initialDocument, 1);

        const receivedDocuments: ErdDocument[] = [];
        const handleEvent = (event: Event) => {
            const customEvent = event as CustomEvent;
            receivedDocuments.push(customEvent.detail.erdDocument);
        };
        window.addEventListener(EXTERNAL_DOCUMENT_CHANGED_EVENT, handleEvent);

        try {
            const updatedDocument = createTestDocument("updated-by-sender");
            await senderChannel.publish(updatedDocument, "edit from sender tab");

            await vi.waitFor(() => {
                expect(receivedDocuments).toHaveLength(1);
            }, { timeout: 1000 });

            expect(receivedDocuments[0].documentName).toBe("updated-by-sender");
        } finally {
            window.removeEventListener(EXTERNAL_DOCUMENT_CHANGED_EVENT, handleEvent);
            senderChannel.close();
            receiverChannel.close();
        }
    });
});
