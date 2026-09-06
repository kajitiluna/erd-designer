import { DdlCommentStyle } from "~/models/ExportDdlSettingModel";

export type DdlCommentOption = {
    withComment: boolean;
    commentStyle: DdlCommentStyle;
    commentSeparator: string;
};

/**
 * DDL に出力するコメント文字列を決める。
 * 物理名と一致する内容はコメントとして意味を持たないため空文字を返す。
 * この規則を通さずに論理名を比較すると、論理名を設定していない列が一斉に差分になる
 * (db-diff/erd-diff のスキーマ比較でも同じ規則を再現する必要がある)。
 */
export const initDdlComment = (
    physicalName: string, logicalName: string, description: string, option: DdlCommentOption
): string => {
    if (option.withComment === false) {
        return "";
    }

    if (option.commentStyle === "logical_name") {
        return (logicalName !== physicalName) ? logicalName : "";
    }

    const comment = (description !== "") ? `${logicalName}${option.commentSeparator}${description}` : logicalName;
    return (comment !== physicalName) ? comment : "";
};
