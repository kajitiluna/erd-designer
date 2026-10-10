import type ThemePreference from "~/components/theme/ThemePreference";
import type { ColorTheme } from "~/models/ColorValue";

/** Persists the user's theme choice outside of the `.erd` document. */
export interface ThemePreferenceStore {

    /**
     * Returns the value known synchronously at startup.
     * Falls back to `ThemePreference.initial()` when nothing is available yet.
     */
    readInitial(): ThemePreference;

    /** Persists the choice. Failures are swallowed so that the UI keeps working without persistence. */
    save(preference: ThemePreference): void;

    /** Notifies changes that originate outside this component tree. Returns an unsubscribe function. */
    subscribe(updatePreference: (preference: ThemePreference) => void): () => void;
}

/** Resolves what "default" means in the current host environment. */
export interface SystemThemeResolver {

    /** Returns the host's current color mode. */
    resolve(): ColorTheme;

    /** Notifies host color mode changes. Returns an unsubscribe function. */
    subscribe(updateColorTheme: (colorTheme: ColorTheme) => void): () => void;
}
