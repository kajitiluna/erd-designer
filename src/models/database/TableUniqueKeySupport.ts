type TableUniqueKeySupportArgs = {
    orderable: boolean,
    supportsUniqueKey?: boolean
}

export default class TableUniqueKeySupport {

    public readonly orderable: boolean;
    public readonly supportsUniqueKey: boolean;

    constructor({ orderable, supportsUniqueKey = true }: TableUniqueKeySupportArgs) {
        this.orderable = orderable;
        this.supportsUniqueKey = supportsUniqueKey;
    }
}