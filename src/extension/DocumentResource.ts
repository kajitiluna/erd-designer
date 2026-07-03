import * as vscode from 'vscode';
import * as crypto from 'crypto';

import ErdDocument from '~/models/ErdDocument';
import DocumentBudget, { RectangleType } from '~/extension/mcpserver/DocumentBudget';

type InnerErdBudget = {
    status: "ready";
    documentId: string;
    uri: vscode.Uri;
    erdDocument: ErdDocument;
    drawnRectangles: Map<string, RectangleType>;
    onUpdateDocument: (updating: string) => void;
} | {
    status: "empty";
    documentId: string;
    uri: vscode.Uri;
    drawnRectangles: Map<string, RectangleType>;
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
            if (erdDocument == null) {
                return;
            }
        }

        const uri = textDocument.uri;
        const documentId = crypto.createHash('sha256')
            .update(uri.toString())
            .digest('hex').substring(0, 16);
        const drawnRectangles = new Map<string, RectangleType>();
        const budget: InnerErdBudget = erdDocument
            ? { status: "ready", documentId, uri, drawnRectangles, onUpdateDocument, erdDocument }
            : { status: "empty", documentId, uri, drawnRectangles, onUpdateDocument };

        this.uriToIdMap.set(uri.toString(), documentId);
        this.idToBudgetMap.set(documentId, budget);

        console.info(`ErdDocumentResource registered document: ${uri.toString()} (id: ${documentId})`);
    }

    private doFindBudget(textDocument: vscode.TextDocument) {
        const documentId = this.uriToIdMap.get(textDocument.uri.toString());
        if (documentId == null) {
            console.warn(`documentId not found for uri: ${textDocument.uri.toString()}`);
            return null;
        }

        const budget = this.idToBudgetMap.get(documentId);
        if (budget == null) {
            console.warn(`budget not found for documentId: ${documentId}, uri: ${textDocument.uri.toString()}`);
            return null;
        }

        return { documentId, budget };
    }

    /**
     * ドキュメント管理者がドキュメントを更新する。
     * 
     * @param textDocument ファイル参照
     * @param content ドキュメント本文
     */
    public update(textDocument: vscode.TextDocument, content: string) {
        const previous = this.doFindBudget(textDocument);
        if (previous == null) {
            return;
        }

        const erdDocument = parseErdDocument(content);
        if (erdDocument == null) {
            console.warn(`failed to parse ErdDocument for uri: ${textDocument.uri.toString()}, content : ${content}`);
            return;
        }

        const nextBudget: InnerErdBudget = { ...previous.budget, status: "ready", erdDocument };
        this.idToBudgetMap.set(previous.documentId, nextBudget);

        console.info(`ErdDocumentResource updated document: ${textDocument.uri.toString()} (id: ${previous.documentId})`);
    }

    public updateDrawnRectangles(
        textDocument: vscode.TextDocument, rectangles: { tableId: string; rectangle: RectangleType }[]
    ) {
        const previous = this.doFindBudget(textDocument);
        if (previous == null) {
            return;
        }

        const drawnRectangles = new Map<string, RectangleType>(rectangles.map(item => [item.tableId, item.rectangle]));
        const nextBudget: InnerErdBudget = { ...previous.budget, drawnRectangles };
        this.idToBudgetMap.set(previous.documentId, nextBudget);

        console.info(`ErdDocumentResource updated drawn rectangles: ${textDocument.uri.toString()} (id: ${previous.documentId})`);
    }

    /**
     * ドキュメント管理者が該当ドキュメントを除外する。
     * 
     * @param textDocument ファイル参照
     */
    public remove(textDocument: vscode.TextDocument) {
        const documentId = this.uriToIdMap.get(textDocument.uri.toString());
        if (documentId == null) {
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
        const erdBudget = this.idToBudgetMap.get(documentId);
        if (erdBudget == null) {
            return;
        }

        // ここでは簡易的にオブジェクトの同一性で判定する
        if ((erdBudget.status === "ready") && (erdBudget.erdDocument === erdDocument)) {
            return;
        }

        erdBudget.onUpdateDocument(JSON.stringify(erdDocument.toJSON()));
    }

    public fetchDocuments(): DocumentBudget[] {
        return Array.from(this.idToBudgetMap.values())
            .map(budget => convertBudget(budget))
            .filter((budget): budget is DocumentBudget => (budget !== null));
    }

    public findById(documentId: string): DocumentBudget | null {
        const budget = this.idToBudgetMap.get(documentId);
        if (budget == null) {
            return null;
        }

        return convertBudget(budget);
    }

    public findByUri(uri: string): DocumentBudget | null {
        const documentId = this.uriToIdMap.get(uri);
        if (documentId == null) {
            return null;
        }
        const budget = this.idToBudgetMap.get(documentId);
        if (budget == null) {
            return null;
        }

        return convertBudget(budget);
    }
}

const parseErdDocument = (content: string): ErdDocument | null => {
    try {
        return ErdDocument.toObject(JSON.parse(content));
    } catch {
        return null;
    }
};

const convertBudget = (budget: InnerErdBudget): DocumentBudget | null => {
    if (budget.status !== "ready") {
        return null;
    }

    return new DocumentBudget({
        documentId: budget.documentId,
        uri: budget.uri.toString(),
        erdDocument: budget.erdDocument,
        rectangles: budget.drawnRectangles
    });
}
