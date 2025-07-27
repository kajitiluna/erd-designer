export type TableIndexOption = "UNIQUE" | "FULLTEXT" | "SPATIAL" | "";
export type TableIndexType = "BTREE" | "HASH" | "GIST" | "SPGIST" | "GIN" | "BRIN" | "";

type TableIndexSupportArgs = {
    indexOptions: readonly TableIndexOption[],
    indexTypes: readonly TableIndexType[],
    supportsClustered?: boolean,
    nullsOrder?: boolean
};

export default class TableIndexSupport {

    public readonly indexOptions: readonly TableIndexOption[];
    public readonly indexTypes: readonly TableIndexType[];
    public readonly supportsClustered: boolean;
    public readonly nullsOrder: boolean;

    constructor({
        indexOptions, indexTypes, supportsClustered = false, nullsOrder = false
    }: TableIndexSupportArgs) {
        this.indexOptions = indexOptions;
        this.indexTypes = indexTypes;
        this.supportsClustered = supportsClustered;
        this.nullsOrder = nullsOrder;
    }
}