import { v4 as uuidV4 } from 'uuid';
import DisplayStyle from '~/models/database/DisplayStyle';
import TableIndexModel from '~/models/database/TableIndexModel';
import { PropertyNotExistsError } from '~/models/exceptions';
import { toObjects } from '~/models/util';


type TableModelOptions = {
    tableModelId?: string,
    physicalName?: string,
    logicalName?: string,
    columnModelIds?: string[],
    tableIndexModels?: TableIndexModel[],
    description?: string
}

export default class TableModel {

    public readonly tableModelId: string;
    public readonly physicalName: string;
    public readonly logicalName: string;
    public readonly columnModelIds: readonly string[];
    public readonly tableIndexModels: readonly TableIndexModel[];
    public readonly description: string;

    constructor({
        tableModelId = "",
        physicalName = "",
        logicalName = "",
        columnModelIds = [],
        tableIndexModels = [],
        description = ""
    }: TableModelOptions) {
        this.tableModelId = tableModelId ? tableModelId : uuidV4();
        this.physicalName = physicalName.trim();
        this.logicalName = logicalName.trim();
        this.columnModelIds = columnModelIds;
        this.tableIndexModels = tableIndexModels;
        this.description = description;
    }

    public displayName(displayStyle: DisplayStyle): string {
        return displayStyle.displayName(this.physicalName, this.logicalName);
    }

    public addColumnModelIds(columnModelIds: string[]): TableModel {
        const addingColumnModelIds = columnModelIds
            .filter(targetId => (this.columnModelIds.includes(targetId) === false));
        if (addingColumnModelIds.length === 0) {
            return this;
        }

        return new TableModel({
            tableModelId: this.tableModelId,
            physicalName: this.physicalName,
            logicalName: this.logicalName,
            columnModelIds: this.columnModelIds.concat(addingColumnModelIds),
            tableIndexModels: [...this.tableIndexModels],
            description: this.description
        });
    }

    public toJSON(): Record<string, unknown> {
        return {
            tableModelId: this.tableModelId,
            physicalName: this.physicalName,
            logicalName: this.logicalName,
            columnModelIds: this.columnModelIds,
            tableIndexModels: this.tableIndexModels.map((tableIndexModel) => tableIndexModel.toJSON()),
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

        const tableIndexModels = ("tableIndexModels" in obj)
            ? toObjects(obj.tableIndexModels, "tableIndexModels", (value) => TableIndexModel.toObject(value)) : [];
        const description = ("description" in obj) ? obj.description as string : "";

        return new TableModel({
            tableModelId: obj.tableModelId as string,
            physicalName: obj.physicalName as string,
            logicalName: obj.logicalName as string,
            columnModelIds: obj.columnModelIds as string[],
            tableIndexModels: tableIndexModels,
            description: description
        });
    }
}