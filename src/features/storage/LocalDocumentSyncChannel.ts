import ExternalDocumentChangeDispatcher from "~/components/ExternalDocumentChangeDispatcher";
import ErdDocumentStorage from "~/features/storage/ErdDocumentStorage";
import ErdDocument from "~/models/ErdDocument";

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
export default class LocalDocumentSyncChannel {

    private readonly documentStorage: ErdDocumentStorage;
    private readonly documentKey: string;
    private readonly channelName: string;
    private readonly changeDispatcher: ExternalDocumentChangeDispatcher;

    private currentRevision: number;
    private latestKnownDocument: ErdDocument;
    private subscribedChannel: BroadcastChannel | null;
    private publishQueue: Promise<void>;
    private remoteUpdateCount: number;

    constructor(
        documentStorage: ErdDocumentStorage, documentKey: string,
        initialDocument: ErdDocument, initialRevision: number
    ) {
        this.documentStorage = documentStorage;
        this.documentKey = documentKey;
        this.channelName = `erd-designer:local-document:${documentKey}`;
        this.changeDispatcher = new ExternalDocumentChangeDispatcher();

        this.currentRevision = initialRevision;
        this.latestKnownDocument = initialDocument;
        this.subscribedChannel = null;
        this.publishQueue = Promise.resolve();
        this.remoteUpdateCount = 0;
    }

    /**
     * Saves the document. Concurrent calls are serialised so each one reads the revision
     * its predecessor stored.
     */
    public publish(updating: ErdDocument, loggingMessage: string): Promise<PublishResult> {
        // 直前に自分が取り込んだ他タブの更新を、そのまま保存し返さない。dispatch は同期呼び出しであり
        // isEcho はその呼び出しに対して判定する必要があるため、キューに載せる前に同期的に行う。
        if (this.changeDispatcher.isEcho(updating)) {
            return Promise.resolve({ result: "accepted" });
        }

        // currentRevision の読み取りから書き込みまでが await を跨ぐため、直列化しないと
        // 同じ expectedRevision で二重に保存し、後続が偽の競合になる。以降 currentRevision は
        // 二度と進まないため、その状態は保存が永久に通らない状態として残り続ける。
        const baseRemoteUpdateCount = this.remoteUpdateCount;
        const publishing = this.publishQueue.then(() => {
            return this.doPublish(updating, loggingMessage, baseRemoteUpdateCount);
        });

        // チェーンが reject するとキューが止まり以降の保存が一切行われなくなるため、失敗はキューへ伝えない
        this.publishQueue = publishing.then(() => { }).catch(() => { });

        return publishing;
    }

    private async doPublish(
        updating: ErdDocument, loggingMessage: string, baseRemoteUpdateCount: number
    ): Promise<PublishResult> {
        // 待機中に他タブの更新を取り込んでいれば、この内容は置き換えられた古い版を土台にした編集である。
        // 取り込みで進んだ currentRevision で保存すると CAS をすり抜け、他タブが勝ち取った内容を上書きする。
        if (this.remoteUpdateCount !== baseRemoteUpdateCount) {
            return { result: "conflict", latest: this.latestKnownDocument };
        }

        this.latestKnownDocument = updating;

        const saveResult = await this.documentStorage.save(
            this.documentKey, updating, this.currentRevision, loggingMessage
        );

        if (saveResult.result === "conflict") {
            return { result: "conflict", latest: saveResult.latest };
        }

        this.currentRevision = saveResult.revision;
        notifyOtherWindows(this.channelName, this.subscribedChannel, { revision: this.currentRevision });

        return { result: "accepted" };
    }

    public subscribe(): () => void {
        const channel = openBroadcastChannel(this.channelName);
        if (channel == null) {
            return () => { };
        }

        channel.onmessage = (event: MessageEvent<BroadcastPayload>) => {
            this.handleBroadcastMessage(event);
        };
        this.subscribedChannel = channel;

        return () => {
            this.subscribedChannel = null;
            channel.close();
        };
    }

    private handleBroadcastMessage(event: MessageEvent<BroadcastPayload>): void {
        // 既に知っている revision 以下の通知は、自分自身の publish の折り返しか、別の通知で追い越し済みなので、読みに行く必要がない
        if (event.data.revision <= this.currentRevision) {
            return;
        }

        this.documentStorage.find(this.documentKey).then(found => {
            if ((found == null) || (found.revision <= this.currentRevision)) {
                return;
            }

            this.applyRemoteUpdate(found.erdDocument, found.revision);
        });
    }

    private applyRemoteUpdate(erdDocument: ErdDocument, revision: number): void {
        const importedDocument = erdDocument.reuseInstancesFrom(this.latestKnownDocument);
        this.currentRevision = revision;
        this.remoteUpdateCount += 1;

        if (importedDocument === this.latestKnownDocument) {
            return;
        }

        this.latestKnownDocument = importedDocument;
        this.changeDispatcher.dispatch(importedDocument);
    }
}

type PublishResult = { result: "accepted" } | { result: "conflict", latest: ErdDocument };
type BroadcastPayload = { revision: number };

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
