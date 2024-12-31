import { findDatabaseColumns } from "~/models/database/columns";
import ColumnType from "~/models/database/ColumnType";
import { DatabaseType } from "~/models/database/DatabaseType";
import { PropertyNotExistsError } from "~/models/exceptions";
import { toObjects } from "~/models/util";

type DatabaseSettingModelType = {
    databaseType: DatabaseType,
    columnTypes: readonly ColumnType[],
};

export default class DatabaseSettingModel {

    public readonly databaseType: DatabaseType;
    public readonly columnTypes: readonly ColumnType[];

    constructor({ databaseType, columnTypes }: DatabaseSettingModelType) {
        this.databaseType = databaseType;
        this.columnTypes = columnTypes;
    }

    public static create(databaseType: DatabaseType): DatabaseSettingModel {
        const columnTypes = findDatabaseColumns(databaseType);
        return new DatabaseSettingModel({ databaseType, columnTypes });
    }

    public initToColumnTypeMapping(): ((columnTypeId: number) => ColumnType) {
        const mapping = new Map<number, ColumnType>(this.columnTypes.map((columnType) => [columnType.id, columnType]));

        return (columnTypeId: number) => mapping.get(columnTypeId) ?? ColumnType.EMPTY;
    }

    // TODO 上記と統合する
    public findColumnType(columnTypeId: number): ColumnType | null {
        const filteredColumns = this.columnTypes.filter(
            (columnType) => columnType.id === columnTypeId
        );

        if (filteredColumns.length <= 0) {
            return null;
        }

        return filteredColumns[0];
    }

    public toJSON(): Record<string, unknown> {
        return {
            databaseType: this.databaseType,
            columnTypes: this.columnTypes.map((columnType) => columnType.toJSON()),
        };
    }

    public static toObject(obj: object): DatabaseSettingModel {
        if (!("databaseType" in obj)) {
            throw new PropertyNotExistsError("databaseType", obj);
        }
        if (!("columnTypes" in obj)) {
            throw new PropertyNotExistsError("columnTypes", obj);
        }

        const columnTypes = toObjects(obj.columnTypes, "columnTypes", (value) => ColumnType.toObject(value));

        return new DatabaseSettingModel({
            databaseType: obj.databaseType as DatabaseType,
            columnTypes: columnTypes
        });
    }
}