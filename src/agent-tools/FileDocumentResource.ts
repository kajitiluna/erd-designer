import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

import DocumentBudget, { RectangleType } from '~/agent-tools/DocumentBudget';
import { DocumentResource, generateDocumentId } from '~/agent-tools/DocumentResource';
import ErdDocument from '~/models/ErdDocument';

type FileErdBudget = {
    documentId: string;
    fileUri: string;
    filePath: string;
    erdDocument: ErdDocument;
};

/**
 * .erd ファイルを直接読み書きする DocumentResource 実装。
 * VSCode などのホストアプリケーションを介さず、CLI から利用する。
 */
export class FileDocumentResource implements DocumentResource {

    private readonly uriToIdMap: Map<string, string>;
    private readonly idToBudgetMap: Map<string, FileErdBudget>;

    constructor() {
        this.uriToIdMap = new Map<string, string>();
        this.idToBudgetMap = new Map<string, FileErdBudget>();
    }

    /**
     * .erd ファイルを読み込んで登録する。
     *
     * @param filePath .erd ファイルのパス
     * @returns 登録したドキュメントの documentId
     * @throws ファイルが読み込めない、または内容が ErdDocument として解釈できない場合
     */
    public register(filePath: string): string {
        const absolutePath = path.resolve(filePath);
        const content = fs.readFileSync(absolutePath, 'utf-8');
        const erdDocument = ErdDocument.toObject(JSON.parse(content));

        const fileUri = pathToFileURL(absolutePath).href;
        const documentId = generateDocumentId(fileUri);

        this.uriToIdMap.set(fileUri, documentId);
        this.idToBudgetMap.set(documentId, { documentId, fileUri, filePath: absolutePath, erdDocument });

        return documentId;
    }

    public notify(documentId: string, erdDocument: ErdDocument): void {
        const budget = this.idToBudgetMap.get(documentId);
        if (budget == null) {
            return;
        }

        // ここでは簡易的にオブジェクトの同一性で判定する
        if (budget.erdDocument === erdDocument) {
            return;
        }

        // ERD Designer アプリの保存形式(4スペースインデント)に合わせる
        const jsonContent = JSON.stringify(erdDocument.toJSON(), null, 4);
        fs.writeFileSync(budget.filePath, jsonContent);

        this.idToBudgetMap.set(documentId, { ...budget, erdDocument });
    }

    public fetchDocuments(): DocumentBudget[] {
        return Array.from(this.idToBudgetMap.values()).map(budget => convertBudget(budget));
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

        return this.findById(documentId);
    }
}

const convertBudget = (budget: FileErdBudget): DocumentBudget => {
    // CLI にはキャンバス描画が存在しないため、描画済み矩形は常に空として扱う
    return new DocumentBudget({
        documentId: budget.documentId,
        uri: budget.fileUri,
        erdDocument: budget.erdDocument,
        rectangles: new Map<string, RectangleType>()
    });
};
