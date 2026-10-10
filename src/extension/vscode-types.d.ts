/* eslint-disable @typescript-eslint/no-explicit-any */
interface VsCodeApi {
    postMessage(message: any): void;
    getState(): any;
    setState(state: any): void;
}

interface Window {
    vscodeApi?: VsCodeApi;
    /** Serialized `ThemePreference.value` injected by the extension host; absent outside VSCode. */
    erdThemePreference?: unknown;
}