import { findDatabaseColumns, migrateColumns } from "~/models/database/columns";
import ColumnType from "~/models/database/ColumnType";
import { Database, DatabaseType } from "~/models/database/DatabaseType";
import { PropertyNotExistsError } from "~/models/exceptions";
import { toObjects } from "~/models/util";

type DatabaseSettingModelType = {
    databaseType: DatabaseType,
    columnTypes: readonly ColumnType[],
    version: number
};

const CURRENT_VERSION = 20260321;

export default class DatabaseSettingModel {

    public readonly databaseType: DatabaseType;
    public readonly columnTypes: readonly ColumnType[];
    public readonly version: number;

    constructor({ databaseType, columnTypes, version }: DatabaseSettingModelType) {
        this.databaseType = databaseType;
        this.columnTypes = columnTypes;
        this.version = version;
    }

    public static create(databaseType: DatabaseType): DatabaseSettingModel {
        const columnTypes = findDatabaseColumns(databaseType);
        return new DatabaseSettingModel({ databaseType, columnTypes, version: CURRENT_VERSION });
    }

    public getDatabase(): Database {
        return Database.get(this.databaseType);
    }

    public initToColumnTypeMapping(): ((columnTypeId: number) => ColumnType) {
        const mapping = new Map(this.columnTypes.map(columnType => [columnType.id, columnType]));

        return (columnTypeId: number) => mapping.get(columnTypeId) ?? ColumnType.EMPTY;
    }

    public findColumnType(columnTypeId: number): ColumnType | null {
        return this.columnTypes.find(columnType => (columnType.id === columnTypeId)) ?? null;
    }

    public toJSON(): Record<string, unknown> {
        return {
            databaseType: this.databaseType,
            columnTypes: this.columnTypes.map(columnType => columnType.toJSON()),
            version: this.version
        };
    }

    public static toObject(obj: object): DatabaseSettingModel {
        if (!("databaseType" in obj)) {
            throw new PropertyNotExistsError("databaseType", obj);
        }
        if (!("columnTypes" in obj)) {
            throw new PropertyNotExistsError("columnTypes", obj);
        }

        const databaseType = obj.databaseType as DatabaseType;
        const orgColumnTypes = toObjects(obj.columnTypes, "columnTypes", value => ColumnType.toObject(value));
        const orgVersion = ("version" in obj) ? (obj.version as number) : 0;

        const columnTypes = migrateColumns(databaseType, orgColumnTypes, orgVersion);

        return new DatabaseSettingModel({
            databaseType: databaseType,
            columnTypes: columnTypes,
            version: CURRENT_VERSION
        });
    }

    public equals(other: DatabaseSettingModel): boolean {
        if (this.databaseType !== other.databaseType) {
            return false;
        }
        if (this.columnTypes.length !== other.columnTypes.length) {
            return false;
        }
        for (let index = 0; index < this.columnTypes.length; index++) {
            if (!this.columnTypes[index].equals(other.columnTypes[index])) {
                return false;
            }
        }

        return true;
    }
}