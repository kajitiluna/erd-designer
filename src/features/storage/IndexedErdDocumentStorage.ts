import ErdDocumentStorage, { FoundDocument, SaveErdDocumentResult } from "~/features/storage/ErdDocumentStorage";
import ErdDocumentSummary from "~/features/storage/ErdDocumentSummary";
import { INDEXED_DB_NAME, INDEXED_DB_VERSION, INDEXED_OBJECT_ERD_DOCUMENT } from "~/features/storage/IndexedDBConst";
import ErdDocument from "~/models/ErdDocument";
import { DatabaseType } from "~/models/database";

type InternalDocument = {
    key: string;
    documentName: string;
    lastUpdatedAt: Date;
    databaseType?: string;
    document: object;
    // 未保存のまま作られた既存ファイルとの後方互換のため、欠落時は revision 0 として扱う
    revision?: number;
};

const initializeErdDocumentDB = () => {
    return new Promise<ErdDocumentStorage>((resolve) => {
        const request = indexedDB.open(INDEXED_DB_NAME, INDEXED_DB_VERSION);
        request.onerror = (event) => {
            console.warn(`Occurred error in creating IndexedDB instance. Detail : ${event}`);
            resolve(new NoOperationStorage());
        };

        request.onsuccess = () => {
            const database = request.result;
            resolve(new IndexedDBStorage(database));
        };

        request.onupgradeneeded = () => {
            const database = request.result;
            database.createObjectStore(INDEXED_OBJECT_ERD_DOCUMENT, { keyPath: "key" });
            console.info("Upgraded IndexedDB instance.")

            resolve(new IndexedDBStorage(database));
        };
    });
};

class IndexedDBStorage implements ErdDocumentStorage {

    private readonly database: IDBDatabase;

    constructor(database: IDBDatabase) {
        this.database = database;
    }

    public isAvailable() {
        return true;
    }

    findAll(): Promise<ErdDocumentSummary[]> {
        return new Promise<ErdDocumentSummary[]>((resolve, reject) => {
            const transaction = this.database.transaction([INDEXED_OBJECT_ERD_DOCUMENT], "readonly");
            const objectStore = transaction.objectStore(INDEXED_OBJECT_ERD_DOCUMENT);

            const documents: ErdDocumentSummary[] = [];
            const request = objectStore.openCursor();

            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor == null) {
                    // 最終更新日の降順で並べる
                    documents.sort((first, second) => {
                        const timeCompared = second.lastUpdatedAt.getTime() - first.lastUpdatedAt.getTime();
                        if (timeCompared !== 0) {
                            return timeCompared;
                        }

                        return first.documentName.localeCompare(second.documentName);
                    });

                    resolve(documents);
                    return;
                }

                const name = cursor.key;
                const baseDocument = cursor.value as InternalDocument;
                documents.push({
                    key: name.toString(),
                    documentName: baseDocument.documentName,
                    lastUpdatedAt: baseDocument.lastUpdatedAt,
                    databaseType: baseDocument.databaseType as DatabaseType | undefined
                });

                cursor.continue();
            };

            request.onerror = (event) => {
                reject(event);
            };
        });
    }

    find(key: string): Promise<FoundDocument | null> {
        return new Promise<FoundDocument | null>((resolve, reject) => {
            const transaction = this.database.transaction([INDEXED_OBJECT_ERD_DOCUMENT], "readonly");
            const objectStore = transaction.objectStore(INDEXED_OBJECT_ERD_DOCUMENT);
            const request = objectStore.get(key);

            request.onsuccess = () => {
                if (request.result == null) {
                    resolve(null);
                    return
                }

                const baseDocument = request.result as InternalDocument;
                const erdDocument = ErdDocument.toObject(baseDocument.document);
                const revision = toRevision(baseDocument);
                console.debug(`Succeed to find document. document : ${JSON.stringify(baseDocument.document)}`);

                resolve({ erdDocument, revision });
            };

            request.onerror = (event) => {
                reject(event);
            };
        });
    }

    /**
     * expectedRevision が保存先の現在の revision と一致する場合のみ書き込む。
     * get → put を単一の readwrite トランザクション内で行うことで、他ウィンドウの保存と
     * 競合しない compare-and-swap にしている (IndexedDB はスコープの重なる readwrite
     * トランザクションを並行実行しないため、この間に割り込む書き込みは起こり得ない)。
     */
    save(
        key: string, erdDocument: ErdDocument, expectedRevision: number, loggingMessage: string
    ): Promise<SaveErdDocumentResult> {
        return new Promise<SaveErdDocumentResult>((resolve, reject) => {
            const transaction = this.database.transaction([INDEXED_OBJECT_ERD_DOCUMENT], "readwrite");
            const objectStore = transaction.objectStore(INDEXED_OBJECT_ERD_DOCUMENT);
            const getRequest = objectStore.get(key);

            getRequest.onsuccess = initCallbackForSavingDocument({
                transaction, objectStore, getRequest, key, erdDocument, expectedRevision, loggingMessage,
                resolve, reject
            });

            getRequest.onerror = (event) => {
                reject(event);
            };
        });
    }

    delete(key: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const transaction = this.database.transaction([INDEXED_OBJECT_ERD_DOCUMENT], "readwrite");
            const objectStore = transaction.objectStore(INDEXED_OBJECT_ERD_DOCUMENT);
            const updateRequest = objectStore.delete(key);

            updateRequest.onsuccess = () => {
                console.info(`Succeed to delete document. key : ${key}`);
                resolve();
            };

            updateRequest.onerror = (event) => {
                const request = event.target as IDBRequest | null;
                const error = updateRequest.error || request?.error || event;
                console.error(`Failed to delete document. key : ${key}`, error);

                reject(error);
            };
        });
    }
}

