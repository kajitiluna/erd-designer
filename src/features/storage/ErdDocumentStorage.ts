import ErdDocumentSummary from "~/features/storage/ErdDocumentSummary";
import ErdDocument from "~/models/ErdDocument";

/**
 * revision は複数ウィンドウからの同時保存を検知するための楽観排他バージョン。
 * 未保存のドキュメントは 0 として扱う (revision は 1 保存ごとに 1 ずつ増える)。
 */
export type FoundDocument = {
    erdDocument: ErdDocument,
    revision: number
};

export type SaveErdDocumentResult =
    | { result: "saved", revision: number }
    | { result: "conflict", latest: ErdDocument, latestRevision: number };

export default interface ErdDocumentStorage {

    isAvailable(): boolean

    findAll(): Promise<ErdDocumentSummary[]>

    find(key: string): Promise<FoundDocument | null>

    /**
     * Saves the document only when expectedRevision matches the stored revision, resolving
     * to a conflict with the stored content otherwise (first write wins).
     * A record that no longer exists is written unconditionally: a document deleted from
     * another window must not cost the editing window its work.
     */
    save(key: string, erdDocument: ErdDocument,
        expectedRevision: number, loggingMessage: string): Promise<SaveErdDocumentResult>

    delete(key: string): Promise<void>
};
