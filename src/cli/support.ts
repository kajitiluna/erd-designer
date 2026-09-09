import { FileDocumentResource } from "~/agent-tools/FileDocumentResource";
import { toOsFilePath } from "~/agent-tools/tools/support";
import ErdDocument from "~/models/ErdDocument";

/** 読み込み結果。成功と失敗を1つの union で表し、null と message の両持ちを作らない。 */
type LoadErdDocumentResult =
    { resultType: "loaded", erdDocument: ErdDocument }
    | { resultType: "failed", message: string };

/** CLI が受け取るファイル指定(OS パス / file:// URI)から .erd を読む唯一の入口。 */
export class ErdDocumentFile {

    private constructor() {
        // do nothing
    }

    /**
     * 例外ではなく union で返す。CLI の各コマンドにとって読み込み失敗は終了コードを決める分岐であり、
     * 制御構文として書けるほうが素直なため。
     */
    public static load(fileOption: string): LoadErdDocumentResult {
        const filePath = toOsFilePath(fileOption);

        try {
            const erdDocument = new FileDocumentResource().load(filePath);
            return { resultType: "loaded", erdDocument };
        } catch (error: unknown) {
            const detail = (error instanceof Error) ? error.message : String(error);
            return { resultType: "failed", message: `Failed to load document: ${filePath}\n  cause: ${detail}` };
        }
    }
}
