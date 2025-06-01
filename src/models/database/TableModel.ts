import { v4 as uuidV4 } from 'uuid';
import DisplayStyle from '~/models/database/DisplayStyle';
import TableIndexModel from '~/models/database/TableIndexModel';
import { PropertyNotExistsError } from '~/models/exceptions';
import { toObjects } from '~/models/util';

type TableModelOptions = {
    tableModelId?: string,
    physicalName?: string,
    logicalName?: string,
    columns?: ColumnModelType[],
    tableIndexModels?: TableIndexModel[],
    description?: string
}

export type ColumnModelType = {
    modelType: "single",
    columnModelId: string
} | {
    modelType: "group",
    columnGroupId: string
}

export default class TableModel {

    public readonly tableModelId: string;
    public readonly physicalName: string;
    public readonly logicalName: string;
    public readonly columns: readonly ColumnModelType[];
    public readonly tableIndexModels: readonly TableIndexModel[];
    public readonly description: string;

    constructor({
        tableModelId = "", physicalName = "", logicalName = "",
        columns = [], tableIndexModels = [], description = ""
    }: TableModelOptions) {
        this.tableModelId = tableModelId ? tableModelId : uuidV4();
        this.physicalName = physicalName.trim();
        this.logicalName = logicalName.trim();
        this.columns = columns;
        this.tableIndexModels = tableIndexModels;
        this.description = description;
    }

    public displayName(displayStyle: DisplayStyle): string {
        return displayStyle.displayName(this.physicalName, this.logicalName);
    }

    public addColumnModelIds(columnModelIds: string[]): TableModel {
        // TODO 本来はグループに属する columnModelId も検査対象にするべき
        const columnModelIdSet = new Set(this.columns
            .filter(column => column.modelType === "single")
            .map(column => column.columnModelId)
        );
        const addingColumnModelIds: ColumnModelType[] = columnModelIds
            .filter(targetId => (columnModelIdSet.has(targetId) === false))
            .map(targetId => ({ modelType: "single", columnModelId: targetId }));
        if (addingColumnModelIds.length === 0) {
            return this;
        }

        return new TableModel({
            tableModelId: this.tableModelId,
            physicalName: this.physicalName,
            logicalName: this.logicalName,
            columns: this.columns.concat(addingColumnModelIds),
            tableIndexModels: [...this.tableIndexModels],
            description: this.description
        });
    }

    public toJSON(): Record<string, unknown> {
        const columnModelIds = this.columns.map(column =>
            (column.modelType === "group") ? `group:${column.columnGroupId}` : column.columnModelId
        );

        return {
            tableModelId: this.tableModelId,
            physicalName: this.physicalName,
            logicalName: this.logicalName,
            columnModelIds: columnModelIds,
            tableIndexModels: this.tableIndexModels.map(tableIndexModel => tableIndexModel.toJSON()),
            description: this.description
        };
    }

    public static toObject(obj: object): TableModel {
        if (!("tableModelId" in obj)) {
            throw new PropertyNotExistsError("tableModelId", obj);
        }
        if (!("physicalName" in obj)) {
            throw new PropertyNotExistsError("physicalName", obj);
        }
        if (!("logicalName" in obj)) {
            throw new PropertyNotExistsError("logicalName", obj);
        }
        if (!("columnModelIds" in obj)) {
            throw new PropertyNotExistsError("columnModelIds", obj);
        }

        const columns: ColumnModelType[] =
            (obj.columnModelIds as string[]).map(id =>
                id.startsWith("group:")
                    ? { modelType: "group", columnGroupId: id.substring(6) }
                    : { modelType: "single", columnModelId: id }
            )

        const tableIndexModels = ("tableIndexModels" in obj)
            ? toObjects(obj.tableIndexModels, "tableIndexModels", (value) => TableIndexModel.toObject(value)) : [];
        const description = ("description" in obj) ? obj.description as string : "";

        return new TableModel({
            tableModelId: obj.tableModelId as string,
            physicalName: obj.physicalName as string,
            logicalName: obj.logicalName as string,
            columns: columns,
            tableIndexModels: tableIndexModels,
            description: description
        });
    }
}