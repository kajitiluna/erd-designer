import { describe, expect, test } from "vitest";

import DialogSubmitKey from "~/components/keyboard/DialogSubmitKey";

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

const ENTER_HANDLING_TARGETS = [
    { tagName: "BUTTON", inputType: null },
    { tagName: "A", inputType: null },
    { tagName: "TR", inputType: null },
    { tagName: "DIV", inputType: null, role: "tab" },
    { tagName: "DIV", inputType: null, role: "button" },
    { tagName: "INPUT", inputType: "submit" },
    { tagName: "DIV", inputType: null, isContentEditable: true }
];

describe("DialogSubmitKey.shouldSubmitByEnter", () => {
    test("通常の入力欄での Enter は確定する", () => {
        expect(DialogSubmitKey.shouldSubmitByEnter(initEvent())).toBe(true);
    });

    test("Enter 以外のキーは確定しない", () => {
        expect(DialogSubmitKey.shouldSubmitByEnter(initEvent({ key: "Escape" }))).toBe(false);
        expect(DialogSubmitKey.shouldSubmitByEnter(initEvent({ key: "a" }))).toBe(false);
    });

    test("Ctrl/Cmd 付きの Enter は扱わない", () => {
        expect(DialogSubmitKey.shouldSubmitByEnter(initEvent({ ctrlKey: true }))).toBe(false);
        expect(DialogSubmitKey.shouldSubmitByEnter(initEvent({ metaKey: true }))).toBe(false);
    });

    test("チェックボックスでの Enter は確定する", () => {
        expect(DialogSubmitKey.shouldSubmitByEnter(initEvent({}, { inputType: "checkbox" }))).toBe(true);
    });

    test("IME 変換中の Enter は確定しない", () => {
        expect(DialogSubmitKey.shouldSubmitByEnter(initEvent({ isComposing: true }))).toBe(false);
    });

    test("複数行入力での Enter は確定しない", () => {
        expect(DialogSubmitKey.shouldSubmitByEnter(initEvent({}, { tagName: "TEXTAREA", inputType: null })))
            .toBe(false);
    });

    test("自身で Enter を処理する要素では確定しない", () => {
        ENTER_HANDLING_TARGETS.forEach(target => {
            expect(DialogSubmitKey.shouldSubmitByEnter(initEvent({}, target))).toBe(false);
        });
    });

    test("ポップアップが開いているコンボボックスの Enter は確定しない", () => {
        const expandedCombobox = { role: "combobox", ariaExpanded: "true" };
        const closedCombobox = { role: "combobox", ariaExpanded: "false" };

        expect(DialogSubmitKey.shouldSubmitByEnter(initEvent({}, expandedCombobox))).toBe(false);
        expect(DialogSubmitKey.shouldSubmitByEnter(initEvent({}, closedCombobox))).toBe(true);
    });

    test("既に処理済み (defaultPrevented) の Enter は確定しない", () => {
        expect(DialogSubmitKey.shouldSubmitByEnter(initEvent({ defaultPrevented: true }))).toBe(false);
    });

    test("ダイアログ外 (ポータル越しの別ダイアログ) のイベントは確定しない", () => {
        expect(DialogSubmitKey.shouldSubmitByEnter(initEvent({ targetInDialog: false }))).toBe(false);
    });

    test("長押しの自動リピートは Enter では確定しない", () => {
        expect(DialogSubmitKey.shouldSubmitByEnter(initEvent({ repeat: true }))).toBe(false);
    });
});

describe("DialogSubmitKey.shouldSubmitByCtrlEnter", () => {
    test("Ctrl/Cmd + Enter は確定し、修飾キーのない Enter は扱わない", () => {
        expect(DialogSubmitKey.shouldSubmitByCtrlEnter(initEvent({ ctrlKey: true }))).toBe(true);
        expect(DialogSubmitKey.shouldSubmitByCtrlEnter(initEvent({ metaKey: true }))).toBe(true);
        expect(DialogSubmitKey.shouldSubmitByCtrlEnter(initEvent())).toBe(false);
    });

    test("複数行入力や自身で Enter を処理する要素でも確定する", () => {
        const targets = [{ tagName: "TEXTAREA", inputType: null }, ...ENTER_HANDLING_TARGETS];

        targets.forEach(target => {
            expect(DialogSubmitKey.shouldSubmitByCtrlEnter(initEvent({ ctrlKey: true }, target))).toBe(true);
        });
    });

    test("IME 変換中は確定しない", () => {
        expect(DialogSubmitKey.shouldSubmitByCtrlEnter(initEvent({ ctrlKey: true, isComposing: true })))
            .toBe(false);
    });

    test("ポップアップが開いているコンボボックスでは確定しない", () => {
        const expandedCombobox = { role: "combobox", ariaExpanded: "true" };

        expect(DialogSubmitKey.shouldSubmitByCtrlEnter(initEvent({ ctrlKey: true }, expandedCombobox)))
            .toBe(false);
    });

    test("ダイアログ外 (ポータル越しの別ダイアログ) のイベントは確定しない", () => {
        expect(DialogSubmitKey.shouldSubmitByCtrlEnter(initEvent({ ctrlKey: true, targetInDialog: false })))
            .toBe(false);
    });
});
