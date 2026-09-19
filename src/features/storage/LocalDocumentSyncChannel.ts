import { ExternalDocumentChangeDispatcher } from "~/components/ExternalDocumentChangeDispatcher";
import ErdDocumentStorage from "~/features/storage/ErdDocumentStorage";
import ErdDocument from "~/models/ErdDocument";

export type PublishResult =
    | { result: "accepted" }
    | { result: "conflict", latest: ErdDocument };

/**
 * 同一ブラウザ上で同じローカルドキュメントを開く複数タブ間の同期チャネル。
 * 保存 (publish) は IndexedDB 側の compare-and-swap で先勝ちを保証し (R6)、
 * 他タブの保存は BroadcastChannel の到着を契機に IndexedDB から読み直して取り込む (R3/R4)。
 */
export type LocalDocumentSyncChannel = {
    publish: (updating: ErdDocument, loggingMessage: string) => Promise<PublishResult>,
    close: () => void
};

export type LocalDocumentSyncChannelFactory = {
    create: (
        documentStorage: ErdDocumentStorage, documentKey: string,
        initialDocument: ErdDocument, initialRevision: number
    ) => LocalDocumentSyncChannel
};

type BroadcastPayload = { revision: number };

const createLocalDocumentSyncChannel = (
    documentStorage: ErdDocumentStorage, documentKey: string, initialDocument: ErdDocument, initialRevision: number
): LocalDocumentSyncChannel => {
    let currentRevision = initialRevision;
    let latestKnownDocument = initialDocument;
    const changeDispatcher = new ExternalDocumentChangeDispatcher();
    const broadcastChannel = openBroadcastChannel(documentKey);

    const applyRemoteUpdate = (erdDocument: ErdDocument, revision: number) => {
        const importedDocument = erdDocument.reuseInstancesFrom(latestKnownDocument);
        currentRevision = revision;

        if (importedDocument === latestKnownDocument) {
            return;
        }

        latestKnownDocument = importedDocument;
        changeDispatcher.dispatch(importedDocument);
    };

    const handleBroadcastMessage = (event: MessageEvent<BroadcastPayload>) => {
        // 既に知っている revision 以下の通知は、自分自身の publish の折り返しか、
        // 別の通知で追い越し済みなので読みに行く必要がない。
        if (event.data.revision <= currentRevision) {
            return;
        }

        documentStorage.find(documentKey).then(found => {
            if ((found == null) || (found.revision <= currentRevision)) {
                return;
            }

            applyRemoteUpdate(found.erdDocument, found.revision);
        });
    };

    if (broadcastChannel != null) {
        broadcastChannel.onmessage = handleBroadcastMessage;
    }

    const publish = async (updating: ErdDocument, loggingMessage: string): Promise<PublishResult> => {
        // 直前に自分が取り込んだ他タブの更新を、そのまま保存し返さない
        if (changeDispatcher.isEcho(updating)) {
            return { result: "accepted" };
        }

        latestKnownDocument = updating;

        const saveResult = await documentStorage.save(documentKey, updating, loggingMessage, currentRevision);
        if (saveResult.result === "conflict") {
            return { result: "conflict", latest: saveResult.latest };
        }

        currentRevision = saveResult.revision;
        broadcastChannel?.postMessage({ revision: currentRevision } satisfies BroadcastPayload);

        return { result: "accepted" };
    };

    const close = () => {
        broadcastChannel?.close();
    };

    return { publish, close };
};

export const localDocumentSyncChannelFactory: LocalDocumentSyncChannelFactory = {
    create: createLocalDocumentSyncChannel
} as const;

const openBroadcastChannel = (documentKey: string): BroadcastChannel | null => {
    if (typeof BroadcastChannel === "undefined") {
        return null;
    }

    return new BroadcastChannel(`erd-designer:local-document:${documentKey}`);
};
