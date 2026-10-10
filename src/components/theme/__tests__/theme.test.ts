import { describe, test, expect, beforeEach, afterEach } from "vitest";

import { BrowserPreferenceStore } from "~/components/theme/BrowserTheme";
import ThemePreference from "~/components/theme/ThemePreference";
import { VsCodeSystemThemeResolver } from "~/components/theme/VsCodeTheme";

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

const STORAGE_KEY = "erdDesigner.themePreference";

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

describe("BrowserPreferenceStore", () => {
    const store = new BrowserPreferenceStore();

    // この環境では jsdom の localStorage が使えないため、Map ベースの代替を差し込む
    beforeEach(() => {
        const entries = new Map<string, string>();
        const fakeStorage = {
            getItem: (key: string) => entries.get(key) ?? null,
            setItem: (key: string, value: string) => { entries.set(key, value); }
        };
        Object.defineProperty(window, "localStorage", { value: fakeStorage, configurable: true });
    });

    test("未保存の場合は初期値の light", () => {
        expect(store.readInitial()).toBe(ThemePreference.initial());
    });

    test("save した値を readInitial で読める", () => {
        store.save(ThemePreference.DARK);

        expect(window.localStorage.getItem(STORAGE_KEY)).toBe("dark");
        expect(store.readInitial()).toBe(ThemePreference.DARK);
    });

    test("保存済みの不正値は初期値の light", () => {
        window.localStorage.setItem(STORAGE_KEY, "sepia");

        expect(store.readInitial()).toBe(ThemePreference.initial());
    });

    test("default を選んだ場合は保存され、そのまま読める", () => {
        store.save(ThemePreference.DEFAULT);

        expect(store.readInitial()).toBe(ThemePreference.DEFAULT);
    });
});
