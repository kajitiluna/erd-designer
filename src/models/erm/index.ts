import ErdDocument from "~/models/ErdDocument";
import { importErm } from "~/models/erm/erm-importer";
import { loadErm } from "~/models/erm/erm-loader";
import { ErmLoadSummary } from "~/models/erm/support";

export type { ErmLoadSummary } from "~/models/erm/support";

type ErmConvertResult = {
    result: "success",
    erdDocument: ErdDocument,
    summaries: ErmLoadSummary[]
} | {
    result: "failure",
    // 続行不能な事由は failureMessage だけが持つ。summaries は自動継続できた事項のみを保持し、
    // 同一内容が error と warn の両方に重複表示されないようにする。
    summaries: ErmLoadSummary[],
    failureMessage: string
};

/**
 * ERMaster (org.insightech.er) が出力する `.erm` ファイルを ErdDocument に変換する。
 * 対応DBは MySQL / PostgreSQL / SQLite / SQL Server (SQLServer, SQLServer 2008) の4種のみで、
 * それ以外の `<settings>/<database>` を指定するファイルは読み込みエラーとなる。
 * View / 画像 / テーブルスペース / シーケンス / トリガ / テストデータ / 変更履歴など
 * erd-designer に対応モデルが無い要素は、変換を継続したまま summaries に記録される。
 *
 * @param documentName 生成する ErdDocument のドキュメント名 (通常は拡張子を除いたファイル名)
 * @param ermText `.erm` ファイルの内容 (UTF-8 文字列)
 */
export const convertErm = (documentName: string, ermText: string): ErmConvertResult => {
    const loadResult = loadErm(ermText);
    if (loadResult.outcome === "failure") {
        const failureSummaries = loadResult.summaries.filter(summary => (summary.result === "failure"));
        const warningSummaries = loadResult.summaries.filter(summary => (summary.result !== "failure"));
        const failureMessage = failureSummaries.map(summary => summary.message).join(" ");

        return {
            result: "failure",
            summaries: warningSummaries,
            failureMessage
        };
    }

    const importResult = importErm(documentName, loadResult);

    return {
        result: "success",
        erdDocument: importResult.erdDocument,
        summaries: importResult.summaries
    };
};
