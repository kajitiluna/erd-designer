/* oxlint-disable typescript/no-explicit-any */
interface VsCodeApi {
    postMessage(message: any): void;
    getState(): any;
    setState(state: any): void;
}

interface Window {
    vscodeApi?: VsCodeApi;
    /** Serialized per-user preferences injected by the extension host, keyed by `UserPreferenceKey`; absent outside VSCode. */
    erdUserPreferences?: Partial<Record<string, unknown>>;
}