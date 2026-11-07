import { describe, expect, test } from "vitest";

import { EditModeType } from "~/models/EditMode";
import EditModeShortcut from "~/features/canvas/EditModeShortcut";

type KeyOptions = {
    ctrlKey?: boolean, altKey?: boolean, metaKey?: boolean, shiftKey?: boolean,
    repeat?: boolean, isComposing?: boolean
};

const keyEvent = (key: string, options: KeyOptions = {}) => {
    return {
        key,
        ctrlKey: options.ctrlKey ?? false,
        altKey: options.altKey ?? false,
        metaKey: options.metaKey ?? false,
        shiftKey: options.shiftKey ?? false,
        repeat: options.repeat ?? false,
        isComposing: options.isComposing ?? false
    };
};

describe("EditModeShortcut.findEditMode", () => {

    test.each([
        ["Escape", EditModeType.SELECT],
        ["g", EditModeType.GRAB],
        ["t", EditModeType.CREATE_TABLE],
        ["r", EditModeType.CREATE_RELATION],
        ["m", EditModeType.CREATE_MEMO],
    ])("maps %s to its edit mode", (key, expected) => {
        expect(EditModeShortcut.findEditMode(keyEvent(key))).toBe(expected);
    });

    test("treats an upper-case key (Caps Lock without Shift) as the same shortcut", () => {
        expect(EditModeShortcut.findEditMode(keyEvent("T"))).toBe(EditModeType.CREATE_TABLE);
    });

    test.each([
        ["ctrl", { ctrlKey: true }],
        ["meta", { metaKey: true }],
        ["alt", { altKey: true }],
        ["shift", { shiftKey: true }],
    ])("returns null when %s is held", (_name, options) => {
        expect(EditModeShortcut.findEditMode(keyEvent("t", options))).toBeNull();
    });

    test("returns null for an auto-repeat press", () => {
        expect(EditModeShortcut.findEditMode(keyEvent("t", { repeat: true }))).toBeNull();
    });

    test("returns null during IME composition", () => {
        expect(EditModeShortcut.findEditMode(keyEvent("t", { isComposing: true }))).toBeNull();
    });

    test.each(["a", "Delete"])("returns null for the unrelated key %s", (key) => {
        expect(EditModeShortcut.findEditMode(keyEvent(key))).toBeNull();
    });
});
