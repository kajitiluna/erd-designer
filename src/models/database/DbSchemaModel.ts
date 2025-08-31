import { v4 as uuidV4 } from 'uuid';

import { PropertyNotExistsError } from "~/models/exceptions";

type DbSchemaModelOptions = {
    schemaId: string;
    schemaName: string;
    description: string;
};

type UpdateArgs = {
    schemaName?: string;
    description?: string;
};

class DbSchemaModel {

    public readonly schemaId: string;
    public readonly schemaName: string;
    public readonly description: string;

    private constructor({ schemaId, schemaName, description }: DbSchemaModelOptions) {
        this.schemaId = schemaId;
        this.schemaName = schemaName;
        this.description = description;
    }

    public static create(schemaName: string, description: string): DbSchemaModel {
        return new DbSchemaModel({ schemaId: uuidV4(), schemaName, description });
    }

    public update(args: UpdateArgs): DbSchemaModel {
        return new DbSchemaModel({
            schemaId: this.schemaId,
            schemaName: args.schemaName ?? this.schemaName,
            description: args.description ?? this.description
        });
    }

    public toJSON(): Record<string, unknown> {
        return {
            schemaId: this.schemaId,
            schemaName: this.schemaName,
            description: this.description
        };
    }

    public static toObject(obj: object): DbSchemaModel {
        if (!("schemaId" in obj)) {
            throw new PropertyNotExistsError("schemaId", obj);
        }
        if (!("schemaName" in obj)) {
            throw new PropertyNotExistsError("schemaName", obj);
        }

        return new DbSchemaModel({
            schemaId: obj.schemaId as string,
            schemaName: obj.schemaName as string,
            description: ("description" in obj ? obj.description as string : "")
        });
    }

    public equals(other: DbSchemaModel): boolean {
        return (this.schemaId === other.schemaId)
            && (this.schemaName === other.schemaName)
            && (this.description === other.description);
    }
}

export default DbSchemaModel;