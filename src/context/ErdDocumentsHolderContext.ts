import React from "react";

import ColorValue from "~/models/ColorValue";
import ColumnShareModelStorage from "~/models/ColumnShareModelStorage";
import ColumnGroupModel from "~/models/database/ColumnGroupModel";
import ColumnModel from "~/models/database/ColumnModel";
import SimpleColumnModel from "~/models/database/SimpleColumnModel";
import ColumnShareModel from "~/models/database/ColumnShareModel";
import DbSchemaConfig from "~/models/DbSchemaConfig";
import ErdDocument from "~/models/ErdDocument";
import ErdSettingModel from "~/models/ErdSettingModel";
import LabelViewModel, { LabelPosition, FontStyle } from "~/models/LabelViewModel";
import LineViewModel from "~/models/LineViewModel";
import MemoViewModel from "~/models/MemoViewModel";
import RelationViewModel, { OrthogonalRelation } from "~/models/RelationViewModel";
import TableViewModel from "~/models/TableViewModel";

export class ErdDocumentsHolder {

    private static readonly MAX_HISTORY = 100;

    private readonly erdDocuments: ErdDocument[];

    private cursor: number;

    private readonly updateDocument: (documents: ErdDocument[], cursor: number, loggingMessage: string) => void;

    constructor(
        erdDocuments: ErdDocument[], cursor: number,
        updateDocument: (documents: ErdDocument[], cursor: number, loggingMessage: string) => void
    ) {
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

        this.updateDocument(this.erdDocuments, this.cursor + 1, `Undo to cursor : ${this.cursor + 1}`);
    }

    public canRedo(): boolean {
        return this.cursor > 0;
    }

    public redo() {
        if (this.canRedo() === false) {
            return;
        }

        this.updateDocument(this.erdDocuments, this.cursor - 1, `Redo to cursor : ${this.cursor - 1}`);
    }

    public update(updating: ErdDocument, loggingMessage: string) {
        const previous: ErdDocument = this.current();
        if (previous.equals(updating)) {
            return;
        }

        this.doUpdate(() => updating, loggingMessage);
    }

    private doUpdate(updateFunction: (erdDocument: ErdDocument) => ErdDocument, loggingMessage: string) {
        const previous: ErdDocument = this.current();
        const next = updateFunction(previous);
        if (previous === next) {
            return;
        }

        const lastIndex = Math.min(this.erdDocuments.length, ErdDocumentsHolder.MAX_HISTORY - 1 + this.cursor);
        const nextHistory = this.erdDocuments.slice(this.cursor, lastIndex);
        nextHistory.unshift(next);

        this.updateDocument(nextHistory, 0, loggingMessage);
    }

    /**
     * DBスキーマ設定を更新する。
     * 
     * @param next 更新後の状態
     * @param loggingMessage ログメッセージ
     */
    public updateSchema(next: DbSchemaConfig, loggingMessage: string) {
        this.doUpdate(previous => previous.updateSchema(next), loggingMessage);
    }

    /**
     * 選択状態にある要素を削除する。
     * 
     * @param selectState 選択状態
     */
    public delete(selectState: SelectState) {
        this.doUpdate(
            previous => previous.deleteSelectedElements(selectState),
            `Delete elements: ${JSON.stringify(selectState)}`
        );
    }

    /**
     * 指定されたテーブルおよびカラム共有モデルを反映する。
     * 
     * @param updatingTableViewModel テーブルモデル
     * @param updatingColumnModels 更新後のカラムモデル
     * @param columnShareModelStorage カラム共有モデル
     * @param loggingMessage ログメッセージ
     * @returns 操作後のモデル
     */
    public updateTableViewModel(
        updatingModel: TableViewModel,
        updatingColumnModels: ColumnModel[],
        columnShareModelStorage: ColumnShareModelStorage,
        loggingMessage: string
    ) {
        this.doUpdate(previous => previous.updateTableViewWithColumns(
            updatingModel, updatingColumnModels, columnShareModelStorage
        ), loggingMessage);
    }

    /**
     * 指定されたテーブルを削除する。
     * 
     * @param tableId 削除対象の tableId
     * @param loggingMessage ログメッセージ
     */
    public deleteTable(tableId: string, loggingMessage: string) {
        this.doUpdate(previous => previous.deleteTable(tableId), loggingMessage);
    }

