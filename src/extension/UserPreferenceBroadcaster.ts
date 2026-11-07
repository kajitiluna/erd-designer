import type * as vscode from 'vscode';

import { ERD_MESSAGE_EVENT_SOURCE } from '~/components/constant';
import ThemePreference from '~/components/theme/ThemePreference';
import PanelLayout from '~/components/user-preference/PanelLayout';
import type { UserPreferenceKey } from '~/components/user-preference/UserPreferenceStore';
import type { UserPreferenceMessage } from '~/components/user-preference/VsCodeUserPreferenceStore';

/**
 * Owns the user's preferences on the extension host and keeps every open webview panel in sync.
 * They live in `globalState` because they are per-user settings shared by all `.erd` files.
 */
export class UserPreferenceBroadcaster {

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

    /** Sends every persisted preference to a single webview. */
    public sendCurrent(webview: vscode.Webview): void {
        const values = this.currentValues();
        PREFERENCE_DEFINITIONS.forEach(definition => {
            postMessage(webview, definition.key, values[definition.key]);
        });
    }

    /** Returns every persisted preference. An absent or unreadable stored value becomes that key's initial value. */
    public currentValues(): Record<UserPreferenceKey, string> {
        return {
            themePreference: this.readValue(THEME_DEFINITION),
            panelLayout: this.readValue(PANEL_LAYOUT_DEFINITION)
        };
    }

    private readValue(definition: PreferenceDefinition): string {
        const storedValue = this.globalState.get<unknown>(toGlobalStateKey(definition.key));
        return definition.normalize(storedValue);
    }

    /**
     * Persists a preference received from a webview, then notifies all panels.
     * An unknown key is ignored. An invalid value is stored as that key's initial value.
     * If persisting fails, nothing is broadcast so that panels never show a value that would be lost on restart.
     */
    public async changePreference(key: unknown, value: unknown): Promise<void> {
        const definition = PREFERENCE_DEFINITIONS.find(candidate => candidate.key === key);
        if (definition == null) {
            return;
        }

        const normalizedValue = definition.normalize(value);

        try {
            await this.globalState.update(toGlobalStateKey(definition.key), normalizedValue);
        } catch (error) {
            console.warn(`Failed to persist user preference "${definition.key}": ${error}`);
            return;
        }

        this.webviews.forEach(webview => {
            postMessage(webview, definition.key, normalizedValue);
        });
    }
}

type PreferenceDefinition = {
    key: UserPreferenceKey,
    /** Restores the value from an untrusted serialized form and returns its serialized form. */
    normalize: (value: unknown) => string
};

const THEME_DEFINITION: PreferenceDefinition = {
    key: "themePreference",
    normalize: value => ThemePreference.toObject(value).value
} as const;

const PANEL_LAYOUT_DEFINITION: PreferenceDefinition = {
    key: "panelLayout",
    normalize: value => PanelLayout.toObject(value)
} as const;

const PREFERENCE_DEFINITIONS: readonly PreferenceDefinition[] = [THEME_DEFINITION, PANEL_LAYOUT_DEFINITION];

const toGlobalStateKey = (key: UserPreferenceKey): string => {
    return `erdDesigner.${key}`;
};

const postMessage = (webview: vscode.Webview, key: UserPreferenceKey, value: string) => {
    const message: UserPreferenceMessage = {
        eventSource: ERD_MESSAGE_EVENT_SOURCE,
        messageType: "userPreference",
        key,
        value
    };

    webview.postMessage(message);
};
