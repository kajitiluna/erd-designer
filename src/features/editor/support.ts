import { ChangeEvent } from "react";

import ColumnGroupModel from "~/models/database/ColumnGroupModel";
import ColumnModel from "~/models/database/ColumnModel";

export type ColumnWrapModel = {
    modelType: "single",
    columnModel: ColumnModel
} | {
    modelType: "group",
    columnGroupModel: ColumnGroupModel,
    columnModels: ColumnModel[]
};

export const initHandleChangePhysicalName = (
    setPhysicalName: (updatingPhysicalName: string) => void
): ((event: ChangeEvent<HTMLInputElement>) => void) => {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
        const changedValue = validatePhysicalValue(event.target.value);
        if (changedValue == null) {
            return;
        }

        setPhysicalName(changedValue);
    };
};

type InitSyncPhysicalNameHandlerArgs = {
    physicalName: string,
    setPhysicalName: (updatingPhysicalName: string) => void,
    logicalName: string,
    setLogicalName: (updatingLogicalName: string) => void
};

/**
 * 論理名が物理名と合致もしくは論理名が空の場合は、論理名に物理名の値を設定する関数を生成する
 */
export const initHandleChangeWithSyncPhysicalName = (
    { physicalName, setPhysicalName, logicalName, setLogicalName }: InitSyncPhysicalNameHandlerArgs
): ((event: ChangeEvent<HTMLInputElement>) => void) => {

    return (event: ChangeEvent<HTMLInputElement>) => {
        const changedValue = validatePhysicalValue(event.target.value);
        if (changedValue == null) {
            return;
        }

        setPhysicalName(changedValue);

        if ((physicalName === logicalName) || (logicalName.length === 0)) {
            setLogicalName(changedValue);
        }
    };
};

const PHYSICAL_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const validatePhysicalValue = (org: string) => {
    if (org.length === 0) {
        return org;
    }

    const trimmedValue = org.trim();
    if (PHYSICAL_PATTERN.test(trimmedValue) === false) {
        return null;
    }

    return trimmedValue;
};

/**
 * Enter キーが押下された際の制御を作成する関数
 * 
 * @param onEnterAction 実際の制御内容
 * @returns イベントハンドラ
 */
export const initHandleEnterKeyDown = (onEnterAction: () => void) => {
    return (event: React.KeyboardEvent) => {
        event.stopPropagation();

        // IME変換中はイベント処理をスキップ
        if (event.nativeEvent.isComposing) {
            return;
        }

        if (event.key === "Enter") {
            onEnterAction();
        }
    };
};