    /**
     * 指定されたテーブルの配色を変更する。
     * 
     * @param tableIds 変更対象のテーブルID一覧
     * @param background 背景色
     * @param foreground 前景色
     * @param loggingMessage ログメッセージ
     */
    public updateTableViewColor(
        tableIds: string[], background: ColorValue, foreground: ColorValue, loggingMessage: string
    ) {
        this.doUpdate(
            previous => previous.updateTableViewColor(tableIds, background, foreground),
            loggingMessage
        );
    }

    /**
     * 指定された絡むグループの追加もしくは更新を行う。
     * 
     * @param updatingModel 更新対象
     * @param updatingColumnModels 更新カラム
     * @param columnShareModelStorage 更新後のカラム共有モデルストレージ 
     * @param loggingMessage ログメッセージ
     */
    public updateColumnGroup(
        updatingModel: ColumnGroupModel,
        updatingColumnModels: SimpleColumnModel[],
        columnShareModelStorage: ColumnShareModelStorage,
        loggingMessage: string
    ) {
        this.doUpdate(
            previous => previous.updateColumnGroup(updatingModel, updatingColumnModels, columnShareModelStorage),
            loggingMessage
        );
    }

    /**
     * 指定したカラムグループを削除する。
     * 
     * @param columnGroupId 削除対象のカラムグループID
     * @param loggingMessage ログメッセージ
     */
    public deleteColumnGroup(columnGroupId: string, loggingMessage: string) {
        this.doUpdate(previous => previous.deleteColumnGroup(columnGroupId), loggingMessage);
    }

    /**
     * 指定されたリレーションを更新する。
     * 
     * @param updatingModel 更新対象のリレーション
     * @param loggingMessage ログメッセージ
     */
    public updateRelation(updatingModel: RelationViewModel, loggingMessage: string) {
        this.doUpdate(previous => previous.updateRelation(updatingModel), loggingMessage);
    }

    /**
     * 指定されたリレーションを削除する。
     * 
     * @param relationId 削除対象のリレーションID
     * @param loggingMessage ログメッセージ
     */
    public deleteRelation(relationId: string, loggingMessage: string) {
        this.doUpdate(previous => previous.deleteRelation(relationId), loggingMessage);
    }

    /**
     * リレーションの線分情報を更新する。
     * 
     * @param relationId リレーションID
     * @param updating 更新内容
     */
    public updateRelationEdge(relationId: string, updating: UpdateRelationEdgeArgs) {
        this.doUpdateRelationEdge(
            `Updated relation edge: ${JSON.stringify({ relationId, ...updating })}`,
            { relationId, updateFunction: (previous => previous.updateEdge(updating)) }
        )
    }

    /**
     * リレーションの線分の直交線を更新する。
     * 
     * @param relationId リレーションID
     * @param orthogonalLines 直交線の情報
     */
    public updateRelationOrthogonal(args: OrthogonalRelation[]) {
        const updateRelation = (erdDocument: ErdDocument) => erdDocument.updateRelationOrthogonal(args);

        const loggingMessage = `Update relation orthogonal lines: ${JSON.stringify(args)}`;
        this.doUpdate(updateRelation, loggingMessage);
    }

    /**
     * リレーションの色を更新する。
     * 
     * @param relationId リレーションID
     * @param updating 更新内容
     * @param loggingMessage ログメッセージ
     */
    public updateRelationColor(relationId: string, updating: ColorValue, loggingMessage: string) {
        this.doUpdateRelationEdge(
            loggingMessage,
            { relationId, updateFunction: (previous => previous.updateColor(updating)) }
        );
    }

    /**
     * リレーションの Edge の太さを更新する。
     * 
     * @param relationId リレーションID
     * @param updating 更新内容
     * @param loggingMessage ログメッセージ
     */
    public updateRelationWidth(relationId: string, updating: number, loggingMessage: string) {
        this.doUpdateRelationEdge(
            loggingMessage,
            { relationId, updateFunction: (previous => previous.updateStrokeWidth(updating)) }
        );
    }

    /**
     * リレーションの Edge を削除する。
     * 
     * @param relationId リレーションID
     * @param edgeId 削除対象の Edge
     */
    public deleteRelationEdge(relationId: string, edgeId: number) {
        this.doUpdateRelationEdge(
            `Delete relation edge: ${JSON.stringify({ relationId, edgeId })}`,
            { relationId, updateFunction: (previous => previous.deleteEdge(edgeId)) }
        );
    }

