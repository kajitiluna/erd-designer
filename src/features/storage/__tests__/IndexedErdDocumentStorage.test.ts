import { vi, describe, test, expect, afterEach } from "vitest";

import initializeErdDocumentDB from "~/features/storage/IndexedErdDocumentStorage";
import ErdDocumentStorage from "~/features/storage/ErdDocumentStorage";
import DatabaseSettingModel from "~/models/DatabaseSettingModel";
import ErdDocument from "~/models/ErdDocument";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FakeIDBOpenDBRequest = any;

// jsdom (テスト実行環境) は IndexedDB を実装しないため、IndexedErdDocumentStorage が使う範囲だけを
// 模した最小限のインメモリ実装。実ブラウザの IndexedDB が保証する「スコープの重なる readwrite
// トランザクションは並行実行されない」という直列化までは再現していない
// (単一の get→put が単一 Promise チェーン内で完結する、逐次呼び出しのテストにのみ有効)。
// 並行タブ間の CAS 排他そのものは IndexedDB 仕様が担保する前提とし、ここでは対象外とする。

type FakeRequest<Result> = {
    result: Result | undefined;
    error: unknown;
    onsuccess: (() => void) | null;
    onerror: ((event: unknown) => void) | null;
};

const createFakeRequest = <Result>(): FakeRequest<Result> => {
    return { result: undefined, error: null, onsuccess: null, onerror: null };
};

type FakeCursorResult = {
    key: string;
    value: Record<string, unknown>;
    continue: () => void;
};

class FakeObjectStore {

    private readonly records: Map<string, Record<string, unknown>>;
    private readonly keyPath: string;

    constructor(keyPath: string) {
        this.records = new Map();
        this.keyPath = keyPath;
    }

    public get(key: string): FakeRequest<Record<string, unknown>> {
        const request = createFakeRequest<Record<string, unknown>>();

        queueMicrotask(() => {
            request.result = this.records.get(key);
            request.onsuccess?.();
        });

        return request;
    }

    public put(value: Record<string, unknown>): FakeRequest<void> {
        const request = createFakeRequest<void>();

        queueMicrotask(() => {
            this.records.set(value[this.keyPath] as string, value);
            request.onsuccess?.();
        });

        return request;
    }

    public delete(key: string): FakeRequest<void> {
        const request = createFakeRequest<void>();

        queueMicrotask(() => {
            this.records.delete(key);
            request.onsuccess?.();
        });

        return request;
    }

    public openCursor(): FakeRequest<FakeCursorResult | null> {
        const entries = Array.from(this.records.entries());
        const request = createFakeRequest<FakeCursorResult | null>();

        let index = 0;
        const advance = () => {
            queueMicrotask(() => {
                if (index >= entries.length) {
                    request.result = null;
                    request.onsuccess?.();
                    return;
                }

                const [key, value] = entries[index];
                index += 1;
                request.result = { key, value, continue: advance };
                request.onsuccess?.();
            });
        };
        advance();

        return request;
    }
}

class FakeDatabase {

    private readonly stores: Map<string, FakeObjectStore>;

    constructor() {
        this.stores = new Map();
    }

    public createObjectStore(name: string, options: { keyPath: string }): FakeObjectStore {
        const store = new FakeObjectStore(options.keyPath);
        this.stores.set(name, store);

        return store;
    }

    public transaction(storeNames: string[]): { objectStore: (name: string) => FakeObjectStore } {
        return {
            objectStore: (name: string) => {
                const store = this.stores.get(name);
                if (store == null) {
                    throw new Error(`FakeDatabase: unknown object store "${name}". Requested by: ${storeNames.join(", ")}`);
                }

                return store;
            }
        };
    }
}

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

        const saveResult = await storage.save("key-1", document, 0, "create");
        expect(saveResult).toEqual({ result: "saved", revision: 1 });

        const found = await storage.find("key-1");
        expect(found?.revision).toBe(1);
        expect(found?.erdDocument.documentName).toBe("first");
    });

    test("expectedRevision が最新と一致していれば保存でき、revision が 1 進む", async () => {
        const storage = await openFakeErdDocumentDB();
        await storage.save("key-1", createTestDocument("v1"), 0, "create");

        const secondSave = await storage.save("key-1", createTestDocument("v2"), 1, "update");
        expect(secondSave).toEqual({ result: "saved", revision: 2 });

        const found = await storage.find("key-1");
        expect(found?.revision).toBe(2);
        expect(found?.erdDocument.documentName).toBe("v2");
    });

    test("expectedRevision が古いと conflict になり、内容は書き換わらない (先勝ち)", async () => {
        const storage = await openFakeErdDocumentDB();
        await storage.save("key-1", createTestDocument("winner"), 0, "create");
        await storage.save("key-1", createTestDocument("winner-v2"), 1, "winner's second save");

        // 古い revision (1) のまま保存しようとした「後者」は conflict になる
        const loserResult = await storage.save("key-1", createTestDocument("loser"), 1, "loser's save");

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
        await storage.save("key-1", createTestDocument("to-delete"), 0, "create");

        await storage.delete("key-1");

        const summaries = await storage.findAll();
        expect(summaries).toHaveLength(0);
        expect(await storage.find("key-1")).toBeNull();
    });

    test("findAll は保存済みドキュメントの一覧を返す", async () => {
        const storage = await openFakeErdDocumentDB();
        await storage.save("key-1", createTestDocument("doc-a"), 0, "create");
        await storage.save("key-2", createTestDocument("doc-b"), 0, "create");

        const summaries = await storage.findAll();
        const names = summaries.map(summary => summary.documentName).sort();
        expect(names).toEqual(["doc-a", "doc-b"]);
    });
});
