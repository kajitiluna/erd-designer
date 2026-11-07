import { ERD_MESSAGE_EVENT_SOURCE } from "~/components/constant";
import type UserPreferenceStore from "~/components/user-preference/UserPreferenceStore";
import type { UserPreferenceKey } from "~/components/user-preference/UserPreferenceStore";

// 保存先はホスト (globalState) のため、変更はホストからの通知 (ready への応答) で同期する。
export default class VsCodeUserPreferenceStore implements UserPreferenceStore {

    private readonly vscodeApi: VsCodeApi;

    constructor(vscodeApi: VsCodeApi) {
        this.vscodeApi = vscodeApi;
    }

    // ホストが HTML に埋め込んだ保存済みの値を使い、初回描画時の切り替わり (フラッシュ) を防ぐ。
    public readInitial(key: UserPreferenceKey): unknown {
        return window.erdUserPreferences?.[key];
    }

    public save(key: UserPreferenceKey, value: string): void {
        const message: ChangeUserPreferenceMessage = {
            eventSource: ERD_MESSAGE_EVENT_SOURCE,
            messageType: "changeUserPreference",
            key,
            value
        };

        this.vscodeApi.postMessage(message);
    }

    // documentUri を持たないため、VsCodeExtensionApplication のリスナーとは独立して受信する。
    public subscribe(key: UserPreferenceKey, update: (value: unknown) => void): () => void {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if ((message == null) || (message.eventSource !== ERD_MESSAGE_EVENT_SOURCE)) {
                return;
            }
            if ((message.messageType !== "userPreference") || (message.key !== key)) {
                return;
            }

            update(message.value);
        };

        window.addEventListener("message", handleMessage);

        return () => {
            window.removeEventListener("message", handleMessage);
        };
    }
}

/** Webview -> extension host: the user changed a preference. */
type ChangeUserPreferenceMessage = {
    eventSource: typeof ERD_MESSAGE_EVENT_SOURCE,
    messageType: "changeUserPreference",
    key: UserPreferenceKey,
    /** Serialized form of the value; an instance does not survive structured clone. */
    value: string
};

/** Extension host -> webview: a persisted preference (initial delivery and changes from other panels). */
export type UserPreferenceMessage = {
    eventSource: typeof ERD_MESSAGE_EVENT_SOURCE,
    messageType: "userPreference",
    key: UserPreferenceKey,
    /** Serialized form of the value; an instance does not survive structured clone. */
    value: string
};