    private doUpdateRelationEdge(loggingMessage: string, ...args: DoUpdateRelationEdgeArgs[]) {
        const updateRelation = (previous: ErdDocument): ErdDocument => {
            return args.reduce((erdDocument, { relationId, updateFunction }) =>
                erdDocument.updateRelationLineBy(relationId, updateFunction), previous);
        };

        this.doUpdate(updateRelation, loggingMessage);
    }

    /**
     * リレーションラベルの表示位置を更新する。
     * 
     * @param relationId リレーションID
     * @param updating 更新内容
     */
    public updateRelationLabelPosition(relationId: string, updating: LabelPosition) {
        const updatingFunction = (previous: LabelViewModel) => previous.updateLabelPosition(updating);
        const message = `Update relation label position: ${JSON.stringify({ relationId, position: updating })}`;

        this.doUpdateRelationLabel(relationId, updatingFunction, message);
    }

    /**
     * リレーションラベルのスタイルを更新する。
     * 
     * @param relationId リレーションID
     * @param updating 更新内容
     */
    public updateRelationLabelStyle(relationId: string, updating: FontStyle) {
        const updatingFunction = (previous: LabelViewModel) => previous.updateLabelStyle(updating);
        const message = `Update relation label style: ${JSON.stringify({ relationId, style: updating })}`;

        this.doUpdateRelationLabel(relationId, updatingFunction, message);
    }

    /**
     * リレーションラベルの色を更新する。
     * @param relationId リレーションID
     * @param updating 更新内容
     */
    public updateRelationLabelColor(relationId: string, updating: ColorValue) {
        const updatingFunction = (previous: LabelViewModel) => previous.updateColor(updating);
        const message = `Update relation label color: ${JSON.stringify({ relationId, color: updating })}`;

        this.doUpdateRelationLabel(relationId, updatingFunction, message);
    }

    private doUpdateRelationLabel(
        relationId: string, updateLabel: (previous: LabelViewModel) => LabelViewModel, message: string
    ) {
        this.doUpdate(previous => previous.updateRelationLabelBy(relationId, updateLabel), message);
    }

    /**
     * メモを追加する。
     * 
     * @param adding 追加するメモ
     */
    public addMemo(adding: MemoViewModel) {
        this.doUpdate(previous => previous.addMemo(adding), `Add memo: ${JSON.stringify(adding)}`);
    }

    /**
     * メモを更新する。
     * 
     * @param updating 更新内容
     * @param loggingMessage ログメッセージ
     */
    public updateMemo(updating: MemoViewModel, loggingMessage: string) {
        this.doUpdate(previous => previous.updateMemo(updating), loggingMessage);
    }

    /**
     * メモを削除する。
     * 
     * @param memoId 削除対象のメモID
     * @param loggingMessage ログメッセージ
     */
    public deleteMemo(memoId: string, loggingMessage: string) {
        this.doUpdate(previous => previous.deleteMemo(memoId), loggingMessage);
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
        nextOrthogonalObjects: OrthogonalRelation[]
    ) {
        this.doUpdate(
            previous => previous
                .moveTableView(tableIds, moving, nextOrthogonalObjects)
                .moveMemoView(memoIds, moving),
            `Move rectangles: ${JSON.stringify({ tableIds: [...tableIds], memoIds: [...memoIds], moving })}`
        );
    }

    /**
     * メモの配置場所を変更する。
     * 
     * @param memoId メモID
     * @param direction 変更方向
     */
    public arrangeMemo(memoId: string, direction: "front" | "back") {
        this.doUpdate(
            previous => previous.arrangeMemo(memoId, direction),
            `Arrange memo: ${JSON.stringify({ memoId, direction })}`
        );
    }

    /**
     * ドキュメント名を更新する。
     * 
     * @param updating 更新後のドキュメント名
     * @param loggingMessage ログメッセージ
     */
    public updateDocumentName(updating: string, loggingMessage: string) {
        this.doUpdate(previous => previous.updateDocumentName(updating), loggingMessage);
    }

    /**
     * ErdSetting を更新する。
     * 
     * @param updating 更新後の内容
     * @param loggingMessage ログメッセージ
     */
    public updateErdSetting(updating: ErdSettingModel, loggingMessage: string): void {
        this.doUpdate(previous => previous.updateErdSetting(updating), loggingMessage);
    }

    /**
     * インポートした DDL を反映する。
     * 
     * @param params インポート内容
     */
    public importDdl(params: ImportDdlArgs) {
        this.doUpdate(previous => previous.importDdl(params), `Import DDL: ${JSON.stringify(params)}`);
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
