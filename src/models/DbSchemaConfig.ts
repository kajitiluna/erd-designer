import DbSchemaModel from "~/models/database/DbSchemaModel";
import { PropertyNotExistsError } from "~/models/exceptions";
import { toObjects } from "~/models/util";

class DbSchemaConfig {

    public readonly defaultSchemaId: string;

    private readonly schemaIds: string[];

    private readonly schemaMap: Map<string, DbSchemaModel>;

    private constructor(defaultSchemaId: string, schemaIds: string[], schemaMap: Map<string, DbSchemaModel>) {
        this.defaultSchemaId = schemaMap.has(defaultSchemaId) ? defaultSchemaId : "";
        this.schemaIds = schemaIds;
        this.schemaMap = schemaMap;
    }

    public static create(args: DbSchemaConfigArgs = {}): DbSchemaConfig {
        const defaultSchemaId = args.defaultSchemaId || "";
        const schemas = args.schemas || [];
        const schemaIds = schemas.map(schema => schema.schemaId);
        const schemaMap = new Map(schemas.map(schema => [schema.schemaId, schema]));

        return new DbSchemaConfig(defaultSchemaId, schemaIds, schemaMap);
    }

    public findSchema(schemaId: string): DbSchemaModel | null {
        return this.schemaMap.get(schemaId) || null;
    }

    public getSchemas(): DbSchemaModel[] {
        return this.schemaIds.map(id => this.schemaMap.get(id)!);
    }

    public equals(other: DbSchemaConfig): boolean {
        if (this === other) {
            return true;
        }

        if (this.defaultSchemaId !== other.defaultSchemaId) {
            return false;
        }

        if (this.schemaIds.length !== other.schemaIds.length) {
            return false;
        }

        for (const [index, schemaId] of this.schemaIds.entries()) {
            const otherSchemaId = other.schemaIds[index];
            if (schemaId !== otherSchemaId) {
                return false;
            }

            const thisSchema = this.schemaMap.get(schemaId);
            const otherSchema = other.schemaMap.get(schemaId);
            if (!thisSchema || !otherSchema || !thisSchema.equals(otherSchema)) {
                return false;
            }
        }

        return true;
    }

    public toJSON(): Record<string, unknown> {
        return {
            defaultSchemaId: this.defaultSchemaId,
            schemas: this.getSchemas().map(schema => schema.toJSON())
        };
    }

    public static toObject(obj: object) {
        if (!("defaultSchemaId" in obj)) {
            throw new PropertyNotExistsError("defaultSchemaId", obj);
        }
        if (!("schemas" in obj)) {
            throw new PropertyNotExistsError("schemas", obj);
        }

        const defaultSchemaId = obj.defaultSchemaId as string;
        const schemas = toObjects(obj.schemas, "schemas", schema => DbSchemaModel.toObject(schema))

        const schemaIds = schemas.map(schema => schema.schemaId);
        const schemaMap = new Map(schemas.map(schema => [schema.schemaId, schema]));

        return new DbSchemaConfig(defaultSchemaId, schemaIds, schemaMap);
    }
}

type DbSchemaConfigArgs = Partial<{
    defaultSchemaId: string;
    schemas: DbSchemaModel[];
}>;

export default DbSchemaConfig;