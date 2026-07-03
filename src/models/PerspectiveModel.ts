import { v4 as uuidV4 } from 'uuid';

import { requireProperty } from "~/models/util";

type PerspectiveModelOptions = {
    perspectiveId: string,
    perspectiveName: string,
    description: string,
    containIds: string[] | Set<string>
};

class PerspectiveModel {

    public readonly perspectiveId: string;

    public readonly perspectiveName: string;

    public readonly description: string;

    private readonly containIds: Set<string>;

    private constructor({
        perspectiveId, perspectiveName, description, containIds
    }: PerspectiveModelOptions) {
        this.perspectiveId = perspectiveId;
        this.perspectiveName = perspectiveName;
        this.description = description;
        this.containIds = new Set(containIds);
    }

    public static create(name: string, description: string = ""): PerspectiveModel {
        return new PerspectiveModel({
            perspectiveId: uuidV4(),
            perspectiveName: name,
            description: description,
            containIds: []
        });
    }

    public containsModel(modelId: string): boolean {
        return this.containIds.has(modelId);
    }

    public getContainIds(): string[] {
        return Array.from(this.containIds);
    }

    public update(name: string, description: string): PerspectiveModel {
        return new PerspectiveModel({
            perspectiveId: this.perspectiveId,
            perspectiveName: name,
            description: description,
            containIds: this.containIds
        });
    }

    public updateContainId(targetId: string, action: "add" | "remove"): PerspectiveModel {
        const nextContainIds = new Set(this.containIds);
        if (action === "add") {
            nextContainIds.add(targetId);
        } else {
            nextContainIds.delete(targetId);
        }

        return new PerspectiveModel({
            perspectiveId: this.perspectiveId,
            perspectiveName: this.perspectiveName,
            description: this.description,
            containIds: nextContainIds
        });
    }

    public updateAllContainIds(nextContainIds: string[]): PerspectiveModel {
        if ((this.containIds.size === 0) && (nextContainIds.length === 0)) {
            return this;
        }

        const matchAllContainIds = (this.containIds.size === nextContainIds.length)
            && [...nextContainIds].every(id => this.containIds.has(id));
        if (matchAllContainIds) {
            return this;
        }

        return new PerspectiveModel({
            perspectiveId: this.perspectiveId,
            perspectiveName: this.perspectiveName,
            description: this.description,
            containIds: nextContainIds
        });
    }

    public equals(other: PerspectiveModel): boolean {
        if (this.perspectiveId !== other.perspectiveId) {
            return false;
        }

        if (this.perspectiveName !== other.perspectiveName) {
            return false;
        }

        if (this.description !== other.description) {
            return false;
        }

        if (this.containIds.size !== other.containIds.size) {
            return false;
        }

        return [...this.containIds].every(id => other.containIds.has(id));
    }

    public toJSON(): Record<string, unknown> {
        const containIds = Array.from(this.containIds).sort();

        return {
            perspectiveId: this.perspectiveId,
            perspectiveName: this.perspectiveName,
            ...((this.description !== "") && { description: this.description }),
            containIds: containIds
        };
    }

    public static toObject(obj: object): PerspectiveModel {
        requireProperty(obj, "perspectiveId");
        requireProperty(obj, "perspectiveName");

        return new PerspectiveModel({
            perspectiveId: obj.perspectiveId as string,
            perspectiveName: obj.perspectiveName as string,
            description: ("description" in obj) ? (obj.description as string) : "",
            containIds: ("containIds" in obj) ? (obj.containIds as string[]) : []
        });
    }
}

export default PerspectiveModel;