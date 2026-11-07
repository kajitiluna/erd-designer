import type UserPreferenceStore from "~/components/user-preference/UserPreferenceStore";
import type { UserPreferenceKey } from "~/components/user-preference/UserPreferenceStore";

export default class BrowserUserPreferenceStore implements UserPreferenceStore {

    public readInitial(key: UserPreferenceKey): unknown {
        try {
            const value = window.localStorage.getItem(toStorageKey(key));
            return value ?? undefined;
        } catch (exc) {
            console.debug(`Failed to read user preference "${key}" from localStorage. `
                + "This may happen in private browsing mode.", exc);

            // プライベートブラウズ等で storage に触れない場合は未保存として扱う
            return undefined;
        }
    }

    public save(key: UserPreferenceKey, value: string): void {
        try {
            window.localStorage.setItem(toStorageKey(key), value);
        } catch (exc) {
            console.warn(`Failed to persist user preference "${key}". This may happen in private browsing mode.`, exc);
        }
    }

    public subscribe(key: UserPreferenceKey, update: (value: unknown) => void): () => void {
        const storageKey = toStorageKey(key);

        // 他タブでの変更は storage イベントで届く。自タブの書き込みでは発火しない。
        const handleStorage = (event: StorageEvent) => {
            if (event.key !== storageKey) {
                return;
            }

            update(event.newValue ?? undefined);
        };

        window.addEventListener("storage", handleStorage);

        return () => {
            window.removeEventListener("storage", handleStorage);
        };
    }
}

const toStorageKey = (key: UserPreferenceKey): string => {
    return `erdDesigner.${key}`;
};
