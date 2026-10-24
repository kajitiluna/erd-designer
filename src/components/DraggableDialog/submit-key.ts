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

type DialogSubmitKey = {
    /** Decides whether a keydown inside a dialog should run the dialog's submit action. */
    shouldSubmit: (event: SubmitKeyEvent) => boolean,
    /** Extracts the plain values `shouldSubmit` needs from a React keyboard event whose currentTarget is the dialog root. */
    toSubmitKeyEvent: (event: React.KeyboardEvent<HTMLElement>) => SubmitKeyEvent
};

const shouldSubmit = (event: SubmitKeyEvent): boolean => {
    if ((event.key !== "Enter") || (event.targetInDialog === false)) {
        return false;
    }

    // IME の確定 Enter は、キーコード 229 でも通知されるため両方を見る
    if (event.isComposing) {
        return false;
    }

    // button など Enter で自身が動作する要素では、確定とクリックの二重実行になる
    if (handlesEnterItself(event.target)) {
        return false;
    }

    // Select や Autocomplete などが Enter を処理済みの場合は、その操作を優先する
    if (event.defaultPrevented) {
        return false;
    }

    if (event.ctrlKey || event.metaKey) {
        return true;
    }

    // 長押しの自動リピートは、ダイアログを開いたキー操作の続きで意図せず確定してしまうのを防ぐ
    if (event.repeat) {
        return false;
    }

    // 複数行入力の Enter は改行であり、開いたポップアップの Enter は候補の確定である
    if ((event.target.tagName === "TEXTAREA") || (event.target.ariaExpanded === "true")) {
        return false;
    }

    return true;
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
        isComposing: (event.nativeEvent.isComposing) || (event.keyCode === 229),
        defaultPrevented: event.defaultPrevented,
        targetInDialog: event.currentTarget.contains(target),
        target: submitKeyTarget
    };
};

export const dialogSubmitKey: DialogSubmitKey = {
    shouldSubmit: shouldSubmit,
    toSubmitKeyEvent: toSubmitKeyEvent
} as const;
