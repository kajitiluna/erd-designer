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
 *
 * 生成そのものは副作用を持たない。BroadcastChannel を開くのは subscribe の責務であり、
 * 解除関数と対で扱うことで、React の再マウント (StrictMode の二重実行やホットリロード) でも
 * 購読が確実に張り直される。チャネル実体が二重に生き残ると echo 判定に使う
 * ExternalDocumentChangeDispatcher も二重になり、取り込んだ内容を保存し返すループを招くため、
 * 生存する実体を 1 つに保つことがこの設計の要点。
 */
export type LocalDocumentSyncChannel = {
    publish: (updating: ErdDocument, loggingMessage: string) => Promise<PublishResult>,
    /** 他タブからの通知を受け取り始める。返り値を呼ぶと購読を解除する */
    subscribe: () => () => void
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
    const channelName = toChannelName(documentKey);
    const changeDispatcher = new ExternalDocumentChangeDispatcher();

    let currentRevision = initialRevision;
    let latestKnownDocument = initialDocument;
    let subscribedChannel: BroadcastChannel | null = null;

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
        notifyOtherWindows(channelName, subscribedChannel, { revision: currentRevision });

        return { result: "accepted" };
    };

    const subscribe = (): (() => void) => {
        const channel = openBroadcastChannel(channelName);
        if (channel == null) {
            return () => { };
        }

        channel.onmessage = (event: MessageEvent<BroadcastPayload>) => {
            handleBroadcastMessage(event);
        };
        subscribedChannel = channel;

        return () => {
            subscribedChannel = null;
            channel.close();
        };
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

    const applyRemoteUpdate = (erdDocument: ErdDocument, revision: number) => {
        const importedDocument = erdDocument.reuseInstancesFrom(latestKnownDocument);
        currentRevision = revision;

        if (importedDocument === latestKnownDocument) {
            return;
        }

        latestKnownDocument = importedDocument;
        changeDispatcher.dispatch(importedDocument);
    };

    return { publish, subscribe };
};

export const localDocumentSyncChannelFactory: LocalDocumentSyncChannelFactory = {
    create: createLocalDocumentSyncChannel
} as const;

/**
 * 購読中ならその実体から送る。BroadcastChannel は自分自身の post を受け取らないため、
 * 購読用と送信用を同一実体にしておくと自タブへの折り返しが起きない。
 * 未購読の間 (マウント前後やアンマウント直後) に保存が走った場合だけ短命の実体で送り、
 * ライフサイクルの隙間で通知が失われないようにする。
 *
 * 通知の失敗は保存の成否と無関係なので、ここで握り潰す。成功した保存を
 * 「通知できなかった」という理由で失敗に見せてはならない。
 */
const notifyOtherWindows = (
    channelName: string, subscribedChannel: BroadcastChannel | null, payload: BroadcastPayload
) => {
    try {
        if (subscribedChannel != null) {
            subscribedChannel.postMessage(payload);
            return;
        }

        const temporaryChannel = openBroadcastChannel(channelName);
        if (temporaryChannel == null) {
            return;
        }

        temporaryChannel.postMessage(payload);
        temporaryChannel.close();
    } catch (error) {
        console.warn(`Failed to notify other windows. key: ${channelName}, detail: ${error}`);
    }
};

const openBroadcastChannel = (channelName: string): BroadcastChannel | null => {
    if (typeof BroadcastChannel === "undefined") {
        return null;
    }

    return new BroadcastChannel(channelName);
};

const toChannelName = (documentKey: string): string => {
    return `erd-designer:local-document:${documentKey}`;
};
