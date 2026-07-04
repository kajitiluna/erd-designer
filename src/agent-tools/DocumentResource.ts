import DocumentBudget from '~/agent-tools/DocumentBudget';
import ErdDocument from '~/models/ErdDocument';

/**
 * ツール群(src/agent-tools/tools)がドキュメントへアクセスするための接点。
 * ドキュメントの登録・破棄はホスト側(VSCode 拡張、CLI など)の実装が担う。
 */
export interface DocumentResource {

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
