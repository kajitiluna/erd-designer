export type UserPreferenceKey = "themePreference" | "panelLayout";

/** Persists per-user settings outside of the `.erd` document. Values are serialized; their owners restore them. */
export default interface UserPreferenceStore {

    /** Returns the value known synchronously at startup, or `undefined` when nothing is stored. */
    readInitial(key: UserPreferenceKey): unknown;

    /** Persists the value. Failures are swallowed so that the UI keeps working without persistence. */
    save(key: UserPreferenceKey, value: string): void;

    /** Notifies changes of `key` that originate outside this component tree. Returns an unsubscribe function. */
    subscribe(key: UserPreferenceKey, update: (value: unknown) => void): () => void;
}
