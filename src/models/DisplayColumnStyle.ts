import SimpleColumnModel from "~/models/database/SimpleColumnModel";

type DisplayColumn = "all" | "pk" | "pk_fk" | "none";

export default class DisplayColumnStyle {

    public static readonly ALL = new DisplayColumnStyle("all", "All Columns", () => true);

    public static readonly ONLY_PK = new DisplayColumnStyle(
        "pk", "Only PK Columns",
        (column: SimpleColumnModel) => column.primaryKey
    );

    public static readonly PK_OR_FK = new DisplayColumnStyle(
        "pk_fk",
        "PK or FK Columns",
        (column: SimpleColumnModel, inChildRelation: boolean) => (column.primaryKey || inChildRelation)
    );

    public static readonly NONE = new DisplayColumnStyle("none", "No Columns", () => false);

    public readonly key: DisplayColumn;

    public readonly name: string;

    private readonly viewableFunction: (column: SimpleColumnModel, inChildRelation: boolean) => boolean;

    private constructor(
        key: DisplayColumn, name: string,
        viewableFunction: (column: SimpleColumnModel, inChildRelation: boolean) => boolean
    ) {
        this.key = key;
        this.name = name;
        this.viewableFunction = viewableFunction;
    }

    public static values(): readonly DisplayColumnStyle[] {
        return [
            DisplayColumnStyle.ALL, DisplayColumnStyle.ONLY_PK, DisplayColumnStyle.PK_OR_FK, DisplayColumnStyle.NONE
        ] as const;
    }

    public viewable(column: SimpleColumnModel, inChildRelation: boolean): boolean {
        return this.viewableFunction(column, inChildRelation);
    }

    public toJSON(): Record<string, string> {
        return { style: this.key };
    }

    public static toObject(obj: object): DisplayColumnStyle {
        if (("style" in obj) === false) {
            return DisplayColumnStyle.ALL;
        }

        const styleKey = obj.style as string;
        switch (styleKey) {
            case "pk":
                return DisplayColumnStyle.ONLY_PK;
            case "pk_fk":
                return DisplayColumnStyle.PK_OR_FK;
            case "none":
                return DisplayColumnStyle.NONE;
            default:
                return DisplayColumnStyle.ALL;
        }
    }

    public equals(other: DisplayColumnStyle): boolean {
        return this.key === other.key;
    }
}