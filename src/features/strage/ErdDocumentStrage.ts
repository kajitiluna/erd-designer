import ErdDocumentSummary from "~/features/strage/ErdDocumentSummary";
import ErdDocument from "~/models/ErdDocument";

export default interface ErdDocumentStrage {

    isAvailable(): boolean

    findAll(): Promise<ErdDocumentSummary[]>

    find(key: string): Promise<ErdDocument | null>

    save(key: string, erdDocument: ErdDocument): Promise<void>

    delete(key: string): Promise<void>
};