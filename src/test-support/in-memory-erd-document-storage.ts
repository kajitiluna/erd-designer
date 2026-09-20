import ErdDocumentStorage, { FoundDocument, SaveResult } from "~/features/storage/ErdDocumentStorage";
import ErdDocumentSummary from "~/features/storage/ErdDocumentSummary";
import ErdDocument from "~/models/ErdDocument";

type StoredRecord = { erdDocument: ErdDocument, revision: number };

/**
 * 実ブラウザでは複数ウィンドウが同一の IndexedDB を共有する。テストではその共有部分だけを
 * インメモリで代替し、revision による先勝ち判定 (compare-and-swap) の挙動だけを写し取る。
 * IndexedDB 実装そのものの検証は IndexedErdDocumentStorage.test.ts が担う。
 */
export class InMemoryErdDocumentStorage implements ErdDocumentStorage {

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

    public save(
        key: string, erdDocument: ErdDocument, _loggingMessage: string, expectedRevision: number
    ): Promise<SaveResult> {
        const existing = this.records.get(key);
        const existingRevision = existing?.revision ?? 0;

        if ((existing != null) && (existingRevision !== expectedRevision)) {
            return Promise.resolve({
                result: "conflict", latest: existing.erdDocument, latestRevision: existingRevision
            });
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
