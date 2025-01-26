import React from "react";

export type SelectState = {
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
    | { type: "relation", relationId: string }
    | SelectEdgeAction;

type SelectTableAction = { type: "table", tableId: string, withMultiSelection?: boolean };
type SelectMemoAction = { type: "memo", memoId: string, withMultiSelection?: boolean };
type SelectBulkAction = { type: "bulk", tableIds: string[], memoIds: string[], withMultiSelection: boolean };
type SelectEdgeAction = { type: "edge", lineType: "real" | "virtual", relationId: string, edgeId: number };

const EMPTY_IDS = new Set<string>();
export const EMPTY_SELECT_STATE: SelectState = {
    tableIds: EMPTY_IDS,
    memoIds: EMPTY_IDS
} as const;

export const RELEASE_ACTION: SelectAction = { type: "none" };

export const reduceSelectAction = (currentStatus: SelectState, action: SelectAction): SelectState => {
    console.debug(`SELECTED : ${JSON.stringify(action)}`);

    if (action.type === "none") {
        return EMPTY_SELECT_STATE;
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
        return { tableIds: EMPTY_IDS, memoIds: EMPTY_IDS, relationId: action.relationId };
    }

    if (action.type === "edge") {
        return handleSelectEdge(currentStatus, action);
    }

    return currentStatus;
};

const handleSelectTable = (currentStatus: SelectState, action: SelectTableAction) => {
    if (!action.withMultiSelection) {
        return currentStatus.tableIds.has(action.tableId)
            ? EMPTY_SELECT_STATE
            : { tableIds: new Set([action.tableId]), memoIds: EMPTY_IDS };
    }

    const nextTableIds = new Set(currentStatus.tableIds);
    const removed = nextTableIds.delete(action.tableId);
    if (!removed) {
        nextTableIds.add(action.tableId);
    }

    return { tableIds: nextTableIds, memoIds: currentStatus.memoIds };
}

const handleSelectMemo = (currentStatus: SelectState, action: SelectMemoAction) => {
    if (!action.withMultiSelection) {
        return currentStatus.memoIds.has(action.memoId)
            ? EMPTY_SELECT_STATE
            : { tableIds: EMPTY_IDS, memoIds: new Set([action.memoId]) };
    }

    const nextMemoIds = new Set(currentStatus.memoIds);
    const removed = nextMemoIds.delete(action.memoId);
    if (!removed) {
        nextMemoIds.add(action.memoId);
    }

    return { tableIds: currentStatus.tableIds, memoIds: nextMemoIds };
};

const handleSelectBulk = (currentStatus: SelectState, action: SelectBulkAction) => {
    if (!action.withMultiSelection) {
        if (action.tableIds.length + action.memoIds.length === 0) {
            return EMPTY_SELECT_STATE;
        }

        const nextTableIds = (action.tableIds.length > 0) ? new Set(action.tableIds) : EMPTY_IDS;
        const nextMemoIds = (action.memoIds.length > 0) ? new Set(action.memoIds) : EMPTY_IDS;

        return { tableIds: nextTableIds, memoIds: nextMemoIds };
    }

    if (action.tableIds.length + action.memoIds.length === 0) {
        return currentStatus;
    }

    const nextTableIds = (action.tableIds.length === 0) ? currentStatus.tableIds
        : new Set([...currentStatus.tableIds].concat(action.tableIds));
    const nextMemoIds = (action.memoIds.length === 0) ? currentStatus.memoIds
        : new Set([...currentStatus.memoIds].concat(action.memoIds));

    return { tableIds: nextTableIds, memoIds: nextMemoIds };
};

const handleSelectEdge = (currentStatus: SelectState, action: SelectEdgeAction) => {
    if (currentStatus.relationId !== action.relationId) {
        return EMPTY_SELECT_STATE;
    }

    return {
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
