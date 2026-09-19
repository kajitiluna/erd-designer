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

export class FakeObjectStore {

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

export class FakeDatabase {

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
