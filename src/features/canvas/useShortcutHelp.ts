import React from "react";

import { isModalOpen, isTextInputFocused } from "~/components/support";

type ShortcutHelpKeyEvent = {
    key: string, ctrlKey: boolean, altKey: boolean, metaKey: boolean,
    repeat: boolean, isComposing: boolean
};

/**
 * Holds the open state of the shortcut help panel and toggles it with the "/" key.
 */
const useShortcutHelp = () => {
    const [helpOpen, setHelpOpen] = React.useState(false);

    const toggleHelp = React.useCallback(() => { setHelpOpen(current => current === false); }, []);
    const closeHelp = React.useCallback(() => { setHelpOpen(false); }, []);

    React.useEffect(() => {
        const handleKeyDown = initKeyDownHandler(toggleHelp, closeHelp);

        // CanvasSearchPanel は document のキャプチャ段階で Esc を stopImmediatePropagation する。
        // window のキャプチャ段階はそれより先に呼ばれるため、検索中の Esc でもヘルプを閉じられる。
        window.addEventListener("keydown", handleKeyDown, true);
        return () => window.removeEventListener("keydown", handleKeyDown, true);
    }, [toggleHelp, closeHelp]);

    return { helpOpen, toggleHelp, closeHelp };
};

const initKeyDownHandler = (toggleHelp: () => void, closeHelp: () => void) => {
    return (event: KeyboardEvent) => {
        const action = findShortcutHelpAction(event);
        if (action == null) {
            return;
        }

        if (isModalOpen()) {
            return;
        }

        if (action === "close") {
            // 検索欄にフォーカスがあっても Esc で検索と同時に閉じられるよう、テキスト入力中でも受け付ける。
            // 検索を閉じる・Select モードへ戻すといった既存の Esc 操作を妨げないよう、伝播は止めない
            closeHelp();
            return;
        }

        // "/" は文字として入力されるため、テキスト入力中は切り替えない
        if (isTextInputFocused()) {
            return;
        }

        // Firefox のクイック検索が "/" で開かないようにする
        event.preventDefault();
        toggleHelp();
    };
};

/**
 * Returns what the key press asks of the help panel, or `null` when it is not a help shortcut.
 * "/" toggles the panel unless a modifier is held, it is an auto-repeat or an IME composition.
 * Escape always closes the panel.
 */
const findShortcutHelpAction = (event: ShortcutHelpKeyEvent): "toggle" | "close" | null => {
    if (event.key === "Escape") {
        return "close";
    }

    if (event.key !== "/") {
        return null;
    }

    if (hasModifier(event) || event.repeat || event.isComposing) {
        return null;
    }

    return "toggle";
};

// Shift は含めない。"/" の入力に Shift が必要なキー配列(ドイツ語配列の Shift+7 など)があるため。
const hasModifier = (event: ShortcutHelpKeyEvent): boolean => {
    return event.ctrlKey || event.metaKey || event.altKey;
};

export default useShortcutHelp;
