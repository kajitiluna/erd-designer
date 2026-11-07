import type { ColorTheme } from "~/models/ColorValue";

/** Resolves what "default" means in the current host environment. */
export default interface SystemThemeResolver {

    /** Returns the host's current color mode. */
    resolve(): ColorTheme;

    /** Notifies host color mode changes. Returns an unsubscribe function. */
    subscribe(updateColorTheme: (colorTheme: ColorTheme) => void): () => void;
}
