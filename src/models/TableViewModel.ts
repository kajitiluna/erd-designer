import ColorValue from "~/models/ColorValue";
import TableModel from "~/models/database/TableModel";
import { requireProperty, toDateTime } from "~/models/util";

type TableViewModelOptions = {
    tableModel: TableModel,
    corner: { top: number, left: number },
    headerColor: { background: ColorValue, foreground: ColorValue }
    createdAt?: Date | null
}

export default class TableViewModel {

    public readonly tableModel: TableModel;
    public readonly corner: { top: number, left: number };
    public readonly headerColor: { background: ColorValue, foreground: ColorValue };
    public readonly createdAt: Date;

    constructor({ tableModel, corner, headerColor, createdAt = null }: TableViewModelOptions) {
        this.tableModel = tableModel;
        this.corner = { ...corner };
        this.headerColor = { ...headerColor };
        this.createdAt = createdAt ? createdAt : new Date();
    }

    public get tableId(): string {
        return this.tableModel.tableModelId;
    }

    /**
     * Creates a copy of the table placed at `offset` from the original, with the same header color.
     * `createdAt` is not inherited: the copy is a newly created table.
     *
     * @param args names and id remap tables of the copied table, see `TableModel.duplicate`
     * @param args.offset displacement of the copy from the original
     */
    public duplicate(
        args: Parameters<TableModel["duplicate"]>[0] & { offset: { top: number, left: number } }
    ): TableViewModel {
        const { offset, ...tableArgs } = args;
        const duplicatedTable = this.tableModel.duplicate(tableArgs);
        const corner = { top: this.corner.top + offset.top, left: this.corner.left + offset.left };

        return new TableViewModel({ tableModel: duplicatedTable, corner, headerColor: this.headerColor });
    }

    public toJSON(): Record<string, unknown> {
        return {
            tableModel: this.tableModel.toJSON(),
            top: this.corner.top,
            left: this.corner.left,
            headerBackgroundColor: this.headerColor.background.toJSON(),
            headerForegroundColor: this.headerColor.foreground.toJSON(),
            createdAt: this.createdAt
        };
    }

    public static toObject(obj: object): TableViewModel {
        requireProperty(obj, "tableModel");
        requireProperty(obj, "top");
        requireProperty(obj, "left");
        requireProperty(obj, "headerBackgroundColor");
        requireProperty(obj, "headerForegroundColor");

        return new TableViewModel({
            tableModel: TableModel.toObject(obj.tableModel as object),
            corner: { top: obj.top as number, left: obj.left as number },
            headerColor: {
                background: ColorValue.toObject(obj.headerBackgroundColor as object),
                foreground: ColorValue.toObject(obj.headerForegroundColor as object)
            },
            createdAt: ("createdAt" in obj) ? toDateTime(obj.createdAt) : new Date()
        });
    }

    public equals(other: TableViewModel): boolean {
        if (this.tableModel.equals(other.tableModel) === false) {
            return false;
        }
        if ((this.corner.top !== other.corner.top) || (this.corner.left !== other.corner.left)) {
            return false;
        }
        if (this.headerColor.background.equals(other.headerColor.background) === false) {
            return false;
        }
        if (this.headerColor.foreground.equals(other.headerColor.foreground) === false) {
            return false;
        }
        if (this.createdAt.getTime() !== other.createdAt.getTime()) {
            return false;
        }

        return true;
    }
}