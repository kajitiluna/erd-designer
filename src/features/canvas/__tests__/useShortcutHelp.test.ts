import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import useShortcutHelp from "~/features/canvas/useShortcutHelp";

type KeyOptions = {
    ctrlKey?: boolean, altKey?: boolean, metaKey?: boolean, shiftKey?: boolean,
    repeat?: boolean, isComposing?: boolean
};

// 各テストが追加した DOM 要素と描画した hook を、テスト終了時にまとめて片付ける
const appendedElements: HTMLElement[] = [];
const unmountCallbacks: (() => void)[] = [];

afterEach(() => {
    unmountCallbacks.splice(0).forEach(unmount => unmount());
    appendedElements.splice(0).forEach(element => element.remove());
});

const renderHelp = () => {
    const rendered = renderHook(() => useShortcutHelp());
    unmountCallbacks.push(rendered.unmount);
    return rendered;
};

const appendDialog = () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    appendedElements.push(dialog);
};

const focusTextInput = () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    appendedElements.push(input);
    input.focus();
};

const pressKey = (key: string, options: KeyOptions = {}): KeyboardEvent => {
    const event = new KeyboardEvent("keydown", { key, cancelable: true, ...options });
    act(() => { window.dispatchEvent(event); });
    return event;
};

describe("useShortcutHelp", () => {

    test("is closed initially", () => {
        const { result } = renderHelp();
        expect(result.current.helpOpen).toBe(false);
    });

    test("opens on / and closes on the next /", () => {
        const { result } = renderHelp();

        pressKey("/");
        expect(result.current.helpOpen).toBe(true);

        pressKey("/");
        expect(result.current.helpOpen).toBe(false);
    });

    test("opens on Shift+/, because some layouts type / with Shift", () => {
        const { result } = renderHelp();

        pressKey("/", { shiftKey: true });
        expect(result.current.helpOpen).toBe(true);
    });

    test.each([
        ["ctrl", { ctrlKey: true }],
        ["meta", { metaKey: true }],
        ["alt", { altKey: true }],
        ["auto-repeat", { repeat: true }],
        ["IME composition", { isComposing: true }],
    ])("does not open on / with %s", (_name, options) => {
        const { result } = renderHelp();

        pressKey("/", options);
        expect(result.current.helpOpen).toBe(false);
    });

    test("closes on Escape while open", () => {
        const { result } = renderHelp();
        pressKey("/");

        pressKey("Escape");
        expect(result.current.helpOpen).toBe(false);
    });

    test.each(["a", "?"])("ignores the unrelated key %s", (key) => {
        const { result } = renderHelp();

        pressKey(key);
        expect(result.current.helpOpen).toBe(false);

        pressKey("/");
        pressKey(key);
        expect(result.current.helpOpen).toBe(true);
    });

    test("ignores / and Escape while a dialog is shown", () => {
        const { result } = renderHelp();

        appendDialog();
        pressKey("/");
        expect(result.current.helpOpen).toBe(false);

        // 開いた状態でダイアログが現れても、Esc はヘルプを閉じない
        appendedElements.splice(0).forEach(element => element.remove());
        pressKey("/");
        expect(result.current.helpOpen).toBe(true);

        appendDialog();
        pressKey("Escape");
        expect(result.current.helpOpen).toBe(true);
    });

    test("does not open on / while a text input has focus", () => {
        const { result } = renderHelp();

        focusTextInput();
        expect(document.activeElement?.tagName).toBe("INPUT");

        pressKey("/");
        expect(result.current.helpOpen).toBe(false);
    });

    test("closes on Escape even while a text input has focus", () => {
        const { result } = renderHelp();
        pressKey("/");

        focusTextInput();
        expect(document.activeElement?.tagName).toBe("INPUT");

        pressKey("Escape");
        expect(result.current.helpOpen).toBe(false);
    });

    test("prevents the default action of / but not of Escape", () => {
        renderHelp();

        const slashEvent = pressKey("/");
        expect(slashEvent.defaultPrevented).toBe(true);

        const escapeEvent = pressKey("Escape");
        expect(escapeEvent.defaultPrevented).toBe(false);
    });
});
