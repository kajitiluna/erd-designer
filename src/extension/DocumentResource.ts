import * as vscode from 'vscode';
import * as crypto from 'crypto';

import ErdDocument from '~/models/ErdDocument';

type InnerErdBudget = {
    status: "ready";
    documentId: string;
    uri: vscode.Uri;
    erdDocument: ErdDocument;
    onUpdateDocument: (updating: string) => void;
} | {
    status: "empty";
    documentId: string;
    uri: vscode.Uri;
    onUpdateDocument: (updating: string) => void;
};

export class DocumentResource {

    // uri から documentId へのマッピング
    private readonly uriToIdMap: Map<string, string>;

    private readonly idToBudgetMap: Map<string, InnerErdBudget>;

    constructor() {
        this.uriToIdMap = new Map<string, string>();
        this.idToBudgetMap = new Map<string, InnerErdBudget>();
    }

    /**
     * ドキュメント管理者が該当ドキュメントを登録する。
     * 
     * @param textDocument ファイル参照
     * @param content ドキュメント本文
     * @param onUpdateDocument ドキュメント所有者以外からの更新操作を通知するコールバック関数
     */
    public register(
        textDocument: vscode.TextDocument, content: string,
        onUpdateDocument: (updating: string) => void
    ) {
        let erdDocument: ErdDocument | null = null;
        if (content.length > 0) {
            erdDocument = parseErdDocument(content);
            if (!erdDocument) {
                return;
            }
        }

        const uri = textDocument.uri;
        const documentId = crypto.createHash('sha256')
            .update(uri.toString())
            .digest('hex').substring(0, 16);
        const budget: InnerErdBudget = erdDocument
            ? { status: "ready", documentId, uri, erdDocument, onUpdateDocument }
            : { status: "empty", documentId, uri, onUpdateDocument };

        this.uriToIdMap.set(uri.toString(), documentId);
        this.idToBudgetMap.set(documentId, budget);

        console.info(`ErdDocumentResource registered document: ${uri.toString()} (id: ${documentId})`);
    }

    /**
     * ドキュメント管理者がドキュメントを更新する。
     * 
     * @param textDocument ファイル参照
     * @param content ドキュメント本文
     */
    public update(textDocument: vscode.TextDocument, content: string) {
        const documentId = this.uriToIdMap.get(textDocument.uri.toString());
        if (!documentId) {
            return;
        }
        const previousBudget = this.idToBudgetMap.get(documentId);
        if (!previousBudget) {
            return;
        }
        const erdDocument = parseErdDocument(content);
        if (!erdDocument) {
            return;
        }

        const nextBudget: InnerErdBudget = { ...previousBudget, status: "ready", erdDocument };
        this.idToBudgetMap.set(documentId, nextBudget);

        console.info(`ErdDocumentResource updated document: ${textDocument.uri.toString()} (id: ${documentId})`);
    }

    /**
     * ドキュメント管理者が該当ドキュメントを除外する。
     * 
     * @param textDocument ファイル参照
     */
    public remove(textDocument: vscode.TextDocument) {
        const documentId = this.uriToIdMap.get(textDocument.uri.toString());
        if (!documentId) {
            return;
        }

        this.idToBudgetMap.delete(documentId);
        this.uriToIdMap.delete(textDocument.uri.toString());

        console.info(`ErdDocumentResource removed document: ${textDocument.uri.toString()} (id: ${documentId})`);
    }

    /**
     * ドキュメントの更新を依頼する。
     * 
     * @param documentId ドキュメントID
     * @param erdDocument 更新内容
     */
    public notify(documentId: string, erdDocument: ErdDocument) {
        const budget = this.idToBudgetMap.get(documentId);
        if (!budget) {
            return;
        }

        budget.onUpdateDocument(JSON.stringify(erdDocument.toJSON()));
    }

    public fetchDocuments(): ErdDocumentBudget[] {
        return Array.from(this.idToBudgetMap.values())
            .map(budget => convertBudget(budget))
            .filter((budget): budget is ErdDocumentBudget => (budget !== null));
    }

    public findById(documentId: string): ErdDocumentBudget | null {
        const budget = this.idToBudgetMap.get(documentId);
        if (!budget) {
            return null;
        }

        return convertBudget(budget);
    }

    public findByUri(uri: string): ErdDocumentBudget | null {
        const documentId = this.uriToIdMap.get(uri);
        if (!documentId) {
            return null;
        }
        const budget = this.idToBudgetMap.get(documentId);
        if (!budget) {
            return null;
        }

        return convertBudget(budget);
    }
}

export type ErdDocumentBudget = {
    documentId: string;
    uri: string;
    erdDocument: ErdDocument;
};

const parseErdDocument = (content: string): ErdDocument | null => {
    try {
        return ErdDocument.toObject(JSON.parse(content));
    } catch {
        return null;
    }
};

const convertBudget = (budget: InnerErdBudget): ErdDocumentBudget | null => {
    if (budget.status !== "ready") {
        return null;
    }

    return {
        documentId: budget.documentId,
        uri: budget.uri.toString(),
        erdDocument: budget.erdDocument
    };
}