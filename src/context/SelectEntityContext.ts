import React from "react";

export type SelectState = {
    tableIds: Set<string>,
    relationId?: string,
    edgeType?: "real" | "virtual",
    edgeId?: number
};

export type SelectAction = { type: "none" }
    | { type: "table", tableId: string, withMultiSelection?: boolean }
    | { type: "bulk_table", tableIds: string[], withMultiSelection: boolean }
    | { type: "relation", relationId: string }
    | { type: "edge", lineType: "real" | "virtual", relationId: string, edgeId: number };

const EMPTY_TABLE_IDS = new Set<string>();
export const EMPTY_SELECT_STATE: SelectState = {
    tableIds: EMPTY_TABLE_IDS
} as const;

export const RELEASE_ACTION: SelectAction = { type: "none" };

export const reduceSelectAction = (currentStatus: SelectState, action: SelectAction) => {
    if (action.type === "none") {
        return EMPTY_SELECT_STATE;
    }

    if (action.type === "table") {
        if (!action.withMultiSelection) {
            return currentStatus.tableIds.has(action.tableId)
                ? EMPTY_SELECT_STATE
                : { tableIds: new Set([action.tableId]) };
        }

        const nextTableIds = new Set(currentStatus.tableIds);
        const removed = nextTableIds.delete(action.tableId);
        if (!removed) {
            nextTableIds.add(action.tableId);
        }

        return { tableIds: nextTableIds };
    }

    if (action.type === "bulk_table") {
        if (!action.withMultiSelection) {
            return (action.tableIds.length > 0) ? { tableIds: new Set(action.tableIds) } : EMPTY_SELECT_STATE;
        }

        if (action.tableIds.length === 0) {
            return currentStatus;
        }

        const nextTableIds = new Set(currentStatus.tableIds);
        action.tableIds.forEach(tableId => nextTableIds.add(tableId));

        return { tableIds: nextTableIds };
    }

    if (action.type === "relation") {
        return {
            tableIds: EMPTY_TABLE_IDS,
            relationId: action.relationId
        };
    }

    if (action.type === "edge") {
        if (currentStatus.relationId !== action.relationId) {
            return EMPTY_SELECT_STATE;
        }

        return {
            tableIds: EMPTY_TABLE_IDS,
            relationId: action.relationId,
            edgeType: action.lineType,
            edgeId: action.edgeId
        };
    }

    return currentStatus;
};

type SelectEntityReducer = {
    selectState: SelectState,
    dispatchSelectAction: (action: SelectAction) => void
};

export const SelectEntityContext = React.createContext<SelectEntityReducer>({} as SelectEntityReducer);
