import { describe, test, expect, vi } from "vitest";
import type * as vscode from "vscode";

import { UserPreferenceBroadcaster } from "~/extension/UserPreferenceBroadcaster";

const createGlobalState = (initial: Record<string, unknown> = {}) => {
    const entries = new Map<string, unknown>(Object.entries(initial));
    const update = vi.fn(async (key: string, value: unknown) => { entries.set(key, value); });
    const memento = { get: (key: string) => entries.get(key), update, keys: () => [...entries.keys()] };

    return { entries, update, memento: memento as unknown as vscode.Memento };
};

const createWebview = () => {
    const postMessage = vi.fn();
    return { postMessage, webview: { postMessage } as unknown as vscode.Webview };
};

const MESSAGE_BASE = { eventSource: "erd-designer", messageType: "userPreference" };

describe("UserPreferenceBroadcaster.currentValues", () => {
    test("未保存のキーは各キーの初期値になる", () => {
        const { memento } = createGlobalState();

        const values = new UserPreferenceBroadcaster(memento).currentValues();

        expect(values).toEqual({ themePreference: "light", panelLayout: "normal" });
    });

    test("保存済みの値を返し、不正値は初期値へ正規化する", () => {
        const { memento } = createGlobalState({
            "erdDesigner.themePreference": "dark",
            "erdDesigner.panelLayout": "wide"
        });

        const values = new UserPreferenceBroadcaster(memento).currentValues();

        expect(values).toEqual({ themePreference: "dark", panelLayout: "normal" });
    });
});

describe("UserPreferenceBroadcaster.sendCurrent", () => {
    test("全キーを userPreference メッセージで送る", () => {
        const { memento } = createGlobalState({ "erdDesigner.panelLayout": "compact" });
        const { webview, postMessage } = createWebview();

        new UserPreferenceBroadcaster(memento).sendCurrent(webview);

        expect(postMessage).toHaveBeenCalledTimes(2);
        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ messageType: "userPreference", key: "themePreference", value: "light" }));
        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ messageType: "userPreference", key: "panelLayout", value: "compact" }));
    });
});

describe("UserPreferenceBroadcaster.changePreference", () => {
    test("正規化した値を erdDesigner.<key> へ保存し、登録済みの全パネルへ配信する", async () => {
        const { memento, entries } = createGlobalState();
        const first = createWebview();
        const second = createWebview();
        const broadcaster = new UserPreferenceBroadcaster(memento);
        broadcaster.register(first.webview);
        broadcaster.register(second.webview);

        await broadcaster.changePreference("panelLayout", "compact");

        expect(entries.get("erdDesigner.panelLayout")).toBe("compact");
        const expected = expect.objectContaining({ ...MESSAGE_BASE, key: "panelLayout", value: "compact" });
        expect(first.postMessage).toHaveBeenCalledWith(expected);
        expect(second.postMessage).toHaveBeenCalledWith(expected);
    });

    test("不正な値はそのキーの初期値として保存・配信する", async () => {
        const { memento, entries } = createGlobalState();
        const target = createWebview();
        const broadcaster = new UserPreferenceBroadcaster(memento);
        broadcaster.register(target.webview);

        await broadcaster.changePreference("themePreference", "sepia");

        expect(entries.get("erdDesigner.themePreference")).toBe("light");
        expect(target.postMessage).toHaveBeenCalledWith(expect.objectContaining({ key: "themePreference", value: "light" }));
    });

    test.each([undefined, null, "unknownKey", 1])("未知のキー %j は保存も配信もしない", async (key) => {
        const { memento, update } = createGlobalState();
        const target = createWebview();
        const broadcaster = new UserPreferenceBroadcaster(memento);
        broadcaster.register(target.webview);

        await broadcaster.changePreference(key, "dark");

        expect(update).not.toHaveBeenCalled();
        expect(target.postMessage).not.toHaveBeenCalled();
    });

    test("保存に失敗した場合は配信しない", async () => {
        const { memento, update } = createGlobalState();
        update.mockRejectedValueOnce(new Error("disk full"));
        const target = createWebview();
        const broadcaster = new UserPreferenceBroadcaster(memento);
        broadcaster.register(target.webview);
        vi.spyOn(console, "warn").mockImplementation(() => { /* do nothing */ });

        await broadcaster.changePreference("panelLayout", "compact");

        expect(target.postMessage).not.toHaveBeenCalled();
    });

    test("登録解除したパネルには配信しない", async () => {
        const { memento } = createGlobalState();
        const target = createWebview();
        const broadcaster = new UserPreferenceBroadcaster(memento);
        const unregister = broadcaster.register(target.webview);
        unregister();

        await broadcaster.changePreference("panelLayout", "compact");

        expect(target.postMessage).not.toHaveBeenCalled();
    });
});