type SavingDocumentContext = {
    transaction: IDBTransaction,
    objectStore: IDBObjectStore,
    getRequest: IDBRequest,
    key: string,
    erdDocument: ErdDocument,
    expectedRevision: number,
    loggingMessage: string,
    resolve: (saveResult: SaveErdDocumentResult) => void,
    reject: (error: unknown) => void
};

// compare-and-swap の check 部。expectedRevision が保存先の現在値と食い違う場合は書き込まず、
// 現在の内容を conflict として返す (先勝ち)。
const initCallbackForSavingDocument = (context: SavingDocumentContext): (() => void) => {
    return () => {
        const existing = context.getRequest.result as InternalDocument | undefined;
        const existingRevision = (existing != null) ? toRevision(existing) : 0;

        if ((existing != null) && (existingRevision !== context.expectedRevision)) {
            const latest = ErdDocument.toObject(existing.document);
            console.warn(`Conflict on save. key: ${context.key}, expected: ${context.expectedRevision}, `
                + `actual: ${existingRevision}. ${context.loggingMessage}`);

            context.resolve({ result: "conflict", latest, latestRevision: existingRevision });
            return;
        }

        doPutDocument(context);
    };
};

const doPutDocument = (context: SavingDocumentContext): void => {
    const nextRevision = context.expectedRevision + 1;
    const jsonDocument: InternalDocument = {
        key: context.key,
        documentName: context.erdDocument.documentName,
        lastUpdatedAt: context.erdDocument.lastUpdatedAt,
        databaseType: context.erdDocument.databaseSettingModel.databaseType,
        document: context.erdDocument.toJSON(),
        revision: nextRevision
    };

    const putRequest = context.objectStore.put(jsonDocument);

    // put の成功はまだコミットを意味しない。コミット前に採番済みの revision を返すと、
    // abort したときストアの revision だけが取り残され、呼び出し元は以降ずっと競合し続ける。
    context.transaction.oncomplete = () => {
        console.info(`Succeed to save document (${JSON.stringify(
            jsonDocument, ["key", "documentName", "lastUpdatedAt", "revision"])}): ${context.loggingMessage}`);
        context.resolve({ result: "saved", revision: nextRevision });
    };

    context.transaction.onabort = () => {
        const error = context.transaction.error || putRequest.error;
        console.error(`Aborted the transaction on saving document. ${context.loggingMessage}`, error);

        context.reject(error);
    };

    putRequest.onerror = (event) => {
        const request = event.target as IDBRequest | null;
        const error = putRequest.error || request?.error || event;
        console.error(`Failed to save document. ${context.loggingMessage}`, error);

        context.reject(error);
    };
};

const toRevision = (baseDocument: InternalDocument): number => {
    return (baseDocument.revision != null) ? baseDocument.revision : 0;
};

class NoOperationStorage implements ErdDocumentStorage {

    isAvailable(): boolean {
        return false;
    }

    findAll(): Promise<ErdDocumentSummary[]> {
        return Promise.resolve([]);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    find(_key: string): Promise<FoundDocument | null> {
        return Promise.resolve(null);
    }

    save(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _key: string, _erdDocument: ErdDocument, expectedRevision: number, _loggingMessage: string
    ): Promise<SaveErdDocumentResult> {
        return Promise.resolve({ result: "saved", revision: expectedRevision + 1 });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    delete(_key: string): Promise<void> {
        return Promise.resolve();
    }
}

export default initializeErdDocumentDB;
