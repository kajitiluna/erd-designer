import * as path from 'path';
import * as vscode from 'vscode';

import ErdDocument from '~/models/ErdDocument';
import DocumentBudget, { RectangleType } from '~/agent-tools/DocumentBudget';
import { CreatedDocument, DocumentResource, generateDocumentId } from '~/agent-tools/DocumentResource';
import { initInvalidParams } from '~/agent-tools/tools/support';

// package.json の contributes.customEditors で宣言した viewType と一致させる
const ERD_EDITOR_VIEW_TYPE = 'erdDesigner.erdEditor';

// register は webview の ready 通知を受けてから走るため、エディタを開いた直後は登録が間に合わない
const REGISTRATION_WAIT_INTERVAL_MILLIS = 100;
const REGISTRATION_WAIT_LIMIT_MILLIS = 3000;

// 同一 URI を複数パネルが開くことがあるため、通知先は 1 個の関数ではなく集合で持つ。
type InnerErdBudget = {
    status: "ready";
    documentId: string;
    uri: vscode.Uri;
    erdDocument: ErdDocument;
    drawnRectangles: Map<string, RectangleType>;
    onUpdateDocumentHandlers: Set<(updating: string) => void>;
} | {
    status: "empty";
    documentId: string;
    uri: vscode.Uri;
    drawnRectangles: Map<string, RectangleType>;
    onUpdateDocumentHandlers: Set<(updating: string) => void>;
};

export class VsCodeDocumentResource implements DocumentResource {

    // uri から documentId へのマッピング
    private readonly uriToIdMap: Map<string, string>;

    private readonly idToBudgetMap: Map<string, InnerErdBudget>;

    constructor() {
        this.uriToIdMap = new Map<string, string>();
        this.idToBudgetMap = new Map<string, InnerErdBudget>();
    }

    public async create(filePath: string, erdDocument: ErdDocument): Promise<CreatedDocument> {
        const uri = resolveFileUri(filePath);

        const fileStat = await statOrNull(uri);
        if (fileStat != null) {
            throw initInvalidParams(`File already exists: ${uri.fsPath}`);
        }

        // ERD Designer アプリの保存形式(4スペースインデント)に合わせる
        const jsonContent = JSON.stringify(erdDocument.toJSON(), null, 4);
        await vscode.workspace.fs.writeFile(uri, Buffer.from(jsonContent, 'utf-8'));

        // カスタムエディタで開くことで register が走り、以降のツール呼び出しから参照できるようになる
        await vscode.commands.executeCommand('vscode.openWith', uri, ERD_EDITOR_VIEW_TYPE);

        const documentId = generateDocumentId(uri.toString());
        await this.doWaitForRegistration(documentId);

        console.info(`VsCodeDocumentResource created document: ${uri.toString()} (id: ${documentId})`);
        return { documentId, fileUri: uri.toString() };
    }

    private async doWaitForRegistration(documentId: string): Promise<void> {
        const limitAt = Date.now() + REGISTRATION_WAIT_LIMIT_MILLIS;

        while (Date.now() < limitAt) {
            if (this.findById(documentId) != null) {
                return;
            }

            await new Promise(resolve => setTimeout(resolve, REGISTRATION_WAIT_INTERVAL_MILLIS));
        }

        // documentId は uri から一意に決まるため、待てなくても find-document-by-filepath で復帰できる
        console.warn(`Timed out waiting for document registration: ${documentId}`);
    }

    /**
     * ドキュメント管理者が該当ドキュメントを登録する。同一 URI を別パネルが既に開いている場合は、
     * 既存のドキュメント状態はそのままに、通知先としてこのパネルのハンドラを追加する。
     *
     * @param textDocument ファイル参照
     * @param content ドキュメント本文
     * @param onUpdateDocument ドキュメント所有者以外からの更新操作を通知するコールバック関数
     * @returns このパネルの登録を取り消す関数。パネルが閉じたときに呼び出す
     */
    public register(
        textDocument: vscode.TextDocument, content: string,
        onUpdateDocument: (updating: string) => void
    ): () => void {
        const uri = textDocument.uri;
        const documentId = generateDocumentId(uri.toString());

        const existingBudget = this.idToBudgetMap.get(documentId);
        if (existingBudget != null) {
            existingBudget.onUpdateDocumentHandlers.add(onUpdateDocument);
            this.uriToIdMap.set(uri.toString(), documentId);

            console.info(`VsCodeDocumentResource added handler to existing document: ${uri.toString()} (id: ${documentId})`);
            return () => this.doUnregisterHandler(documentId, onUpdateDocument);
        }

        let erdDocument: ErdDocument | null = null;
        if (content.length > 0) {
            erdDocument = parseErdDocument(content);
            if (erdDocument == null) {
                return () => { };
            }
        }

        const drawnRectangles = new Map<string, RectangleType>();
        const onUpdateDocumentHandlers = new Set([onUpdateDocument]);
        const budget: InnerErdBudget = erdDocument
            ? { status: "ready", documentId, uri, drawnRectangles, onUpdateDocumentHandlers, erdDocument }
            : { status: "empty", documentId, uri, drawnRectangles, onUpdateDocumentHandlers };

        this.uriToIdMap.set(uri.toString(), documentId);
        this.idToBudgetMap.set(documentId, budget);

        console.info(`VsCodeDocumentResource registered document: ${uri.toString()} (id: ${documentId})`);
        return () => this.doUnregisterHandler(documentId, onUpdateDocument);
    }

