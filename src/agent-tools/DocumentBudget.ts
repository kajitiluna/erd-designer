import ErdDocument from "~/models/ErdDocument";

export const uriTemplates = {
    documents: "erd-designer://documents",
    documentDetail: "erd-designer://documents/{documentId}",
    documentFor: (documentId: string) => `erd-designer://documents/${documentId}`,
    database: "erd-designer://documents/{documentId}/database",
    tables: "erd-designer://documents/{documentId}/tables",
    tableDetail: "erd-designer://documents/{documentId}/tables/{tableId}",
    tableFor: (documentId: string, tableId: string) => `erd-designer://documents/${documentId}/tables/${tableId}`,
    columnDetail: "erd-designer://documents/{documentId}/columns/{columnId}",
    columnShares: "erd-designer://documents/{documentId}/column_shares",
    columnShareDetail: "erd-designer://documents/{documentId}/column_shares/{columnShareId}",
    columnTypes: "erd-designer://documents/{documentId}/column_types",
    columnTypeDetail: "erd-designer://documents/{documentId}/column_types/{columnTypeId}",
    relations: "erd-designer://documents/{documentId}/relations",
    relationDetail: "erd-designer://documents/{documentId}/relations/{relationId}",
    schemas: "erd-designer://documents/{documentId}/schemas",
    schemaDetail: "erd-designer://documents/{documentId}/schemas/{schemaId}",
    columnGroups: "erd-designer://documents/{documentId}/column_groups",
    columnGroupDetail: "erd-designer://documents/{documentId}/column_groups/{columnGroupId}",
    columnStructs: "erd-designer://documents/{documentId}/column_structs",
    columnStructDetail: "erd-designer://documents/{documentId}/column_structs/{columnStructId}",
    memos: "erd-designer://documents/{documentId}/memos",
    memoDetail: "erd-designer://documents/{documentId}/memos/{memoId}",
    perspectives: "erd-designer://documents/{documentId}/perspectives",
    perspectiveDetail: "erd-designer://documents/{documentId}/perspectives/{perspectiveId}",
} as const;

export default class DocumentBudget {

    public readonly documentId: string;
    public readonly fileUri: string;
    public readonly erdDocument: ErdDocument;
    private readonly rectangles: Map<string, RectangleType>;

    constructor(args: {
        documentId: string;
        uri: string;
        erdDocument: ErdDocument;
        rectangles: Map<string, RectangleType>;
    }) {
        this.documentId = args.documentId;
        this.fileUri = args.uri;
        this.erdDocument = args.erdDocument;
        this.rectangles = new Map(args.rectangles);
    }

    public documentUri(): string {
        return uriTemplates.documentFor(this.documentId);
    }

    public databaseUri(): string {
        return `${this.documentUri()}/database`;
    }

    public schemaListUri(): string {
        return `${this.documentUri()}/schemas`;
    }

    public schemaUri(schemaId: string): string {
        return `${this.documentUri()}/schemas/${schemaId}`;
    }

    public tableUri(tableId: string): string {
        return `${this.documentUri()}/tables/${tableId}`;
    }

    public columnGroupListUri(): string {
        return `${this.documentUri()}/column_groups`;
    }

    public columnGroupUri(columnGroupId: string): string {
        return `${this.documentUri()}/column_groups/${columnGroupId}`;
    }

    public columnStructListUri(): string {
        return `${this.documentUri()}/column_structs`;
    }

    public columnStructUri(columnStructId: string): string {
        return `${this.documentUri()}/column_structs/${columnStructId}`;
    }

    public columnUri(columnModelId: string): string {
        return `${this.documentUri()}/columns/${columnModelId}`;
    }

    public columnShareUri(columnShareModelId: string): string {
        return `${this.documentUri()}/column_shares/${columnShareModelId}`;
    }

    public columnTypeUri(columnTypeId: number): string {
        return `${this.documentUri()}/column_types/${columnTypeId}`;
    }

    public relationUri(relationId: string): string {
        return `${this.documentUri()}/relations/${relationId}`
    }

    public perspectiveListUri(): string {
        return `${this.documentUri()}/perspectives`;
    }

    public perspectiveUri(perspectiveId: string): string {
        return `${this.documentUri()}/perspectives/${perspectiveId}`;
    }

    public memoUri(memoId: string): string {
        return `${this.documentUri()}/memos/${memoId}`
    }

    public findRectangle(tableId: string): RectangleType | null {
        return this.rectangles.get(tableId) || null;
    }

    public getRectangles(): Map<string, RectangleType> {
        return new Map(this.rectangles);
    }
}

export type RectangleType = {
    positionX: number;
    positionY: number;
    width: number;
    height: number;
};