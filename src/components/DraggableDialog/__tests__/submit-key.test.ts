import { describe, expect, test } from "vitest";

import { dialogSubmitKey } from "~/components/DraggableDialog/submit-key";

const inputTarget = {
    tagName: "INPUT", role: null, inputType: "text", ariaExpanded: null, isContentEditable: false
};

const initEvent = (override: Record<string, unknown> = {}, targetOverride: Record<string, unknown> = {}) => {
    return {
        key: "Enter", ctrlKey: false, metaKey: false, repeat: false, isComposing: false,
        defaultPrevented: false, targetInDialog: true,
        ...override,
        target: { ...inputTarget, ...targetOverride }
    };
};

describe("dialogSubmitKey.shouldSubmit", () => {
    test("通常の入力欄での Enter は確定する", () => {
        expect(dialogSubmitKey.shouldSubmit(initEvent())).toBe(true);
    });

    test("Enter 以外のキーは確定しない", () => {
        expect(dialogSubmitKey.shouldSubmit(initEvent({ key: "Escape" }))).toBe(false);
        expect(dialogSubmitKey.shouldSubmit(initEvent({ key: "a" }))).toBe(false);
    });

    test("チェックボックスでの Enter は確定する", () => {
        expect(dialogSubmitKey.shouldSubmit(initEvent({}, { inputType: "checkbox" }))).toBe(true);
    });

    test("IME 変換中の Enter は確定しない", () => {
        expect(dialogSubmitKey.shouldSubmit(initEvent({ isComposing: true }))).toBe(false);
        expect(dialogSubmitKey.shouldSubmit(initEvent({ isComposing: true, ctrlKey: true }))).toBe(false);
    });

    test("複数行入力での Enter は確定せず、Ctrl/Cmd + Enter は確定する", () => {
        const textarea = { tagName: "TEXTAREA", inputType: null };

        expect(dialogSubmitKey.shouldSubmit(initEvent({}, textarea))).toBe(false);
        expect(dialogSubmitKey.shouldSubmit(initEvent({ ctrlKey: true }, textarea))).toBe(true);
        expect(dialogSubmitKey.shouldSubmit(initEvent({ metaKey: true }, textarea))).toBe(true);
    });

    test("自身で Enter を処理する要素では確定しない", () => {
        const handlers = [
            { tagName: "BUTTON", inputType: null },
            { tagName: "A", inputType: null },
            { tagName: "TR", inputType: null },
            { tagName: "DIV", inputType: null, role: "tab" },
            { tagName: "DIV", inputType: null, role: "button" },
            { tagName: "INPUT", inputType: "submit" },
            { tagName: "DIV", inputType: null, isContentEditable: true }
        ];

        handlers.forEach(target => {
            expect(dialogSubmitKey.shouldSubmit(initEvent({}, target))).toBe(false);
            expect(dialogSubmitKey.shouldSubmit(initEvent({ ctrlKey: true }, target))).toBe(false);
        });
    });

    test("ポップアップが開いているコンボボックスの Enter は確定しない", () => {
        const expandedCombobox = { role: "combobox", ariaExpanded: "true" };
        const closedCombobox = { role: "combobox", ariaExpanded: "false" };

        expect(dialogSubmitKey.shouldSubmit(initEvent({}, expandedCombobox))).toBe(false);
        expect(dialogSubmitKey.shouldSubmit(initEvent({}, closedCombobox))).toBe(true);
    });

    test("既に処理済み (defaultPrevented) の Enter は確定しない", () => {
        expect(dialogSubmitKey.shouldSubmit(initEvent({ defaultPrevented: true }))).toBe(false);
        expect(dialogSubmitKey.shouldSubmit(initEvent({ defaultPrevented: true, ctrlKey: true }))).toBe(false);
    });

    test("ダイアログ外 (ポータル越しの別ダイアログ) のイベントは確定しない", () => {
        expect(dialogSubmitKey.shouldSubmit(initEvent({ targetInDialog: false }))).toBe(false);
        expect(dialogSubmitKey.shouldSubmit(initEvent({ targetInDialog: false, ctrlKey: true }))).toBe(false);
    });

    test("長押しの自動リピートは Enter では確定しない", () => {
        expect(dialogSubmitKey.shouldSubmit(initEvent({ repeat: true }))).toBe(false);
    });
});
