import React from "react";

export type SelectState = {
    status: "none" | "on_selecting" | "selected",
    tableIds: Set<string>,
    memoIds: Set<string>,
    relationId?: string,
    edgeType?: "real" | "virtual",
    edgeId?: number
};

export type SelectAction = { type: "none" }
    | SelectTableAction
    | SelectMemoAction
    | SelectBulkAction
    | SelectRelationAction
    | SelectEdgeAction
    | { type: "completed" };

type SelectTableAction = { type: "table", tableId: string, withMultiSelection?: boolean };
type SelectMemoAction = { type: "memo", memoId: string, withMultiSelection?: boolean };
type SelectBulkAction = { type: "bulk", tableIds: string[], memoIds: string[], withMultiSelection: boolean };
type SelectRelationAction = { type: "relation", relationId: string };
type SelectEdgeAction = { type: "edge", lineType: "real" | "virtual", relationId: string, edgeId: number };

const EMPTY_IDS = new Set<string>();
export const EMPTY_SELECT_STATE: SelectState = {
    status: "none",
    tableIds: EMPTY_IDS,
    memoIds: EMPTY_IDS
} as const;

export const RELEASE_ACTION: SelectAction = { type: "none" };

export const reduceSelectAction = (currentStatus: SelectState, action: SelectAction): SelectState => {
    console.debug(`SELECTED : ${JSON.stringify(action)}, CURRENT_STATUS : ${JSON.stringify({
        ...currentStatus,
        tableIds: [...currentStatus.tableIds],
        memoIds: [...currentStatus.memoIds]
    })}`);

    if (action.type === "none") {
        return EMPTY_SELECT_STATE;
    }

    if (action.type === "completed") {
        return { ...currentStatus, status: "selected" };
    }

    if (action.type === "table") {
        return handleSelectTable(currentStatus, action);
    }

    if (action.type === "memo") {
        return handleSelectMemo(currentStatus, action);
    }

    if (action.type === "bulk") {
        return handleSelectBulk(currentStatus, action);
    }

    if (action.type === "relation") {
        return {
            status: "on_selecting",
            tableIds: EMPTY_IDS,
            memoIds: EMPTY_IDS,
            relationId: action.relationId
        };
    }

    if (action.type === "edge") {
        return handleSelectEdge(currentStatus, action);
    }

    return currentStatus;
};

const handleSelectTable = (currentStatus: SelectState, action: SelectTableAction): SelectState => {
    if (!action.withMultiSelection) {
        return currentStatus.tableIds.has(action.tableId)
            ? EMPTY_SELECT_STATE
            : { status: "on_selecting", tableIds: new Set([action.tableId]), memoIds: EMPTY_IDS };
    }

    const nextTableIds = new Set(currentStatus.tableIds);
    const removed = nextTableIds.delete(action.tableId);
    if (!removed) {
        nextTableIds.add(action.tableId);
    }

    return { status: "on_selecting", tableIds: nextTableIds, memoIds: currentStatus.memoIds };
}

const handleSelectMemo = (currentStatus: SelectState, action: SelectMemoAction): SelectState => {
    if (!action.withMultiSelection) {
        return currentStatus.memoIds.has(action.memoId)
            ? EMPTY_SELECT_STATE
            : { status: "on_selecting", tableIds: EMPTY_IDS, memoIds: new Set([action.memoId]) };
    }

    const nextMemoIds = new Set(currentStatus.memoIds);
    const removed = nextMemoIds.delete(action.memoId);
    if (!removed) {
        nextMemoIds.add(action.memoId);
    }

    return { status: "on_selecting", tableIds: currentStatus.tableIds, memoIds: nextMemoIds };
};

const handleSelectBulk = (currentStatus: SelectState, action: SelectBulkAction): SelectState => {
    if (!action.withMultiSelection) {
        if (action.tableIds.length + action.memoIds.length === 0) {
            return EMPTY_SELECT_STATE;
        }

        const nextTableIds = (action.tableIds.length > 0) ? new Set(action.tableIds) : EMPTY_IDS;
        const nextMemoIds = (action.memoIds.length > 0) ? new Set(action.memoIds) : EMPTY_IDS;

        return { status: "selected", tableIds: nextTableIds, memoIds: nextMemoIds };
    }

    if (action.tableIds.length + action.memoIds.length === 0) {
        return currentStatus;
    }

    const nextTableIds = (action.tableIds.length === 0) ? currentStatus.tableIds
        : new Set([...currentStatus.tableIds].concat(action.tableIds));
    const nextMemoIds = (action.memoIds.length === 0) ? currentStatus.memoIds
        : new Set([...currentStatus.memoIds].concat(action.memoIds));

    return { status: "selected", tableIds: nextTableIds, memoIds: nextMemoIds };
};

const handleSelectEdge = (currentStatus: SelectState, action: SelectEdgeAction): SelectState => {
    if (currentStatus.relationId !== action.relationId) {
        return EMPTY_SELECT_STATE;
    }

    return {
        status: "on_selecting",
        tableIds: EMPTY_IDS,
        memoIds: EMPTY_IDS,
        relationId: action.relationId,
        edgeType: action.lineType,
        edgeId: action.edgeId
    };
};

type SelectEntityReducer = {
    selectState: SelectState,
    dispatchSelectAction: (action: SelectAction) => void
};

export const SelectEntityContext = React.createContext<SelectEntityReducer>({} as SelectEntityReducer);
