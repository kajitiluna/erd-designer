import { vi, describe, test, expect, afterEach } from "vitest";

import initializeErdDocumentDB from "~/features/storage/IndexedErdDocumentStorage";
import ErdDocumentStorage from "~/features/storage/ErdDocumentStorage";
import { FakeDatabase } from "~/test-support/fake-indexed-db";
import DatabaseSettingModel from "~/models/DatabaseSettingModel";
import ErdDocument from "~/models/ErdDocument";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FakeIDBOpenDBRequest = any;

/**
 * initializeErdDocumentDB を実際に呼び出すことで onupgradeneeded を含む本来の初期化経路を通し、
 * private な IndexedDBStorage 実装をテストのために export し直さずに取得する。
 */
const openFakeErdDocumentDB = async (): Promise<ErdDocumentStorage> => {
    const database = new FakeDatabase();
    let upgraded = false;

    const fakeIndexedDB = {
        open: (): FakeIDBOpenDBRequest => {
            const request: FakeIDBOpenDBRequest = { result: database, onsuccess: null, onupgradeneeded: null, onerror: null };

            queueMicrotask(() => {
                if (upgraded === false) {
                    upgraded = true;
                    request.onupgradeneeded?.();
                }
                request.onsuccess?.();
            });

            return request;
        }
    };

    vi.stubGlobal("indexedDB", fakeIndexedDB);
    return initializeErdDocumentDB();
};

const createTestDocument = (documentName: string): ErdDocument => {
    return ErdDocument.create({
        documentName,
        databaseSettingModel: DatabaseSettingModel.create("mysql")
    });
};

describe("IndexedDBStorage (via initializeErdDocumentDB)", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test("isAvailable は true を返す", async () => {
        const storage = await openFakeErdDocumentDB();
        expect(storage.isAvailable()).toBe(true);
    });

    test("save 後に find すると revision 1 で取得できる", async () => {
        const storage = await openFakeErdDocumentDB();
        const document = createTestDocument("first");

        const saveResult = await storage.save("key-1", document, "create", 0);
        expect(saveResult).toEqual({ result: "saved", revision: 1 });

        const found = await storage.find("key-1");
        expect(found?.revision).toBe(1);
        expect(found?.erdDocument.documentName).toBe("first");
    });

    test("expectedRevision が最新と一致していれば保存でき、revision が 1 進む", async () => {
        const storage = await openFakeErdDocumentDB();
        await storage.save("key-1", createTestDocument("v1"), "create", 0);

        const secondSave = await storage.save("key-1", createTestDocument("v2"), "update", 1);
        expect(secondSave).toEqual({ result: "saved", revision: 2 });

        const found = await storage.find("key-1");
        expect(found?.revision).toBe(2);
        expect(found?.erdDocument.documentName).toBe("v2");
    });

    test("expectedRevision が古いと conflict になり、内容は書き換わらない (先勝ち)", async () => {
        const storage = await openFakeErdDocumentDB();
        await storage.save("key-1", createTestDocument("winner"), "create", 0);
        await storage.save("key-1", createTestDocument("winner-v2"), "winner's second save", 1);

        // 古い revision (1) のまま保存しようとした「後者」は conflict になる
        const loserResult = await storage.save("key-1", createTestDocument("loser"), "loser's save", 1);

        expect(loserResult.result).toBe("conflict");
        if (loserResult.result === "conflict") {
            expect(loserResult.latestRevision).toBe(2);
            expect(loserResult.latest.documentName).toBe("winner-v2");
        }

        // 保存先はそのまま先勝ちの内容を保持している
        const found = await storage.find("key-1");
        expect(found?.erdDocument.documentName).toBe("winner-v2");
        expect(found?.revision).toBe(2);
    });

    test("find は未保存のキーに対して null を返す", async () => {
        const storage = await openFakeErdDocumentDB();
        const found = await storage.find("not-found");
        expect(found).toBeNull();
    });

    test("delete したドキュメントは findAll に含まれなくなる", async () => {
        const storage = await openFakeErdDocumentDB();
        await storage.save("key-1", createTestDocument("to-delete"), "create", 0);

        await storage.delete("key-1");

        const summaries = await storage.findAll();
        expect(summaries).toHaveLength(0);
        expect(await storage.find("key-1")).toBeNull();
    });

    test("findAll は保存済みドキュメントの一覧を返す", async () => {
        const storage = await openFakeErdDocumentDB();
        await storage.save("key-1", createTestDocument("doc-a"), "create", 0);
        await storage.save("key-2", createTestDocument("doc-b"), "create", 0);

        const summaries = await storage.findAll();
        const names = summaries.map(summary => summary.documentName).sort();
        expect(names).toEqual(["doc-a", "doc-b"]);
    });
});
