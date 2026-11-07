import type SystemThemeResolver from "~/components/theme/SystemThemeResolver";
import type { ColorTheme } from "~/models/ColorValue";

export default class VsCodeSystemThemeResolver implements SystemThemeResolver {

    public resolve(): ColorTheme {
        const classNames = Array.from(document.body.classList);
        return toColorTheme(classNames);
    }

    // VSCode はテーマ変更時に body の class を差し替えるため、class 属性の変化を監視する。
    public subscribe(updateColorTheme: (colorTheme: ColorTheme) => void): () => void {
        const observer = new MutationObserver(() => {
            updateColorTheme(this.resolve());
        });

        observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });

        return () => {
            observer.disconnect();
        };
    }
}

// high-contrast-light は high-contrast と併記されるため、先に判定しないと dark と誤判定する。
const toColorTheme = (classNames: readonly string[]) => {
    if (classNames.includes("vscode-high-contrast-light")) {
        return "light";
    }

    if (classNames.includes("vscode-high-contrast") || classNames.includes("vscode-dark")) {
        return "dark";
    }

    return "light";
};
