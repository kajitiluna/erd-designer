import React from "react";

import ColorValue from "~/models/ColorValue";
import ColumnShareModelStorage from "~/models/ColumnShareModelStorage";
import ColumnGroupModel from "~/models/database/ColumnGroupModel";
import ColumnModel from "~/models/database/ColumnModel";
import ColumnShareModel from "~/models/database/ColumnShareModel";
import RelationModel from "~/models/database/RelationModel";
import DbSchemaConfig from "~/models/DbSchemaConfig";
import ErdDocument from "~/models/ErdDocument";
import ErdSettingModel from "~/models/ErdSettingModel";
import LineViewModel, { OrthogonalDirection } from "~/models/LineViewModel";
import MemoViewModel from "~/models/MemoViewModel";
import RelationViewModel from "~/models/RelationViewModel";
import TableViewModel from "~/models/TableViewModel";

export class ErdDocumentsHolder {

    private static readonly MAX_HISTORY = 100;

    private readonly erdDocuments: ErdDocument[];

    private cursor: number;

    private readonly updateDocument: (documents: ErdDocument[], cursor: number) => void;

    constructor(erdDocuments: ErdDocument[], cursor: number, updateDocument: (documents: ErdDocument[], cursor: number) => void) {
        this.erdDocuments = erdDocuments;
        this.cursor = cursor;
        this.updateDocument = updateDocument;
    }

    public current(): ErdDocument {
        return this.erdDocuments[this.cursor];
    }

    public canUndo(): boolean {
        return this.cursor < this.erdDocuments.length - 1;
    }

    public undo() {
        if (this.canUndo() === false) {
            return;
        }

        this.updateDocument(this.erdDocuments, this.cursor + 1);
    }

    public canRedo(): boolean {
        return this.cursor > 0;
    }

    public redo() {
        if (this.canRedo() === false) {
            return;
        }

        this.updateDocument(this.erdDocuments, this.cursor - 1);
    }

    public update(updating: ErdDocument) {
        const previous: ErdDocument = this.current();
        if (previous.equals(updating)) {
            return;
        }

        this.doUpdate(() => updating);
    }

    private doUpdate(updateFunction: (erdDocument: ErdDocument) => ErdDocument) {
        const previous: ErdDocument = this.current();
        const next = updateFunction(previous);
        if (previous === next) {
            return;
        }

        const lastIndex = Math.min(this.erdDocuments.length, ErdDocumentsHolder.MAX_HISTORY - 1 + this.cursor);
        const nextHistory = this.erdDocuments.slice(this.cursor, lastIndex);
        nextHistory.unshift(next);

        this.updateDocument(nextHistory, 0);
    }

    /**
     * DBスキーマ設定を更新する。
     * 
     * @param next 更新後の状態
     */
    public updateSchema(next: DbSchemaConfig) {
        this.doUpdate(previous => previous.updateSchema(next));
    }

    /**
     * 選択状態にある要素を削除する。
     * 
     * @param selectState 選択状態
     */
    public delete(selectState: SelectState) {
        const doDelete = (previous: ErdDocument): ErdDocument => {
            let next: ErdDocument = previous;
            if (selectState.relationId) {
                next = previous.deleteRelation(selectState.relationId);
            }

            for (const tableId of selectState.tableIds) {
                next = next.deleteTable(tableId);
            }

            for (const memoId of selectState.memoIds) {
                next = next.deleteMemo(memoId);
            }

            return next;
        };

        this.doUpdate(doDelete);
    }

    /**
     * 指定されたテーブルおよびカラム共有モデルを反映する。
     * 
     * @param updatingTableViewModel テーブルモデル
     * @param updatingColumnModels 更新後のカラムモデル
     * @param columnShareModelStorage カラム共有モデル
     * @returns 操作後のモデル
     */
    public updateTableViewModel(
        updatingModel: TableViewModel,
        updatingColumnModels: ColumnModel[],
        columnShareModelStorage: ColumnShareModelStorage
    ) {
        this.doUpdate(previous => previous.updateTableViewWithColumns(
            updatingModel, updatingColumnModels, columnShareModelStorage
        ));
    }

