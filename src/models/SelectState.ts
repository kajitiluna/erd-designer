
type SelectState = {
    status: "none" | "on_selecting" | "selected",
    tableIds: Set<string>,
    memoIds: Set<string>,
    relationId?: string,
    edgeType?: "real" | "virtual",
    edgeId?: number
};

const SelectState = {
    NONE: { status: "none", tableIds: new Set(), memoIds: new Set() } as SelectState,
} as const;

export default SelectState;