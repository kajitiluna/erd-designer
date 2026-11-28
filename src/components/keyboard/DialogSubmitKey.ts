import type React from "react";

type SubmitKeyTarget = {
    tagName: string,
    role: string | null,
    inputType: string | null,
    ariaExpanded: string | null,
    isContentEditable: boolean
};

type SubmitKeyEvent = {
    key: string,
    ctrlKey: boolean,
    metaKey: boolean,
    repeat: boolean,
    isComposing: boolean,
    defaultPrevented: boolean,
    /** False when the event came from another dialog or popup rendered through a portal. */
    targetInDialog: boolean,
    target: SubmitKeyTarget
};

type DialogKeyHandler = (event: React.KeyboardEvent<HTMLElement>) => void;

/** Keyboard shortcuts that run a dialog's confirm action. */
export default class DialogSubmitKey {

    private constructor() {
        /* do nothing */
    }

    /**
     * Builds the dialog root's `onKeyDownCapture` handler: Ctrl/Cmd + Enter runs `onSubmitRequest`
     * whichever element inside the dialog has focus, and the focused element never receives the key.
     * Pass the same function the confirm button uses, so its disabled/validation state is respected.
     */
    public static initHandleCtrlEnterCapture(onSubmitRequest: (() => void) | undefined): DialogKeyHandler {
        return initHandleSubmitKey(onSubmitRequest, DialogSubmitKey.shouldSubmitByCtrlEnter);
    }

    /** Decides whether a keydown is a Ctrl/Cmd + Enter that should confirm the dialog. */
    public static shouldSubmitByCtrlEnter(event: SubmitKeyEvent): boolean {
        if ((isEnterInDialog(event) === false) || ((event.ctrlKey || event.metaKey) === false)) {
            return false;
        }

        // 開いたポップアップの Enter は、修飾キーの有無にかかわらず候補の確定である
        return (event.target.ariaExpanded !== "true");
    }

    /**
     * Builds the dialog root's `onKeyDown` handler: a plain Enter runs `onSubmitRequest` when no focused
     * control handles Enter itself (not in a multiline field, not on a button or row, not while a popup is open).
     */
    public static initHandleEnter(onSubmitRequest: (() => void) | undefined): DialogKeyHandler {
        return initHandleSubmitKey(onSubmitRequest, DialogSubmitKey.shouldSubmitByEnter);
    }

    /** Decides whether a keydown is a plain Enter that should confirm the dialog. */
    public static shouldSubmitByEnter(event: SubmitKeyEvent): boolean {
        if ((isEnterInDialog(event) === false) || event.ctrlKey || event.metaKey) {
            return false;
        }

        // Select や Autocomplete などが Enter を処理済みの場合は、その操作を優先する
        if (event.defaultPrevented) {
            return false;
        }

        // 長押しの自動リピートは、ダイアログを開いたキー操作の続きで意図せず確定してしまうのを防ぐ
        if (event.repeat) {
            return false;
        }

        // button など Enter で自身が動作する要素では、確定とクリックの二重実行になる
        if (handlesEnterItself(event.target)) {
            return false;
        }

        // 複数行入力の Enter は改行であり、開いたポップアップの Enter は候補の確定である
        return (event.target.tagName !== "TEXTAREA") && (event.target.ariaExpanded !== "true");
    }
}

const initHandleSubmitKey = (
    onSubmitRequest: (() => void) | undefined, shouldSubmit: (event: SubmitKeyEvent) => boolean
): DialogKeyHandler => {
    return (event: React.KeyboardEvent<HTMLElement>) => {
        if (onSubmitRequest == null) {
            return;
        }

        const submitKeyEvent = toSubmitKeyEvent(event);
        if (shouldSubmit(submitKeyEvent) === false) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        onSubmitRequest();
    };
};

const toSubmitKeyEvent = (event: React.KeyboardEvent<HTMLElement>): SubmitKeyEvent => {
    const target = event.target as HTMLElement;
    const submitKeyTarget: SubmitKeyTarget = {
        tagName: target.tagName,
        role: target.getAttribute("role"),
        inputType: (target instanceof HTMLInputElement) ? target.type : null,
        ariaExpanded: target.getAttribute("aria-expanded"),
        isContentEditable: target.isContentEditable
    };

    return {
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        repeat: event.repeat,
        isComposing: (event.nativeEvent.isComposing) || (event.keyCode === IME_KEY_CODE),
        defaultPrevented: event.defaultPrevented,
        targetInDialog: event.currentTarget.contains(target),
        target: submitKeyTarget
    };
};

const IME_KEY_CODE = 229;

// 入れ子のダイアログはポータル越しに親へイベントが伝播するため、DOM 上で自身の内側かを見る。
// IME の確定 Enter は確定操作ではないので、どちらの判定でも対象外にする。
const isEnterInDialog = (event: SubmitKeyEvent): boolean => {
    return (event.key === "Enter") && event.targetInDialog && (event.isComposing === false);
};

const ENTER_HANDLING_TAGS: ReadonlySet<string> = new Set([
    "BUTTON", "A", "SELECT", "SUMMARY", "TR", "TD", "TH"
]);

const ENTER_HANDLING_ROLES: ReadonlySet<string> = new Set([
    "button", "link", "tab", "menuitem", "option", "row", "gridcell", "treeitem"
]);

const BUTTON_INPUT_TYPES: ReadonlySet<string> = new Set([
    "button", "submit", "reset", "image", "file", "color"
]);

const handlesEnterItself = (target: SubmitKeyTarget): boolean => {
    if (target.isContentEditable || ENTER_HANDLING_TAGS.has(target.tagName)) {
        return true;
    }

    if ((target.role != null) && ENTER_HANDLING_ROLES.has(target.role)) {
        return true;
    }

    return (target.tagName === "INPUT") && (target.inputType != null) && BUTTON_INPUT_TYPES.has(target.inputType);
};
