import { ERD_MESSAGE_EVENT_SOURCE } from "~/components/constant";
import type { SystemThemeResolver, ThemePreferenceStore } from "~/components/theme/ThemeHost";
import type { ColorTheme } from "~/models/ColorValue";
import ThemePreference from "~/components/theme/ThemePreference";

// 保存先はホスト (globalState) のため、変更はホストからの通知 (ready への応答) で同期する。
export class VsCodePreferenceStore implements ThemePreferenceStore {

    private readonly vscodeApi: VsCodeApi;

    constructor(vscodeApi: VsCodeApi) {
        this.vscodeApi = vscodeApi;
    }

    // ホストが HTML に埋め込んだ保存済みの値を使い、初回描画時のテーマ切り替わり (フラッシュ) を防ぐ。
    public readInitial(): ThemePreference {
        return ThemePreference.toObject(window.erdThemePreference);
    }

    public save(preference: ThemePreference): void {
        const message: ChangeThemePreferenceMessage = {
            eventSource: ERD_MESSAGE_EVENT_SOURCE,
            messageType: "changeThemePreference",
            themePreference: preference.value
        };

        this.vscodeApi.postMessage(message);
    }

    // documentUri を持たないため、VsCodeExtensionApplication のリスナーとは独立して受信する。
    public subscribe(updatePreference: (preference: ThemePreference) => void): () => void {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if ((message == null) || (message.eventSource !== ERD_MESSAGE_EVENT_SOURCE)) {
                return;
            }
            if (message.messageType !== "themePreference") {
                return;
            }

            const nextPreference = ThemePreference.toObject(message.themePreference);
            updatePreference(nextPreference);
        };

        window.addEventListener("message", handleMessage);

        return () => {
            window.removeEventListener("message", handleMessage);
        };
    }
}

/** Webview -> extension host: the user picked a theme preference. */
type ChangeThemePreferenceMessage = {
    eventSource: typeof ERD_MESSAGE_EVENT_SOURCE,
    messageType: "changeThemePreference",
    /** Serialized `ThemePreference.value`; an instance does not survive structured clone. */
    themePreference: string
};

export class VsCodeSystemThemeResolver implements SystemThemeResolver {

    public resolve(): ColorTheme {
        const classNames = Array.from(document.body.classList);
        return toColorTheme(classNames);
    }

    // VSCode はテーマ変更時に body の class を差し替えるため、class 属性の変化を監視する。
    public subscribe(updateColorTheme: (colorTheme: ColorTheme) => void): () => void {
        const observer = new MutationObserver(() => {
            updateColorTheme(this.resolve());
        });

        observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });

        return () => {
            observer.disconnect();
        };
    }
}

// high-contrast-light は high-contrast と併記されるため、先に判定しないと dark と誤判定する。
const toColorTheme = (classNames: readonly string[]) => {
    if (classNames.includes("vscode-high-contrast-light")) {
        return "light";
    }

    if (classNames.includes("vscode-high-contrast") || classNames.includes("vscode-dark")) {
        return "dark";
    }

    return "light";
};

/** Extension host -> webview: the persisted theme preference (initial delivery and changes from other panels). */
export type ThemePreferenceMessage = {
    eventSource: typeof ERD_MESSAGE_EVENT_SOURCE,
    messageType: "themePreference",
    /** Serialized `ThemePreference.value`; an instance does not survive structured clone. */
    themePreference: string
};