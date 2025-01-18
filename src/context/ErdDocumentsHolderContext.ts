import React from "react";
import ColorValue from "~/models/ColorValue";
import ColumnShareModelStrage from "~/models/ColumnShareModelStrage";
import ColumnModel from "~/models/database/ColumnModel";
import RelationModel from "~/models/database/RelationModel";
import ErdDocument from "~/models/ErdDocument";
import ErdSettingModel from "~/models/ErdSettingModel";
import TableViewModel from "~/models/TableViewModel";

export class ErdDocumentsHolder {

    private static readonly MAX_HISTORY = 100;

    private readonly erdDocuments: ErdDocument[];

    private cursor: number;

    private readonly updateDoocument: (documents: ErdDocument[], cursor: number) => void;

    constructor(erdDocuments: ErdDocument[], cursor: number, updateDoocument: (documents: ErdDocument[], cursor: number) => void) {
        this.erdDocuments = erdDocuments;
        this.cursor = cursor;
        this.updateDoocument = updateDoocument;
    }

    public current(): ErdDocument {
        return this.erdDocuments[this.cursor];
    }

    public undoable(): boolean {
        return this.cursor < this.erdDocuments.length - 1;
    }

    public undo() {
        if (this.undoable() === false) {
            return;
        }

        this.updateDoocument(this.erdDocuments, this.cursor + 1);
    }

    public redoable(): boolean {
        return this.cursor > 0;
    }

    public redo() {
        if (this.redoable() === false) {
            return;
        }

        this.updateDoocument(this.erdDocuments, this.cursor - 1);
    }

    private doUpdate(next: ErdDocument) {
        const lastIndex = Math.min(this.erdDocuments.length, ErdDocumentsHolder.MAX_HISTORY - 1 + this.cursor);
        const nextHistory = this.erdDocuments.slice(this.cursor, lastIndex);
        nextHistory.unshift(next);

        this.updateDoocument(nextHistory, 0);
    }

    /**
     * 指定されたテーブルおよびカラム共有モデルを反映する。
     * 
     * @param updatingTableViewModel テーブルモデル
     * @param updatingColumnModels 更新後のカラムモデル
     * @param columnShareModelStrage カラム共有モデル
     * @returns 操作後のモデル
     */
    public updateTableViewModel(
        updatingModel: TableViewModel,
        updatingColumnModels: ColumnModel[],
        columnShareModelRepository: ColumnShareModelStrage
    ) {
        const previousModel = this.current();
        const nextModel = previousModel.updateTableViewModel(
            updatingModel, updatingColumnModels, columnShareModelRepository
        );

        this.doUpdate(nextModel);
    }

    /**
     * 指定されたテーブルを削除する。
     * 
     * @param tableId 削除対象の tableId
     */
    public deleteTable(tableId: string) {
        const previous: ErdDocument = this.current();
        const next: ErdDocument = previous.deleteTable(tableId);
        if (previous === next) {
            return;
        }

        this.doUpdate(next);
    }

    /**
     * 指定されたテーブルの位置を移動させたモデルを作成する。
     * 
     * @param tableIds 移動対象のテーブルのID一覧
     * @param moving 移動距離
     * @returns 操作後のモデル
     */
    public moveTableView(tableIds: string[], moving: { x: number, y: number }) {
        const previous: ErdDocument = this.current();
        const next: ErdDocument = previous.moveTableView(tableIds, moving);
        if (previous === next) {
            return;
        }

        this.doUpdate(next);
    }

    /**
     * 指定されたテーブルの配色を変更する。
     * 
     * @param tableIds 変更対象のテーブルID一覧
     * @param background 背景色
     * @param foreground 前景色
     */
    public updateTableViewColor(tableIds: string[], background: ColorValue, foreground: ColorValue) {
        const previous: ErdDocument = this.current();
        const next = previous.updateTableViewColor(tableIds, background, foreground);
        if (previous === next) {
            return;
        }

        this.doUpdate(next);
    }

    /**
     * 指定されたリレーションを更新する。
     * 
     * @param updatingModel 更新対象のリレーション
     */
    public updateRelationModel(updatingModel: RelationModel) {
        const previous: ErdDocument = this.current();
        const next = previous.updateRelationModel(updatingModel);
        if (previous === next) {
            return;
        }

        this.doUpdate(next);
    }

    /**
     * 指定されたリレーションを削除する。
     * 
     * @param relationId 削除対象のリレーションID
     */
    public deleteRelation(relationId: string) {
        const previous: ErdDocument = this.current();
        const next = previous.deleteRelation(relationId);
        if (previous === next) {
            return;
        }

        this.doUpdate(next);
    }

    /**
     * ErdSetting を更新する。
     * 
     * @param updating 更新後の内容
     */
    public updateErdSetting(updating: ErdSettingModel): void {
        const previous: ErdDocument = this.current();
        const next = previous.updateErdSetting(updating);
        if (previous === next) {
            return;
        }

        this.doUpdate(next);
    }
}

export const ErdDocumentsHolderContext = React.createContext<ErdDocumentsHolder>({} as ErdDocumentsHolder);
