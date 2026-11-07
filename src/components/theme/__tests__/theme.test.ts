import { describe, test, expect, afterEach } from "vitest";

import ThemePreference from "~/components/theme/ThemePreference";
import VsCodeSystemThemeResolver from "~/components/theme/VsCodeSystemThemeResolver";

describe("VsCodeSystemThemeResolver.resolve", () => {
    afterEach(() => {
        document.body.className = "";
    });

    test.each([
        [["vscode-light"], "light"],
        [["vscode-dark"], "dark"],
        [["vscode-high-contrast", "vscode-dark"], "dark"],
        [["vscode-high-contrast"], "dark"],
        [["vscode-high-contrast", "vscode-high-contrast-light"], "light"],
        [["vscode-high-contrast-light"], "light"],
        [[], "light"],
        [["unrelated"], "light"]
    ])("%j は %s", (classNames, expected) => {
        document.body.className = classNames.join(" ");

        expect(new VsCodeSystemThemeResolver().resolve()).toBe(expected);
    });
});

describe("ThemePreference.toObject", () => {
    test.each([
        ["light", ThemePreference.LIGHT],
        ["dark", ThemePreference.DARK],
        ["default", ThemePreference.DEFAULT]
    ])("%s は対応する定数に復元する", (value, expected) => {
        expect(ThemePreference.toObject(value)).toBe(expected);
    });

    test.each([null, undefined, "", "system", "LIGHT", 1, {}])("不正値 %j は初期値の light", (value) => {
        expect(ThemePreference.toObject(value)).toBe(ThemePreference.initial());
    });
});
