import { StrictMode } from "react";
import { renderHook } from "@testing-library/react";
import { describe, test, expect, vi, afterEach } from "vitest";

import useLocalDocumentSync from "~/features/storage/useLocalDocumentSync";
import LocalDocumentSyncChannel from "~/features/storage/LocalDocumentSyncChannel";
import { EXTERNAL_DOCUMENT_CHANGED_EVENT } from "~/components/constant";
import ErdDocumentStorage, { FoundDocument, SaveErdDocumentResult } from "~/features/storage/ErdDocumentStorage";
import ErdDocumentSummary from "~/features/storage/ErdDocumentSummary";
import DatabaseSettingModel from "~/models/DatabaseSettingModel";
import ErdDocument from "~/models/ErdDocument";

type StoredRecord = { erdDocument: ErdDocument, revision: number };

/**
 * 実ブラウザでは複数ウィンドウが同一の IndexedDB を共有する。テストではその共有部分だけを
 * インメモリで代替し、revision による先勝ち判定 (compare-and-swap) の挙動だけを写し取る。
 * IndexedDB 実装そのものの検証は IndexedErdDocumentStorage.test.ts が担う。
 */
class InMemoryErdDocumentStorage implements ErdDocumentStorage {

    private readonly records: Map<string, StoredRecord>;
    private pendingSaveGate: Promise<void> | null;

