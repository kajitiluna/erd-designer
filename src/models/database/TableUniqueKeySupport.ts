type TableUniqueKeySupportArgs = {
    orderable: boolean
}

export default class TableUniqueKeySupport {

    public readonly orderable: boolean;

    constructor({ orderable }: TableUniqueKeySupportArgs) {
        this.orderable = orderable;
    }
}