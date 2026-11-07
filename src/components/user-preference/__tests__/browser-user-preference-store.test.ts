import { describe, test, expect, beforeEach } from "vitest";

import BrowserUserPreferenceStore from "~/components/user-preference/BrowserUserPreferenceStore";

describe("BrowserUserPreferenceStore", () => {
    const store = new BrowserUserPreferenceStore();

    // この環境では jsdom の localStorage が使えないため、Map ベースの代替を差し込む
    beforeEach(() => {
        const entries = new Map<string, string>();
        const fakeStorage = {
            getItem: (key: string) => entries.get(key) ?? null,
            setItem: (key: string, value: string) => { entries.set(key, value); }
        };
        Object.defineProperty(window, "localStorage", { value: fakeStorage, configurable: true });
    });

    test("未保存の場合は undefined", () => {
        expect(store.readInitial("themePreference")).toBeUndefined();
        expect(store.readInitial("panelLayout")).toBeUndefined();
    });

    test("save した値を同じキーの readInitial で読める", () => {
        store.save("themePreference", "dark");

        expect(store.readInitial("themePreference")).toBe("dark");
    });

    test("キーごとに独立して保存される", () => {
        store.save("themePreference", "dark");
        store.save("panelLayout", "compact");

        expect(store.readInitial("themePreference")).toBe("dark");
        expect(store.readInitial("panelLayout")).toBe("compact");
    });

    test("既存の保存キー erdDesigner.themePreference を維持する", () => {
        store.save("themePreference", "default");
        expect(window.localStorage.getItem("erdDesigner.themePreference")).toBe("default");

        window.localStorage.setItem("erdDesigner.panelLayout", "compact");
        expect(store.readInitial("panelLayout")).toBe("compact");
    });

    test("storage イベントは購読したキーのものだけ通知する", () => {
        const received: unknown[] = [];
        const unsubscribe = store.subscribe("panelLayout", value => { received.push(value); });

        window.dispatchEvent(new StorageEvent("storage", { key: "erdDesigner.themePreference", newValue: "dark" }));
        window.dispatchEvent(new StorageEvent("storage", { key: "erdDesigner.panelLayout", newValue: "compact" }));
        window.dispatchEvent(new StorageEvent("storage", { key: "erdDesigner.panelLayout", newValue: null }));

        expect(received).toEqual(["compact", undefined]);

        unsubscribe();
        window.dispatchEvent(new StorageEvent("storage", { key: "erdDesigner.panelLayout", newValue: "normal" }));
        expect(received).toHaveLength(2);
    });
});
