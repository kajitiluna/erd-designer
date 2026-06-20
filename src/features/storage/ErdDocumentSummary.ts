import { DatabaseType } from "~/models/database";

export type ErdDocumentSummary = {
    key: string;
    documentName: string;
    lastUpdatedAt: Date;
    databaseType?: DatabaseType;
};

export default ErdDocumentSummary;
