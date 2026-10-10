import type { SystemThemeResolver, ThemePreferenceStore } from "~/components/theme/ThemeHost";
import type { ColorTheme } from "~/models/ColorValue";
import ThemePreference from "~/components/theme/ThemePreference";

export class BrowserPreferenceStore implements ThemePreferenceStore {

    public readInitial(): ThemePreference {
        try {
            const value = window.localStorage.getItem(PREFERENCE_KEY);
            return ThemePreference.toObject(value);
        } catch (exc) {
            console.debug("Failed to read theme preference from localStorage. "
                + "This may happen in private browsing mode.", exc);

            // プライベートブラウズ等で storage に触れない場合は未保存として扱う
            return ThemePreference.initial();
        }
    }

    public save(preference: ThemePreference): void {
        try {
            window.localStorage.setItem(PREFERENCE_KEY, preference.value);
        } catch (exc) {
            console.warn("Failed to persist theme preference. This may happen in private browsing mode.", exc);
        }
    }

    public subscribe(updatePreference: (preference: ThemePreference) => void): () => void {
        // 他タブでの変更は storage イベントで届く。自タブの書き込みでは発火しない。
        const handleStorage = (event: StorageEvent) => {
            if (event.key !== PREFERENCE_KEY) {
                return;
            }

            const nextPreference = ThemePreference.toObject(event.newValue);
            updatePreference(nextPreference);
        };

        window.addEventListener("storage", handleStorage);

        return () => {
            window.removeEventListener("storage", handleStorage);
        };
    }
}

const PREFERENCE_KEY = "erdDesigner.themePreference";

const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export class BrowserSystemThemeResolver implements SystemThemeResolver {

    public resolve(): ColorTheme {
        const isDark = window.matchMedia(DARK_MEDIA_QUERY).matches;
        return isDark ? "dark" : "light";
    }

    public subscribe(updateColorTheme: (colorTheme: ColorTheme) => void): () => void {
        const mediaQuery = window.matchMedia(DARK_MEDIA_QUERY);
        const handleChange = (event: MediaQueryListEvent) => {
            updateColorTheme(event.matches ? "dark" : "light");
        };

        mediaQuery.addEventListener("change", handleChange);

        return () => {
            mediaQuery.removeEventListener("change", handleChange);
        };
    }
}
