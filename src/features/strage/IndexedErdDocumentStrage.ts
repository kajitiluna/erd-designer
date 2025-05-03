import ErdDocumentStrage from "~/features/strage/ErdDocumentStrage";
import ErdDocumentSummary from "~/features/strage/ErdDocumentSummary";
import { INDEXED_DB_NAME, INDEXED_DB_VERSION, INDEXED_OBJECT_ERD_DOCUMENT } from "~/features/strage/IndexedDBConst";
import ErdDocument from "~/models/ErdDocument";

type InternalDocument = {
    key: string;
    documentName: string;
    lastUpdatedAt: Date;
    document: object;
};

const initializeErdDocumentDB = () => {
    return new Promise<ErdDocumentStrage>((resolve) => {
        const request = indexedDB.open(INDEXED_DB_NAME, INDEXED_DB_VERSION);
        request.onerror = (event) => {
            console.warn(`Occuured error in creating IndexedDB instance. Detail : ${event}`);
            resolve(new NoOperationStrage());
        };

        request.onsuccess = () => {
            const database = request.result;
            resolve(new IndexedDBStrage(database));
        };

        request.onupgradeneeded = () => {
            const database = request.result;
            database.createObjectStore(INDEXED_OBJECT_ERD_DOCUMENT, { keyPath: "key" });
            console.info("Upgraded IndexedDB instance.")

            resolve(new IndexedDBStrage(database));
        };
    });
};

class IndexedDBStrage implements ErdDocumentStrage {

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
                if (!cursor) {
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
                    lastUpdatedAt: baseDocument.lastUpdatedAt
                });

                cursor.continue();
            };

            request.onerror = (event) => {
                reject(event);
            };
        });
    }

    find(key: string): Promise<ErdDocument | null> {
        return new Promise<ErdDocument | null>((resolve, reject) => {
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
                console.debug(`Succeed to find document. document : ${JSON.stringify(baseDocument.document)}`);

                resolve(erdDocument);
            };

            request.onerror = (event) => {
                reject(event);
            };
        });
    }

    save(key: string, erdDocument: ErdDocument): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const jsonDocument: InternalDocument = {
                key: key,
                documentName: erdDocument.documentName,
                lastUpdatedAt: erdDocument.lastUpdatedAt,
                document: erdDocument.toJSON(),
            };

            const transaction = this.database.transaction([INDEXED_OBJECT_ERD_DOCUMENT], "readwrite");
            const objectStore = transaction.objectStore(INDEXED_OBJECT_ERD_DOCUMENT);
            const updateRequest = objectStore.put(jsonDocument);

            updateRequest.onsuccess = () => {
                console.info(`Succeed to save document. ${JSON.stringify(jsonDocument)}`);
                resolve();
            };

            updateRequest.onerror = (event) => {
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
                reject(event);
            };
        });
    }
}

class NoOperationStrage implements ErdDocumentStrage {

    isAvailable(): boolean {
        return false;
    }

    findAll(): Promise<ErdDocumentSummary[]> {
        return Promise.resolve([]);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    find(_key: string): Promise<ErdDocument | null> {
        return Promise.resolve(null);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    save(_key: string, _erdDocument: ErdDocument): Promise<void> {
        return Promise.resolve();
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    delete(_key: string): Promise<void> {
        return Promise.resolve();
    }
}

export default initializeErdDocumentDB;