    /**
     * 指定されたテーブルを削除する。
     * 
     * @param tableId 削除対象の tableId
     */
    public deleteTable(tableId: string) {
        this.doUpdate(previous => previous.deleteTable(tableId));
    }

    /**
     * 指定されたテーブルの配色を変更する。
     * 
     * @param tableIds 変更対象のテーブルID一覧
     * @param background 背景色
     * @param foreground 前景色
     */
    public updateTableViewColor(tableIds: string[], background: ColorValue, foreground: ColorValue) {
        this.doUpdate(previous =>
            previous.updateTableViewColor(tableIds, background, foreground)
        );
    }

    /**
     * 指定された絡むグループの追加もしくは更新を行う。
     * 
     * @param updatingModel 更新対象
     * @param updatingColumnModels 更新カラム
     * @param columnShareModelStorage 更新後のカラム共有モデルストレージ 
     */
    public updateColumnGroup(
        updatingModel: ColumnGroupModel,
        updatingColumnModels: ColumnModel[],
        columnShareModelStorage: ColumnShareModelStorage
    ) {
        this.doUpdate(previous =>
            previous.updateColumnGroup(
                updatingModel, updatingColumnModels, columnShareModelStorage)
        );
    }

    /**
     * 指定したカラムグループを削除する。
     * 
     * @param columnGroupId 削除対象のカラムグループID
     */
    public deleteColumnGroup(columnGroupId: string) {
        this.doUpdate(previous => previous.deleteColumnGroup(columnGroupId));
    }

    /**
     * 指定されたリレーションを更新する。
     * 
     * @param updatingModel 更新対象のリレーション
     */
    public updateRelation(updatingModel: RelationViewModel) {
        this.doUpdate(previous => previous.updateRelation(updatingModel));
    }

    /**
     * 指定されたリレーションを削除する。
     * 
     * @param relationId 削除対象のリレーションID
     */
    public deleteRelation(relationId: string) {
        this.doUpdate(previous => previous.deleteRelation(relationId));
    }

    /**
     * リレーションの線分情報を更新する。
     * 
     * @param relationId リレーションID
     * @param updating 更新内容
     */
    public updateRelationEdge(relationId: string, updating: UpdateRelationEdgeArgs) {
        this.doUpdateRelationEdge({ relationId, updateFunction: (previous => previous.updateEdge(updating)) })
    }

    /**
     * リレーションの線分の直交線を更新する。
     * 
     * @param relationId リレーションID
     * @param orthogonalLines 直交線の情報
     */
    public updateRelationOrthogonal(args: { relationId: string, orthogonalLines: OrthogonalDirection[] }[]) {
        const updateArgs = args.map(({ relationId, orthogonalLines }) => (
            {
                relationId,
                updateFunction: ((previous: LineViewModel) => previous.updateOrthogonalLines(orthogonalLines))
            }
        ));

        this.doUpdateRelationEdge(...updateArgs);
    }

    /**
     * リレーションの色を更新する。
     * 
     * @param relationId リレーションID
     * @param updating 更新内容
     */
    public updateRelationColor(relationId: string, updating: ColorValue) {
        this.doUpdateRelationEdge({ relationId, updateFunction: (previous => previous.updateColor(updating)) })
    }

    /**
     * リレーションの Edge の太さを更新する。
     * 
     * @param relationId リレーションID
     * @param updating 更新内容
     */
    public updateRelationWidth(relationId: string, updating: number) {
        this.doUpdateRelationEdge({ relationId, updateFunction: (previous => previous.updateStrokeWidth(updating)) });
    }

