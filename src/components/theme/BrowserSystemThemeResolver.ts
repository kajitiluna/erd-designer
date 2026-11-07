import type SystemThemeResolver from "~/components/theme/SystemThemeResolver";
import type { ColorTheme } from "~/models/ColorValue";

const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export default class BrowserSystemThemeResolver implements SystemThemeResolver {

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
