
export type SelectState = {
    status: "none" | "on_selecting" | "selected",
    tableIds: Set<string>,
    memoIds: Set<string>,
    relationId?: string,
    edgeType?: "real" | "virtual",
    edgeId?: number
};