    /**
     * パネル 1 枚分の通知先ハンドラを取り消す。最後の 1 枚だった場合のみ、
     * ドキュメントそのものを管理対象から除外する。
     *
     * @param documentId ドキュメントID
     * @param onUpdateDocument register で渡したハンドラと同一の関数参照
     */
    private doUnregisterHandler(documentId: string, onUpdateDocument: (updating: string) => void) {
        const budget = this.idToBudgetMap.get(documentId);
        if (budget == null) {
            return;
        }

        budget.onUpdateDocumentHandlers.delete(onUpdateDocument);
        if (budget.onUpdateDocumentHandlers.size > 0) {
            return;
        }

        this.idToBudgetMap.delete(documentId);
        this.uriToIdMap.delete(budget.uri.toString());

        console.info(`VsCodeDocumentResource removed document (last panel closed): ${budget.uri.toString()} (id: ${documentId})`);
    }

    private doFindBudget(textDocument: vscode.TextDocument) {
        const documentId = this.uriToIdMap.get(textDocument.uri.toString());
        if (documentId == null) {
            console.debug(`documentId not found for uri: ${textDocument.uri.toString()}`);
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
    public update(textDocument: vscode.TextDocument, content: Record<string, unknown>): boolean {
        const previous = this.doFindBudget(textDocument);
        if (previous == null) {
            return false;
        }

        const erdDocument = tryBuildErdDocument(content);
        if (erdDocument == null) {
            console.warn(`failed to build ErdDocument for uri: ${textDocument.uri.toString()}`);
            return false;
        }

        const nextBudget: InnerErdBudget = { ...previous.budget, status: "ready", erdDocument };
        this.idToBudgetMap.set(previous.documentId, nextBudget);

        console.info(`VsCodeDocumentResource updated document: ${textDocument.uri.toString()} (id: ${previous.documentId})`);
        return true;
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

        console.info(`VsCodeDocumentResource updated drawn rectangles: ${textDocument.uri.toString()} (id: ${previous.documentId})`);
    }

    /**
     * ドキュメントの更新を依頼する。開いている全パネルへ通知する。
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

        const nextBudget: InnerErdBudget = { ...erdBudget, status: "ready", erdDocument };
        this.idToBudgetMap.set(documentId, nextBudget);

        const jsonContent = JSON.stringify(erdDocument.toJSON());
        erdBudget.onUpdateDocumentHandlers.forEach(handler => handler(jsonContent));
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

const resolveFileUri = (filePath: string): vscode.Uri => {
    if (path.isAbsolute(filePath)) {
        return vscode.Uri.file(filePath);
    }

    // 拡張機能には CLI のようなカレントディレクトリがないため、相対パスの基準はワークスペースに限る。
    // 複数フォルダがある場合はどれを基準にするか一意に決められないため、絶対パス指定を要求する。
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    if (workspaceFolders.length !== 1) {
        throw initInvalidParams(
            `Relative file path requires exactly one open workspace folder (found ${workspaceFolders.length}). `
            + `Specify an absolute path: ${filePath}`
        );
    }

    return vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
};

const statOrNull = async (uri: vscode.Uri): Promise<vscode.FileStat | null> => {
    try {
        return await vscode.workspace.fs.stat(uri);
    } catch {
        return null;
    }
};

const parseErdDocument = (content: string): ErdDocument | null => {
    try {
        return ErdDocument.toObject(JSON.parse(content));
    } catch {
        return null;
    }
};

const tryBuildErdDocument = (content: Record<string, unknown>): ErdDocument | null => {
    try {
        return ErdDocument.toObject(content);
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
