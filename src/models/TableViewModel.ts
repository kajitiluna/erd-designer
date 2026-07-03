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