    constructor() {
        this.records = new Map();
        this.pendingSaveGate = null;
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

    /**
     * Delays the next call to save until the given gate resolves, to widen the window
     * an IndexedDB round-trip would leave open for a concurrent publish to race into.
     */
    public delayNextSave(gate: Promise<void>): void {
        this.pendingSaveGate = gate;
    }

    public async save(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        key: string, erdDocument: ErdDocument, expectedRevision: number, _loggingMessage: string
    ): Promise<SaveErdDocumentResult> {
        const gate = this.pendingSaveGate;
        this.pendingSaveGate = null;
        if (gate != null) {
            await gate;
        }

        const existing = this.records.get(key);
        const existingRevision = existing?.revision ?? 0;

        if ((existing != null) && (existingRevision !== expectedRevision)) {
            return { result: "conflict", latest: existing.erdDocument, latestRevision: existingRevision };
        }

        const nextRevision = expectedRevision + 1;
        this.records.set(key, { erdDocument, revision: nextRevision });

        return { result: "saved", revision: nextRevision };
    }

    public delete(key: string): Promise<void> {
        this.records.delete(key);
        return Promise.resolve();
    }
}

const createTestDocument = (documentName: string): ErdDocument => {
    return ErdDocument.create({
        documentName,
        databaseSettingModel: DatabaseSettingModel.create("mysql")
    });
};

describe("useLocalDocumentSync", () => {
    const DOCUMENT_KEY = "document-key-1";
    const CHANNEL_NAME = `erd-designer:local-document:${DOCUMENT_KEY}`;

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

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // 実アプリは <StrictMode> 配下で動くため、開発ビルドでは effect が setup → cleanup → setup と
    // 二重実行される。購読がその再マウントを生き延びないと、利用者が踏んだ
    // 「他ウィンドウの編集が一切反映されない」状態になる。
    test("StrictMode の再マウント後も、他ウィンドウの保存通知を 1 度だけ取り込む", async () => {
        const documentStorage = new InMemoryErdDocumentStorage();
        const initialDocument = createTestDocument("initial");
        await documentStorage.save(DOCUMENT_KEY, initialDocument, 0, "create");

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
            await documentStorage.save(DOCUMENT_KEY, createTestDocument("edited-by-other-window"), 1, "other");
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
        await documentStorage.save(DOCUMENT_KEY, initialDocument, 0, "create");

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
        await documentStorage.save(DOCUMENT_KEY, initialDocument, 0, "create");

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
            await documentStorage.save(DOCUMENT_KEY, createTestDocument("after-unmount"), 1, "other");
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

describe("LocalDocumentSyncChannel", () => {
    const DOCUMENT_KEY = "doc-1";
    const CHANNEL_NAME = `erd-designer:local-document:${DOCUMENT_KEY}`;

    test("publish に成功すると accepted を返し、ストレージへ次の revision で保存される", async () => {
        const storage = new InMemoryErdDocumentStorage();
        const initialDocument = createTestDocument("initial");
        await storage.save(DOCUMENT_KEY, initialDocument, 0, "create");

        const channel = new LocalDocumentSyncChannel(storage, DOCUMENT_KEY, initialDocument, 1);
        const updatedDocument = createTestDocument("updated");

        const result = await channel.publish(updatedDocument, "edit");

        expect(result).toEqual({ result: "accepted" });
        const stored = await storage.find(DOCUMENT_KEY);
        expect(stored).toEqual({ erdDocument: updatedDocument, revision: 2 });
    });

    // 1 回目の save が解決する前に 2 回目の publish が発行された状況 (IndexedDB の 1 往復の間に
    // 連続保存が起きた場合) を再現する。直列化していないと、2 回目も 1 回目と同じ expectedRevision
    // を渡してしまい、偽の競合になる。
    test("1 回目の save が解決する前に発行された 2 回目の publish も、直列化されて両方保存される", async () => {
        const storage = new InMemoryErdDocumentStorage();
        const initialDocument = createTestDocument("initial");
        await storage.save(DOCUMENT_KEY, initialDocument, 0, "create");

        const channel = new LocalDocumentSyncChannel(storage, DOCUMENT_KEY, initialDocument, 1);

        let releaseFirstSave: () => void = () => { };
        const firstSaveGate = new Promise<void>(resolve => { releaseFirstSave = resolve; });
        storage.delayNextSave(firstSaveGate);

        const firstPublish = channel.publish(createTestDocument("first-edit"), "first edit");
        const secondPublish = channel.publish(createTestDocument("second-edit"), "second edit");

        releaseFirstSave();
        const [firstResult, secondResult] = await Promise.all([firstPublish, secondPublish]);

        expect(firstResult).toEqual({ result: "accepted" });
        expect(secondResult).toEqual({ result: "accepted" });

        const stored = await storage.find(DOCUMENT_KEY);
        expect(stored?.erdDocument.documentName).toBe("second-edit");
        expect(stored?.revision).toBe(3);
    });

    // 待機中の publish の内容は、他タブの更新を取り込む前の編集に基づいている。取り込みで進んだ
    // revision をそのまま使って保存すると、競合を検知できずに他タブの勝ち取った内容を上書きしてしまう。
    test("待機中に他タブの更新を取り込んだ場合、待機していた publish は保存されず conflict になる", async () => {
        const storage = new InMemoryErdDocumentStorage();
        const initialDocument = createTestDocument("initial");
        await storage.save(DOCUMENT_KEY, initialDocument, 0, "create");

        const channel = new LocalDocumentSyncChannel(storage, DOCUMENT_KEY, initialDocument, 1);
        const unsubscribe = channel.subscribe();
        const otherWindowChannel = new BroadcastChannel(CHANNEL_NAME);

        const receivedDocuments: ErdDocument[] = [];
        const handleEvent = (event: Event) => {
            const customEvent = event as CustomEvent;
            receivedDocuments.push(customEvent.detail.erdDocument);
        };
        window.addEventListener(EXTERNAL_DOCUMENT_CHANGED_EVENT, handleEvent);

        try {
            let releaseFirstSave: () => void = () => { };
            const firstSaveGate = new Promise<void>(resolve => { releaseFirstSave = resolve; });
            storage.delayNextSave(firstSaveGate);

            const firstPublish = channel.publish(createTestDocument("first-edit"), "first edit");
            const secondPublish = channel.publish(createTestDocument("second-edit"), "second edit");

            // 1 回目の save が gate を消費してから、他タブが先に保存して通知する
            await new Promise(resolve => setTimeout(resolve, 0));
            const otherDocument = createTestDocument("edited-by-other-window");
            await storage.save(DOCUMENT_KEY, otherDocument, 1, "other");
            otherWindowChannel.postMessage({ revision: 2 });

            await vi.waitFor(() => {
                expect(receivedDocuments).toHaveLength(1);
            }, { timeout: 1000 });

            releaseFirstSave();
            const [firstResult, secondResult] = await Promise.all([firstPublish, secondPublish]);

            expect(firstResult.result).toBe("conflict");
            expect(secondResult.result).toBe("conflict");

            const stored = await storage.find(DOCUMENT_KEY);
            expect(stored?.erdDocument.documentName).toBe("edited-by-other-window");
            expect(stored?.revision).toBe(2);
        } finally {
            window.removeEventListener(EXTERNAL_DOCUMENT_CHANGED_EVENT, handleEvent);
            otherWindowChannel.close();
            unsubscribe();
        }
    });

    test("expectedRevision が古い場合は conflict を返し、ストレージは書き換わらない", async () => {
        const storage = new InMemoryErdDocumentStorage();
        const initialDocument = createTestDocument("initial");
        await storage.save(DOCUMENT_KEY, initialDocument, 0, "create");

        // 別タブが先に revision 2 まで進めてしまった状況を再現する
        const winnerDocument = createTestDocument("winner");
        await storage.save(DOCUMENT_KEY, winnerDocument, 1, "winner's save");

        const staleChannel = new LocalDocumentSyncChannel(storage, DOCUMENT_KEY, initialDocument, 1);
        const loserResult = await staleChannel.publish(createTestDocument("loser"), "loser's save");

        expect(loserResult).toEqual({ result: "conflict", latest: winnerDocument });

        const stored = await storage.find(DOCUMENT_KEY);
        expect(stored?.erdDocument).toBe(winnerDocument);
    });

    test("他タブから受信した内容をそのまま publish しても保存されない (echo 抑止)", async () => {
        const storage = new InMemoryErdDocumentStorage();
        const initialDocument = createTestDocument("initial");
        await storage.save(DOCUMENT_KEY, initialDocument, 0, "create");

        const senderChannel = new LocalDocumentSyncChannel(storage, DOCUMENT_KEY, initialDocument, 1);
        const receiverChannel = new LocalDocumentSyncChannel(storage, DOCUMENT_KEY, initialDocument, 1);
        const unsubscribeSender = senderChannel.subscribe();
        const unsubscribeReceiver = receiverChannel.subscribe();

        let nestedPublishResult: { result: "accepted" } | { result: "conflict", latest: ErdDocument } | null = null;
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
        await storage.save(DOCUMENT_KEY, initialDocument, 0, "create");

        const senderChannel = new LocalDocumentSyncChannel(storage, DOCUMENT_KEY, initialDocument, 1);
        const receiverChannel = new LocalDocumentSyncChannel(storage, DOCUMENT_KEY, initialDocument, 1);
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
        await storage.save(DOCUMENT_KEY, initialDocument, 0, "create");

        const channel = new LocalDocumentSyncChannel(storage, DOCUMENT_KEY, initialDocument, 1);
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
            await storage.save(DOCUMENT_KEY, createTestDocument("from-other-window"), 1, "other");
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
        await storage.save(DOCUMENT_KEY, initialDocument, 0, "create");

        // subscribe を一度も呼ばない状態 (マウント前後の隙間) を再現する
        const channel = new LocalDocumentSyncChannel(storage, DOCUMENT_KEY, initialDocument, 1);

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
        await storage.save(DOCUMENT_KEY, initialDocument, 0, "create");

        const channel = new LocalDocumentSyncChannel(storage, DOCUMENT_KEY, initialDocument, 1);
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
