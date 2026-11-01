import { isTextInputFocused } from "~/components/support";

/**
 * Stops the browser's own handling of a fixed set of keyboard shortcuts (history navigation and bookmarking)
 * while the canvas is shown, so that a stray key press never leaves the page.
 * Reserved shortcuts (Cmd+T/N/W ...) cannot be stopped from a page and are out of scope.
 */
export default class BrowserShortcutBlocker {

    private constructor() {
        /* do nothing */
    }

    /**
     * Starts calling preventDefault on the keydown events that trigger those shortcuts.
     * Text inputs and IME composition are left untouched.
     *
     * @param target the document whose keydown events are handled
     * @returns the function that stops handling
     */
    public static attach(target: Document): () => void {
        // キャプチャ段階で受けるのは、行やダイアログが先に stopPropagation しても確実に既定動作を止めるため。
        target.addEventListener("keydown", handleKeyDown, true);

        return () => {
            target.removeEventListener("keydown", handleKeyDown, true);
        };
    }
}

// preventDefault だけを呼び、伝播は止めない。
// キャンバスの複製 (Cmd+D、event-handlers.ts) や行の Ctrl/Cmd+矢印の処理を妨げないため。
const handleKeyDown = (event: KeyboardEvent) => {
    if (shouldBlock(event)) {
        event.preventDefault();
    }
};

// Cmd+T/N/W などブラウザが予約しているキーはページ側から止められないため、対象にしない。
// テキスト入力中は Mac の Cmd+← が行頭へのカーソル移動を兼ねるため、何も止めない。
const shouldBlock = (event: KeyboardEvent): boolean => {
    if (isComposingKey(event)) {
        return false;
    }

    if (isTextInputFocused()) {
        return false;
    }

    return isCommandHistoryArrow(event)
        || isCommandHistoryBracket(event)
        || isAltHistoryArrow(event)
        || isBookmarkKey(event);
};

const isComposingKey = (event: KeyboardEvent): boolean => {
    return (event.isComposing) || (event.keyCode === IME_KEY_CODE);
};

// Mac の戻る・進む (Cmd+←/→)。Ctrl は Windows/Linux 側で同じ位置を占めるため同列に扱う。
const isCommandHistoryArrow = (event: KeyboardEvent): boolean => {
    const hasCommandModifier = event.ctrlKey || event.metaKey;

    return hasCommandModifier && (event.altKey === false) && HISTORY_ARROW_KEYS.includes(event.key);
};

// Mac の戻る・進む (Cmd+[ / Cmd+])
const isCommandHistoryBracket = (event: KeyboardEvent): boolean => {
    return event.metaKey && HISTORY_BRACKET_KEYS.includes(event.key);
};

// Windows/Linux の戻る・進む (Alt+←/→)
const isAltHistoryArrow = (event: KeyboardEvent): boolean => {
    const hasCommandModifier = event.ctrlKey || event.metaKey;

    return event.altKey && (hasCommandModifier === false) && HISTORY_ARROW_KEYS.includes(event.key);
};

// ブックマーク追加 (Cmd/Ctrl+D)。Caps Lock や Shift で大文字になる場合も同じ操作として扱う。
const isBookmarkKey = (event: KeyboardEvent): boolean => {
    const hasCommandModifier = event.ctrlKey || event.metaKey;

    return hasCommandModifier && (event.key.toLowerCase() === "d");
};

const IME_KEY_CODE = 229;

const HISTORY_ARROW_KEYS: readonly string[] = ["ArrowLeft", "ArrowRight"];

const HISTORY_BRACKET_KEYS: readonly string[] = ["[", "]"];
