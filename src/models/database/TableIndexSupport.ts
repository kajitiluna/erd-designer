export type TableIndexOption = "UNIQUE" | "FULLTEXT" | "SPATIAL" | "";
export type TableIndexType = "BTREE" | "HASH" | "GIST" | "SPGIST" | "GIN" | "BRIN" | "";

export default class TableIndexSupport {
    constructor(
        public readonly indexOptions: readonly TableIndexOption[],
        public readonly indexTypes: readonly TableIndexType[],
        public readonly nullsOrder: boolean = false
    ) { }
}