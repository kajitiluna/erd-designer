import ColumnGroupModel from "~/models/database/ColumnGroupModel";
import ColumnModel from "~/models/database/ColumnModel";
import ColumnStructModel from "~/models/database/ColumnStructModel";

export const SELECTED_CELL_COLOR = "rgba(25, 118, 210, 0.22)";

export type ColumnWrapModel = {
    modelType: "single",
    columnModel: ColumnModel
} | {
    modelType: "group",
    columnGroupModel: ColumnGroupModel,
    columnModels: ColumnModel[]
} | {
    modelType: "struct",
    columnStructModel: ColumnStructModel
};

const PHYSICAL_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export const initHandleChangePhysicalName = (
    setPhysicalName: (updatingPhysicalName: string) => void
): ((event: React.ChangeEvent<HTMLInputElement>) => void) =>
    initHandleChangePattern(setPhysicalName, PHYSICAL_PATTERN);

export const initHandleChangePattern = (
    setPhysicalName: (updatingPhysicalName: string) => void,
    pattern: RegExp = PHYSICAL_PATTERN
): ((event: React.ChangeEvent<HTMLInputElement>) => void) => {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
        const changedValue = validatePattern(event.target.value, pattern);
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
): ((event: React.ChangeEvent<HTMLInputElement>) => void) => {

    return (event: React.ChangeEvent<HTMLInputElement>) => {
        const changedValue = validatePattern(event.target.value, PHYSICAL_PATTERN);
        if (changedValue == null) {
            return;
        }

        setPhysicalName(changedValue);

        if ((physicalName === logicalName) || (logicalName.length === 0)) {
            setLogicalName(changedValue);
        }
    };
};

const validatePattern = (org: string, pattern: RegExp) => {
    if (org.length === 0) {
        return org;
    }

    const trimmedValue = org.trim();
    if (pattern.test(trimmedValue) === false) {
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
            event.preventDefault();
            onEnterAction();
        }
    };
};

/**
 * Dialog コンポーネントにて、コンポーネント外のクリック制御を抑制するためのハンドラを生成する。
 * 
 * @param onClose ダイアログクローズ時のコールバック関数
 * @returns Event handler function for dialog close events that suppresses closing on backdrop clicks.
 */
export const initHandleCloseDialog = (onClose: () => void) => {
    return (_: object, reason: "backdropClick" | "escapeKeyDown") => {
        if (reason === "backdropClick") {
            return;
        }

        onClose();
    }
};