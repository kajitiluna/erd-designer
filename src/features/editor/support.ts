import ColumnModelStorage from "~/models/ColumnModelStorage";
import ColumnShareModelStorage from "~/models/ColumnShareModelStorage";
import ColumnGroupModel from "~/models/database/ColumnGroupModel";
import ColumnModel from "~/models/database/ColumnModel";
import SimpleColumnModel from "~/models/database/SimpleColumnModel";
import StructColumnModel from "~/models/database/StructColumnModel";
import StructColumnShareModel from "~/models/database/StructColumnShareModel";
import { overrideColumnName } from "~/models/database/support";
import TableModel from "~/models/database/TableModel";
import ErdDocument from "~/models/ErdDocument";

export const SELECTED_CELL_COLOR = "rgba(25, 118, 210, 0.22)";

export type ColumnWrapModel = {
    modelType: "single",
    columnModel: SimpleColumnModel
} | {
    modelType: "group",
    columnGroupModel: ColumnGroupModel,
    columnModels: ColumnModel[]
} | {
    modelType: "struct",
    columnModel: StructColumnModel
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

const emptyColumnStorage = ColumnModelStorage.create();

/**
 * カラムエントリを ColumnWrapModel 列に解決する。
 * extraColumnModelMap は、struct 編集セッション中に追加・更新されたがまだ ErdDocument へ
 * コミットされていないメンバー ColumnModel を解決するためのフォールバックとして用いる
 * (テーブル編集完了まで document を直接更新しないため、erdDocument 側にはまだ存在しない)。
 */
export const toColumnWrapModels = (
    erdDocument: ErdDocument, columnContainer: TableModel | StructColumnShareModel,
    columnStorage: ColumnModelStorage = emptyColumnStorage
): ColumnWrapModel[] => {
    return columnContainer.columnEntries.flatMap((column): ColumnWrapModel[] => {
        if (column.modelType === "single") {
            const columnModel = columnStorage.findColumn(column.columnModelId) ??
                erdDocument.findColumnModel(column.columnModelId);
            if (columnModel == null) {
                return [];
            }

            if (ColumnModel.isStructColumn(columnModel)) {
                return [{ modelType: "struct", columnModel: columnModel }];
            }

            return [{ modelType: "single", columnModel: columnModel }];
        }

        const columnGroup = erdDocument.findColumnGroupModel(column.columnGroupId) as ColumnGroupModel;
        const columnModels = columnGroup.columnModelIds
            .map(columnModelId => erdDocument.findColumnModel(columnModelId))
            .filter(columnModel => (columnModel != null));

        return [{
            modelType: "group",
            columnGroupModel: columnGroup,
            columnModels: columnModels
        }];
    });
};

export const validateNameColumnWraps = (
    columnWrapModels: ColumnWrapModel[], erdDocument: ErdDocument, columnShareStorage: ColumnShareModelStorage
) => {
    if (columnWrapModels.length === 0) {
        return true;
    }

    // 同一名のカラムが存在する場合は NG 扱いとする。
    const existedColumnNames = new Set<string>();

    const validateSimpleColumn = (column: SimpleColumnModel) => {
        const columnShare = columnShareStorage.findColumnShare(column.columnShareModelId);
        if (columnShare == null) {
            return false;
        }

        const overrideName = overrideColumnName(column, columnShare);
        if (existedColumnNames.has(overrideName.physicalName)) {
            return false;
        }

        existedColumnNames.add(overrideName.physicalName);
        return true;
    };

    const validateStructColumn = (column: StructColumnModel) => {
        const structShare = columnShareStorage.findStructShare(column.structShareModelId);
        if (structShare == null) {
            return false;
        }

        const overrideName = overrideColumnName(column, structShare);
        if (existedColumnNames.has(overrideName.physicalName)) {
            return false;
        }

        existedColumnNames.add(overrideName.physicalName);
        return true;
    };

    for (const columnWrap of columnWrapModels) {
        if (columnWrap.modelType === "single") {
            const isValid = validateSimpleColumn(columnWrap.columnModel);
            if (isValid === false) {
                return false;
            }

            continue;
        }

        if (columnWrap.modelType === "struct") {
            const isValid = validateStructColumn(columnWrap.columnModel);
            if (isValid === false) {
                return false;
            }

            continue;
        }

        for (const columnId of columnWrap.columnGroupModel.columnModelIds) {
            const column = erdDocument.findColumnModel(columnId);
            if (column == null) {
                return false;
            }

            if (ColumnModel.isSimpleColumn(column)) {
                const isValid = validateSimpleColumn(column);
                if (isValid === false) {
                    return false;
                }

                continue;
            }

            const isValid = validateStructColumn(column);
            if (isValid === false) {
                return false;
            }
        }
    }

    return true;
};

export const initializeValidateNonRecursive = (
    erdDocument: ErdDocument, columnShareStorage: ColumnShareModelStorage, columnStorage: ColumnModelStorage
) => {
    const nonRecursiveStructShareIds = new Set<string>();

    // ancestorStructShareIds は自身に至る祖先チェーンのみを表す。兄弟位置での同一 struct 共有は再帰ではないため、
    // 走査の復路で祖先から外れるよう階層ごとに新しい Set を作る。
    const validateStruct = (structShareId: string, ancestorStructShareIds: ReadonlySet<string>): boolean => {
        if (ancestorStructShareIds.has(structShareId)) {
            return false;
        }

        if (nonRecursiveStructShareIds.has(structShareId)) {
            return true;
        }

        const structShare = columnShareStorage.findStructShare(structShareId);
        if (structShare == null) {
            return false;
        }

        const subStructShareIds = collectSubStructShareIds(structShare, erdDocument, columnStorage);
        if (subStructShareIds.length === 0) {
            nonRecursiveStructShareIds.add(structShareId);
            return true;
        }

        const nextAncestorIds = new Set([...ancestorStructShareIds, structShareId]);
        const isValid = subStructShareIds.every(subStructShareId => validateStruct(subStructShareId, nextAncestorIds));
        if (isValid === false) {
            return false;
        }

        nonRecursiveStructShareIds.add(structShareId);
        return true;
    };

    const validateNonRecursive = (columnWraps: ColumnWrapModel[], ownerStructShareIds: readonly string[] = []) => {
        const structColumns = columnWraps.filter(columnWrap => (columnWrap.modelType === "struct"));
        if (structColumns.length === 0) {
            return true;
        }

        const ancestorStructShareIds = new Set(ownerStructShareIds);
        return structColumns.every(structColumn => {
            return validateStruct(structColumn.columnModel.structShareModelId, ancestorStructShareIds);
        });
    };

    return validateNonRecursive;
};

const collectSubStructShareIds = (
    structShare: StructColumnShareModel, erdDocument: ErdDocument, columnStorage: ColumnModelStorage
): string[] => {
    const columnIds = structShare.columnEntries.flatMap(entry => {
        if (entry.modelType === "single") {
            return [entry.columnModelId];
        }

        const columnGroup = erdDocument.findColumnGroupModel(entry.columnGroupId);
        if (columnGroup == null) {
            return [];
        }

        return columnGroup.columnModelIds;
    });

    return columnIds.flatMap(columnId => {
        const columnModel = columnStorage.findColumn(columnId) ?? erdDocument.findColumnModel(columnId);
        if ((columnModel == null) || (ColumnModel.isStructColumn(columnModel) === false)) {
            return [];
        }

        return [columnModel.structShareModelId];
    });
};