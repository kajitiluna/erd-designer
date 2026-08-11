import * as crypto from 'crypto';

import DocumentBudget from '~/agent-tools/DocumentBudget';
import ErdDocument from '~/models/ErdDocument';

/**
 * ツール群(src/agent-tools/tools)がドキュメントへアクセスするための接点。
 * ドキュメントの登録・破棄はホスト側(VSCode 拡張、CLI など)の実装が担う。
 */
/**
 * 新規作成したドキュメントの所在。documentId は後続のツール呼び出しの入力、
 * fileUri は利用者に提示する保存先を表す。
 */
export type CreatedDocument = {
    documentId: string;
    fileUri: string;
};

export interface DocumentResource {

    /**
     * 新規ドキュメントをファイルとして作成し、以降のツール呼び出しから参照できる状態にする。
     *
     * @param filePath 作成先のファイルパス
     * @param erdDocument 保存内容
     * @throws 作成先に既にファイルが存在する場合。既存の設計を失わないため上書きはしない
     */
    create(filePath: string, erdDocument: ErdDocument): Promise<CreatedDocument>;

    /**
     * ドキュメントの更新を依頼する。
     *
     * @param documentId ドキュメントID
     * @param erdDocument 更新内容
     */
    notify(documentId: string, erdDocument: ErdDocument): void;

    fetchDocuments(): DocumentBudget[];

    findById(documentId: string): DocumentBudget | null;

    findByUri(uri: string): DocumentBudget | null;
}

/**
 * ドキュメントの uri から documentId を導出する。VSCode 拡張・CLI 双方の
 * DocumentResource 実装で同じ ID を得るための共通ロジック。
 *
 * @param uri ドキュメントの uri
 */
export const generateDocumentId = (uri: string): string => {
    return crypto.createHash('sha256').update(uri).digest('hex').substring(0, 16);
};
