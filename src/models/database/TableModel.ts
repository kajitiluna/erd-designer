import { v4 as uuidV4 } from 'uuid';

import ColumnEntry from '~/models/database/ColumnEntry';
import TableIndexModel from '~/models/database/TableIndexModel';
import TableUniqueKeysModel from '~/models/database/TableUniqueKeysModel';
import { requireProperty, toObjects } from '~/models/util';

type TableModelOptions = {
    tableModelId?: string,
    physicalName?: string,
    logicalName?: string,
    schemaId?: string,
    columnEntries?: readonly ColumnEntry[],
    uniqueKeysModels?: readonly TableUniqueKeysModel[],
    tableIndexModels?: readonly TableIndexModel[],
    description?: string,
    checkExpression?: string,
    characterSet?: string,
    collate?: string,
    definitionExpression?: string,
    optionExpression?: string
}

export default class TableModel {

    public readonly tableModelId: string;
    public readonly physicalName: string;
    public readonly logicalName: string;
    public readonly schemaId: string;
    public readonly columnEntries: readonly ColumnEntry[];
    public readonly uniqueKeysModels: readonly TableUniqueKeysModel[];
    public readonly tableIndexModels: readonly TableIndexModel[];
    public readonly description: string;
    public readonly checkExpression: string;
    public readonly characterSet: string;
    public readonly collate: string;
    public readonly definitionExpression: string;
    public readonly optionExpression: string;

    constructor({
        tableModelId = "", physicalName = "", logicalName = "", schemaId = "",
        columnEntries = [], uniqueKeysModels = [], tableIndexModels = [], description = "",
        checkExpression = "", characterSet = "", collate = "", definitionExpression = "", optionExpression = ""
    }: TableModelOptions) {
        this.tableModelId = tableModelId ? tableModelId : uuidV4();
        this.physicalName = physicalName.trim();
        this.logicalName = logicalName.trim();
        this.schemaId = schemaId;
        this.columnEntries = columnEntries;
        this.uniqueKeysModels = uniqueKeysModels;
        this.tableIndexModels = tableIndexModels;
        this.description = description.trim();
        this.checkExpression = checkExpression.trim();
        this.characterSet = characterSet.trim();
        this.collate = collate.trim();
        this.definitionExpression = definitionExpression.trim();
        this.optionExpression = optionExpression.trim();
    }

    public addColumnModelIds(columnModelIds: string[]): TableModel {
        // TODO 本来はグループに属する columnModelId も検査対象にするべき
        const columnModelIdSet = new Set(this.columnEntries
            .filter(column => column.modelType === "single")
            .map(column => column.columnModelId)
        );
        const addingColumnModelIds: ColumnEntry[] = columnModelIds
            .filter(targetId => (columnModelIdSet.has(targetId) === false))
            .map(targetId => {
                return { modelType: "single", columnModelId: targetId };
            });
        if (addingColumnModelIds.length === 0) {
            return this;
        }

        return new TableModel({
            ...this,
            columnEntries: this.columnEntries.concat(addingColumnModelIds),
        });
    }

    public updateCheckExpression(
        changingNames: { previousName: { physicalName: string }, nextName: { physicalName: string } }[]
    ): TableModel {
        if ((this.checkExpression === "") || (changingNames.length === 0)) {
            return this;
        }

        let nextExpression = this.checkExpression;
        for (const changingName of changingNames) {
            const before = `\${${changingName.previousName.physicalName}}`;
            const after = `\${${changingName.nextName.physicalName}}`;
            nextExpression = nextExpression.replaceAll(before, after);
        }

        if (nextExpression === this.checkExpression) {
            return this;
        }

        return new TableModel({ ...this, checkExpression: nextExpression });
    }

