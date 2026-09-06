import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

import DocumentBudget, { RectangleType } from '~/agent-tools/DocumentBudget';
import { CreatedDocument, DocumentResource, generateDocumentId } from '~/agent-tools/DocumentResource';
import { initInvalidParams } from '~/agent-tools/tools/support';
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

    public async create(filePath: string, erdDocument: ErdDocument): Promise<CreatedDocument> {
        const absolutePath = path.resolve(filePath);
        if (fs.existsSync(absolutePath)) {
            throw initInvalidParams(`File already exists: ${absolutePath}`);
        }

        // 親ディレクトリの自動生成は意図しない場所への書き込みにつながるため、存在しなければ失敗させる
        const directoryPath = path.dirname(absolutePath);
        if (fs.existsSync(directoryPath) === false) {
            throw initInvalidParams(`Directory does not exist: ${directoryPath}`);
        }

        const fileContent = toFileContent(erdDocument);
        fs.writeFileSync(absolutePath, fileContent);

        return this.doRegister(absolutePath, erdDocument);
    }

    /**
     * .erd ファイルが存在する場合のみ読み込んで登録する。
     *
     * @param filePath .erd ファイルのパス
     * @returns 登録したドキュメントの documentId。ファイルが存在しない場合は null
     */
    public tryRegister(filePath: string): string | null {
        const absolutePath = path.resolve(filePath);
        if (fs.existsSync(absolutePath) === false) {
            return null;
        }

        return this.register(absolutePath);
    }

    /**
     * .erd ファイルを読み込んで登録する。
     *
     * @param filePath .erd ファイルのパス
     * @returns 登録したドキュメントの documentId
     * @throws ファイルが読み込めない、または内容が ErdDocument として解釈できない場合
     */
    private register(filePath: string): string {
        const absolutePath = path.resolve(filePath);
        const content = fs.readFileSync(absolutePath, 'utf-8');
        const erdDocument = ErdDocument.toObject(JSON.parse(content));

        const created = this.doRegister(absolutePath, erdDocument);

        return created.documentId;
    }

    /**
     * .erd ファイルを読み込んで登録し、ErdDocument を返す。
     * 登録自体は後続の findById / findByUri から参照するために行うものであり、
     * 呼び出し側は documentId を扱う必要がない(register との違い)。
     *
     * @param filePath .erd ファイルのパス
     * @returns 読み込んだ ErdDocument
     * @throws ファイルが読み込めない、または内容が ErdDocument として解釈できない場合
     */
    public load(filePath: string): ErdDocument {
        const absolutePath = path.resolve(filePath);
        const content = fs.readFileSync(absolutePath, 'utf-8');
        const erdDocument = ErdDocument.toObject(JSON.parse(content));

        this.doRegister(absolutePath, erdDocument);

        return erdDocument;
    }

    private doRegister(absolutePath: string, erdDocument: ErdDocument): CreatedDocument {
        const fileUri = pathToFileURL(absolutePath).href;
        const documentId = generateDocumentId(fileUri);

        this.uriToIdMap.set(fileUri, documentId);
        this.idToBudgetMap.set(documentId, { documentId, fileUri, filePath: absolutePath, erdDocument });

        return { documentId, fileUri };
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

        const fileContent = toFileContent(erdDocument);
        fs.writeFileSync(budget.filePath, fileContent);

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

// ERD Designer アプリの保存形式(4スペースインデント)に合わせ、アプリ保存との差分を無くす
const toFileContent = (erdDocument: ErdDocument): string => {
    return JSON.stringify(erdDocument.toJSON(), null, 4);
};

const convertBudget = (budget: FileErdBudget): DocumentBudget => {
    // CLI にはキャンバス描画が存在しないため、描画済み矩形は常に空として扱う
    return new DocumentBudget({
        documentId: budget.documentId,
        uri: budget.fileUri,
        erdDocument: budget.erdDocument,
        rectangles: new Map<string, RectangleType>()
    });
};