    /**
     * リレーションの Edge を削除する。
     * 
     * @param relationId リレーションID
     * @param edgeId 削除対象の Edge
     */
    public deleteRelationEdge(relationId: string, edgeId: number) {
        this.doUpdateRelationEdge({ relationId, updateFunction: (previous => previous.deleteEdge(edgeId)) });
    }

    private doUpdateRelationEdge(...args: DoUpdateRelationEdgeArgs[]) {
        const updateRelation = (previous: ErdDocument): ErdDocument => {
            return args.reduce((erdDocument, { relationId, updateFunction }) => {
                const previousRelation = erdDocument.findRelationViewModel(relationId);
                if (previousRelation == null) {
                    return erdDocument;
                }

                const previousLineView = previousRelation.lineViewModel;
                const nextLineView = updateFunction(previousLineView);
                if (previousLineView.equals(nextLineView)) {
                    return erdDocument;
                }

                return erdDocument.updateRelationLineModel(relationId, nextLineView);
            }, previous);
        };

        this.doUpdate(updateRelation);
    }

    /**
     * メモを追加する。
     * 
     * @param adding 追加するメモ
     */
    public addMemo(adding: MemoViewModel) {
        this.doUpdate(previous => previous.addMemo(adding));
    }

    /**
     * メモを更新する。
     * 
     * @param updating 更新内容
     */
    public updateMemo(updating: MemoViewModel) {
        this.doUpdate(previous => previous.updateMemo(updating));
    }

    /**
     * メモを削除する。
     * 
     * @param memoId 削除対象のメモID
     */
    public deleteMemo(memoId: string) {
        this.doUpdate(previous => previous.deleteMemo(memoId));
    }

    /**
     * 指定されたテーブルの位置を移動させたモデルを作成する。
     * 
     * @param tableIds 移動対象のテーブルのID一覧
     * @param moving 移動距離
     * @returns 操作後のモデル
     */
    public moveRectangle(
        tableIds: Set<string>, memoIds: Set<string>,
        moving: { x: number, y: number },
        nextOrthogonalObjects: { relationId: string, orthogonalLines: OrthogonalDirection[] }[]
    ) {
        this.doUpdate(previous => previous
            .moveTableView(tableIds, moving, nextOrthogonalObjects)
            .moveMemoView(memoIds, moving)
        );
    }

    /**
     * メモの配置場所を変更する。
     * 
     * @param memoId メモID
     * @param direction 変更方向
     */
    public arrangeMemo(memoId: string, direction: "front" | "back") {
        this.doUpdate(previous => previous.arrangeMemo(memoId, direction));
    }

    /**
     * ドキュメント名を更新する。
     * 
     * @param updating 更新後のドキュメント名
     */
    public updateDocumentName(updating: string) {
        this.doUpdate(previous => previous.updateDocumentName(updating));
    }

    /**
     * ErdSetting を更新する。
     * 
     * @param updating 更新後の内容
     */
    public updateErdSetting(updating: ErdSettingModel): void {
        this.doUpdate(previous => previous.updateErdSetting(updating));
    }

    /**
     * インポートした DDL を反映する。
     * 
     * @param params インポート内容
     */
    public importDdl(params: ImportDdlArgs) {
        this.doUpdate(previous => previous.importDdl(params));
    }
}

type SelectState = {
    tableIds: Set<string>,
    memoIds: Set<string>,
    relationId: string | null,
};

type UpdateRelationEdgeArgs = {
    edgeType: "real" | "virtual",
    edgeId: number,
    point: { x: number, y: number }
};

type ImportDdlArgs = {
    tableViewModels: TableViewModel[],
    columnModels: ColumnModel[],
    columnShareModels: ColumnShareModel[],
    relationViewModels: RelationViewModel[]
};

type DoUpdateRelationEdgeArgs = {
    relationId: string,
    updateFunction: (previous: LineViewModel) => LineViewModel
};

export const ErdDocumentsHolderContext = React.createContext<ErdDocumentsHolder>({} as ErdDocumentsHolder);