    public equals(other: TableModel): boolean {
        if (this.tableModelId !== other.tableModelId) {
            return false;
        }
        if (this.physicalName !== other.physicalName) {
            return false;
        }
        if (this.logicalName !== other.logicalName) {
            return false;
        }

        if (this.schemaId !== other.schemaId) {
            return false;
        }
        if (ColumnEntry.equalsEntries(this.columnEntries, other.columnEntries) === false) {
            return false;
        }

        if (this.uniqueKeysModels.length !== other.uniqueKeysModels.length) {
            return false;
        }
        for (let index = 0; index < this.uniqueKeysModels.length; index++) {
            const thisUniqueKeyModel = this.uniqueKeysModels[index];
            const otherUniqueKeyModel = other.uniqueKeysModels[index];
            if (thisUniqueKeyModel.equals(otherUniqueKeyModel) === false) {
                return false;
            }
        }

        if (this.tableIndexModels.length !== other.tableIndexModels.length) {
            return false;
        }
        for (let index = 0; index < this.tableIndexModels.length; index++) {
            const thisIndexModel = this.tableIndexModels[index];
            const otherIndexModel = other.tableIndexModels[index];
            if (thisIndexModel.equals(otherIndexModel) === false) {
                return false;
            }
        }

        if (this.description !== other.description) {
            return false;
        }
        if (this.checkExpression !== other.checkExpression) {
            return false;
        }
        if (this.characterSet !== other.characterSet) {
            return false;
        }
        if (this.collate !== other.collate) {
            return false;
        }
        if (this.definitionExpression !== other.definitionExpression) {
            return false;
        }
        if (this.optionExpression !== other.optionExpression) {
            return false;
        }

        return true;
    }

    public toJSON(): Record<string, unknown> {
        const columnModelIds = ColumnEntry.serializeEntries(this.columnEntries);

        return {
            tableModelId: this.tableModelId,
            physicalName: this.physicalName,
            logicalName: this.logicalName,
            ...((this.schemaId != "") && { schemaId: this.schemaId }),
            columnModelIds: columnModelIds,
            ...((this.uniqueKeysModels.length > 0)
                && { uniqueKeysModels: this.uniqueKeysModels.map(model => model.toJSON()) }),
            ...((this.tableIndexModels.length > 0)
                && { tableIndexModels: this.tableIndexModels.map(model => model.toJSON()) }),
            ...((this.description !== "") && { description: this.description }),
            ...((this.checkExpression !== "") && { checkExpression: this.checkExpression }),
            ...((this.characterSet !== "") && { characterSet: this.characterSet }),
            ...((this.collate !== "") && { collate: this.collate }),
            ...((this.definitionExpression !== "") && { definitionExpression: this.definitionExpression }),
            ...((this.optionExpression !== "") && { optionExpression: this.optionExpression })
        };
    }

    public static toObject(obj: object): TableModel {
        requireProperty(obj, "tableModelId");
        requireProperty(obj, "physicalName");
        requireProperty(obj, "logicalName");
        requireProperty(obj, "columnModelIds");

        const schemaId = ("schemaId" in obj) ? obj.schemaId as string : "";

        const columnEntries: ColumnEntry[] = ColumnEntry.deserializeEntries(obj.columnModelIds as string[]);

        const uniqueKeysModels = ("uniqueKeysModels" in obj)
            ? toObjects(obj.uniqueKeysModels, "uniqueKeysModels", value => TableUniqueKeysModel.toObject(value)) : [];
        const tableIndexModels = ("tableIndexModels" in obj)
            ? toObjects(obj.tableIndexModels, "tableIndexModels", value => TableIndexModel.toObject(value)) : [];
        const description = ("description" in obj) ? obj.description as string : "";
        const checkExpression = ("checkExpression" in obj) ? obj.checkExpression as string : "";
        const characterSet = ("characterSet" in obj) ? obj.characterSet as string : "";
        const collate = ("collate" in obj) ? obj.collate as string : "";
        const definitionExpression = ("definitionExpression" in obj) ? obj.definitionExpression as string : "";
        const optionExpression = ("optionExpression" in obj) ? obj.optionExpression as string : "";

        return new TableModel({
            tableModelId: obj.tableModelId as string,
            physicalName: obj.physicalName as string,
            logicalName: obj.logicalName as string,
            schemaId: schemaId,
            columnEntries: columnEntries,
            uniqueKeysModels: uniqueKeysModels,
            tableIndexModels: tableIndexModels,
            description: description,
            checkExpression: checkExpression,
            characterSet: characterSet,
            collate: collate,
            definitionExpression: definitionExpression,
            optionExpression: optionExpression
        });
    }
}
