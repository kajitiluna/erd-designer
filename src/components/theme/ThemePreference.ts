type PreferenceValue = "light" | "dark" | "default";

/** Theme choice made by the user. DEFAULT follows the host environment (OS or VSCode). */
export default class ThemePreference {

    public static readonly LIGHT = new ThemePreference("light");
    public static readonly DARK = new ThemePreference("dark");
    public static readonly DEFAULT = new ThemePreference("default");

    /** Serialized form, for boundaries an instance cannot cross as-is (storage, postMessage). */
    public readonly value: PreferenceValue;

    private constructor(value: PreferenceValue) {
        this.value = value;
    }

    /**
     * Preference used while the user has not chosen one (and for unreadable stored values).
     * Light is the appearance before theming existed, so existing users keep seeing it until they opt in.
     */
    public static initial(): ThemePreference {
        return ThemePreference.LIGHT;
    }

    /** Restores a preference from an untrusted serialized value. Unknown values become `initial()`. */
    public static toObject(value: unknown): ThemePreference {
        const matched = preferenceValues.find(preference => preference.value === value);
        return matched ?? ThemePreference.initial();
    }
}

const preferenceValues = [ThemePreference.LIGHT, ThemePreference.DARK, ThemePreference.DEFAULT] as const;
