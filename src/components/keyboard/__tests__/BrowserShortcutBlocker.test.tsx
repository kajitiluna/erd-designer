import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import BrowserShortcutBlocker from "~/components/keyboard/BrowserShortcutBlocker";

const pressKey = (init: KeyboardEventInit): KeyboardEvent => {
    const event = new KeyboardEvent("keydown", { cancelable: true, bubbles: true, ...init });
    document.body.dispatchEvent(event);

    return event;
};

let detach: () => void;

beforeEach(() => {
    detach = BrowserShortcutBlocker.attach(document);
});

afterEach(() => {
    detach();

    if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
    }
});

describe("BrowserShortcutBlocker 対象キー", () => {
    test.each([
        ["Cmd+←", { key: "ArrowLeft", metaKey: true }],
        ["Cmd+→", { key: "ArrowRight", metaKey: true }],
        ["Ctrl+←", { key: "ArrowLeft", ctrlKey: true }],
        ["Ctrl+→", { key: "ArrowRight", ctrlKey: true }],
        ["Cmd+[", { key: "[", metaKey: true }],
        ["Cmd+]", { key: "]", metaKey: true }],
        ["Alt+←", { key: "ArrowLeft", altKey: true }],
        ["Alt+→", { key: "ArrowRight", altKey: true }],
        ["Cmd+D", { key: "d", metaKey: true }],
        ["Ctrl+D", { key: "d", ctrlKey: true }],
        ["Cmd+Shift+D (大文字)", { key: "D", metaKey: true, shiftKey: true }]
    ] as [string, KeyboardEventInit][])("%s は止める", (_label, init) => {
        const event = pressKey(init);

        expect(event.defaultPrevented).toBe(true);
    });
});

describe("BrowserShortcutBlocker 対象外のキー", () => {
    test.each([
        ["Cmd+C", { key: "c", metaKey: true }],
        ["Cmd+R", { key: "r", metaKey: true }],
        ["Cmd+S", { key: "s", metaKey: true }],
        ["修飾なしの →", { key: "ArrowRight" }],
        ["Shift だけの ←", { key: "ArrowLeft", shiftKey: true }],
        ["Ctrl+Alt+←", { key: "ArrowLeft", ctrlKey: true, altKey: true }],
        ["Ctrl+[", { key: "[", ctrlKey: true }],
        ["修飾なしの d", { key: "d" }]
    ] as [string, KeyboardEventInit][])("%s は止めない", (_label, init) => {
        const event = pressKey(init);

        expect(event.defaultPrevented).toBe(false);
    });

    test("IME 変換中は止めない", () => {
        const composing = pressKey({ key: "ArrowLeft", metaKey: true, isComposing: true });
        const imeKeyCode = pressKey({ key: "ArrowLeft", metaKey: true, keyCode: 229 });

        expect(composing.defaultPrevented).toBe(false);
        expect(imeKeyCode.defaultPrevented).toBe(false);
    });

    test("テキスト入力にフォーカスがあると Cmd+← も Cmd+D も止めない", () => {
        render(<input aria-label="name" />);
        screen.getByLabelText("name").focus();

        const arrow = pressKey({ key: "ArrowLeft", metaKey: true });
        const bookmark = pressKey({ key: "d", metaKey: true });

        expect(arrow.defaultPrevented).toBe(false);
        expect(bookmark.defaultPrevented).toBe(false);
    });

    test("ボタンにフォーカスがあるときは止める", () => {
        render(<button type="button">row</button>);
        screen.getByRole("button").focus();

        const arrow = pressKey({ key: "ArrowLeft", metaKey: true });

        expect(arrow.defaultPrevented).toBe(true);
    });
});

describe("BrowserShortcutBlocker.attach", () => {
    test("detach 後は止めない", () => {
        detach();

        const event = pressKey({ key: "ArrowLeft", metaKey: true });

        expect(event.defaultPrevented).toBe(false);
    });

    test("伝播は止めず、後ろの bubble リスナーにも届く", () => {
        const bubbleListener = vi.fn();
        document.addEventListener("keydown", bubbleListener);
        const event = new KeyboardEvent("keydown", { cancelable: true, bubbles: true, key: "d", metaKey: true });
        const stopPropagation = vi.spyOn(event, "stopPropagation");
        const stopImmediatePropagation = vi.spyOn(event, "stopImmediatePropagation");

        document.body.dispatchEvent(event);
        document.removeEventListener("keydown", bubbleListener);

        expect(stopPropagation).not.toHaveBeenCalled();
        expect(stopImmediatePropagation).not.toHaveBeenCalled();
        expect(bubbleListener).toHaveBeenCalledTimes(1);
    });
});
