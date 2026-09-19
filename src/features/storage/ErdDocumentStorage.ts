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
     * ドキュメントを保存する。
     * expectedRevision が保存先の現在の revision と一致する場合のみ書き込み、
     * 一致しない場合は書き込まずに現在の内容を conflict として返す (先勝ち、後者はエラー扱い)。
     */
    save(key: string, erdDocument: ErdDocument,
        expectedRevision: number, loggingMessage: string): Promise<SaveErdDocumentResult>

    delete(key: string): Promise<void>
};
