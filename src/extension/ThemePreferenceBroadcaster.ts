import type * as vscode from 'vscode';

import { ERD_MESSAGE_EVENT_SOURCE } from '~/components/constant';
import ThemePreference from '~/components/theme/ThemePreference';
import type { ThemePreferenceMessage } from '~/components/theme/VsCodeTheme';

/**
 * Owns the user's theme preference on the extension host and keeps every open webview panel in sync.
 * The preference lives in `globalState` because it is a per-user setting shared by all `.erd` files.
 */
export class ThemePreferenceBroadcaster {

    private readonly globalState: vscode.Memento;
    private readonly webviews: Set<vscode.Webview>;

    constructor(globalState: vscode.Memento) {
        this.globalState = globalState;
        this.webviews = new Set<vscode.Webview>();
    }

    /** Adds a webview to the broadcast targets. Returns a function that removes it. */
    public register(webview: vscode.Webview): () => void {
        this.webviews.add(webview);

        return () => {
            this.webviews.delete(webview);
        };
    }

    /** Sends the persisted preference to a single webview. */
    public sendCurrent(webview: vscode.Webview): void {
        const preference = this.currentPreference();
        postMessage(webview, preference);
    }

    /** Returns the persisted preference. An absent or unreadable stored value becomes the initial preference. */
    public currentPreference(): ThemePreference {
        const storedValue = this.globalState.get<unknown>(PREFERENCE_KEY);
        return ThemePreference.toObject(storedValue);
    }

    /**
     * Persists a preference received from a webview, then notifies all panels.
     * An invalid payload is stored as the initial preference.
     * If persisting fails, nothing is broadcast so that panels never show a preference that would be lost on restart.
     */
    public async changePreference(payload: unknown): Promise<void> {
        const preference = ThemePreference.toObject(payload);

        try {
            await this.globalState.update(PREFERENCE_KEY, preference.value);
        } catch (error) {
            console.warn(`Failed to persist theme preference: ${error}`);
            return;
        }

        this.webviews.forEach(webview => {
            postMessage(webview, preference);
        });
    }
}

const PREFERENCE_KEY = "erdDesigner.themePreference";

const postMessage = (webview: vscode.Webview, preference: ThemePreference) => {
    const message: ThemePreferenceMessage = {
        eventSource: ERD_MESSAGE_EVENT_SOURCE,
        messageType: "themePreference",
        themePreference: preference.value
    };

    webview.postMessage(message);
};
