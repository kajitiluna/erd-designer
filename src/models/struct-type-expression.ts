import ColumnModel from "~/models/database/ColumnModel";
import SimpleColumnModel from "~/models/database/SimpleColumnModel";
import { overrideColumnName } from "~/models/database/support";
import StructColumnShareModel from "~/models/database/StructColumnShareModel";
import ErdDocument from "~/models/ErdDocument";

type StructTypeExpressionOptions = {
    escape: (value: string) => string;
    /** 循環参照を検出した位置に埋める代替型式。省略時は例外を送出する。 */
    onRecursiveStruct?: ((structShare: StructColumnShareModel) => string) | undefined;
};

/**
 * struct 定義から `STRUCT<name TYPE, ...>` (isArray の場合は `ARRAY<STRUCT<...>>`) 形式の型式を再帰的に構築する。
 * DDL 出力とエージェント向けレスポンスの双方が同じ展開ロジックを必要とするため、ここに中立モジュールとして抽出している。
 * フィールド名・カラム名は ColumnModel 側の名前を優先する (overrideColumnName)。
 * ネストした struct はメンバーの struct バリアント ColumnModel を経由して再帰する。
 * 解決不能な参照はスキップする。
 */
export const buildStructTypeExpression = (
    erdDocument: ErdDocument, structShare: StructColumnShareModel, options: StructTypeExpressionOptions
): string => {
    return doBuildStructTypeExpression(erdDocument, structShare, new Set(), options);
};

const doBuildStructTypeExpression = (
    erdDocument: ErdDocument, structShare: StructColumnShareModel,
    visitedStructIds: ReadonlySet<string>, options: StructTypeExpressionOptions
): string => {
    if (visitedStructIds.has(structShare.structShareModelId)) {
        if (options.onRecursiveStruct != null) {
            return options.onRecursiveStruct(structShare);
        }

        throw new Error(`Struct is recursive definition. structColumnShareModelId=${structShare.structShareModelId}`);
    }

    const innerVisitedIds = new Set(visitedStructIds);
    innerVisitedIds.add(structShare.structShareModelId);

    const fieldExpressions = erdDocument.toAllColumnsWithStruct(structShare)
        .map(memberColumn => buildStructFieldExpression(erdDocument, memberColumn, innerVisitedIds, options))
        .filter(fieldExpression => (fieldExpression != null));

    const structExpression = `STRUCT<${fieldExpressions.join(", ")}>`;
    return (structShare.isArray === true) ? `ARRAY<${structExpression}>` : structExpression;
};

const buildStructFieldExpression = (
    erdDocument: ErdDocument, columnModel: ColumnModel,
    visitedStructIds: ReadonlySet<string>, options: StructTypeExpressionOptions
): string | null => {
    if (columnModel.entityType === "struct") {
        const structModel = erdDocument.findStructColumnShareModel(columnModel.structShareModelId);
        if (structModel == null) {
            return null;
        }

        const overrideName = overrideColumnName(columnModel, structModel);
        const typeExpression = doBuildStructTypeExpression(erdDocument, structModel, visitedStructIds, options);

        return `${options.escape(overrideName.physicalName)} ${typeExpression}`;
    }

    return buildSimpleFieldExpression(erdDocument, columnModel, options);
};

const buildSimpleFieldExpression = (
    erdDocument: ErdDocument, columnModel: SimpleColumnModel, options: StructTypeExpressionOptions
): string | null => {
    const columnShare = erdDocument.findColumnShareModel(columnModel.columnShareModelId);
    if (columnShare == null) {
        return null;
    }

    const overrideName = overrideColumnName(columnModel, columnShare);
    return `${options.escape(overrideName.physicalName)} ${columnShare.specifiedColumnType()}`;
};
