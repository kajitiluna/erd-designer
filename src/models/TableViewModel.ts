import ColorValue from "~/models/ColorValue";
import TableModel from "~/models/database/TableModel";
import { PropertyNotExistsError } from "~/models/exceptions";

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
        if (!("tableModel" in obj)) {
            throw new PropertyNotExistsError("tableModel", obj);
        }
        if (!("top" in obj)) {
            throw new PropertyNotExistsError("top", obj);
        }
        if (!("left" in obj)) {
            throw new PropertyNotExistsError("left", obj);
        }
        if (!("headerBackgroundColor" in obj)) {
            throw new PropertyNotExistsError("headerBackgroundColor", obj);
        }
        if (!("headerForegroundColor" in obj)) {
            throw new PropertyNotExistsError("headerForegroundColor", obj);
        }

        return new TableViewModel({
            tableModel: TableModel.toObject(obj.tableModel as object),
            corner: { top: obj.top as number, left: obj.left as number },
            headerColor: {
                background: ColorValue.toObject(obj.headerBackgroundColor as object),
                foreground: ColorValue.toObject(obj.headerForegroundColor as object)
            },
            createdAt: ("createdAt" in obj) ? obj.createdAt as Date : new Date()
        });
    }
}