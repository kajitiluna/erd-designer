import ErdDocumentSummary from "~/features/storage/ErdDocumentSummary";
import ErdDocument from "~/models/ErdDocument";

export default interface ErdDocumentStorage {

    isAvailable(): boolean

    findAll(): Promise<ErdDocumentSummary[]>

    find(key: string): Promise<ErdDocument | null>

    save(key: string, erdDocument: ErdDocument, loggingMessage: string): Promise<void>

    delete(key: string): Promise<void>
};