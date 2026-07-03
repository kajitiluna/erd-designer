import React from "react";

import { ErdDocumentsHolder } from "~/context/ErdDocumentsHolderContext";
import { RELEASE_ACTION, SelectAction } from "~/context/SelectEntityContext";
import EditMode, { EditModeType } from "~/models/EditMode";
import { SelectState } from "~/models/SelectState";
import { inOpenControlPanel } from "~/components/support";

/**
 * ErdCanvas 内部専用モジュール。外部からの import は禁止 (ESLint no-restricted-imports で検査)。
 *
 * Canvas 上のキーボードショートカットとマウスカーソル制御。
 * ErdCanvas の effect から利用する。
 */

export const initEffectOfMouseCursorOnCanvas = (editMode: EditMode, erdCanvas: HTMLDivElement) => {
    // Grab モードの場合は、別のコンポーネントでマウスカーソルを制御しているので、ここでは何もしない
    if (editMode === EditModeType.GRAB) {
        return;
    }

    const handleMouseIcon = () => {
        erdCanvas.style.cursor = findMouseCursorIcon(editMode);
    };

    erdCanvas.addEventListener("mousemove", handleMouseIcon);

    return () => {
        erdCanvas.removeEventListener("mousemove", handleMouseIcon);
    };
};

const findMouseCursorIcon = (editMode: EditMode) => {
    if (((editMode === EditModeType.CREATE_TABLE) || (editMode === EditModeType.CREATE_MEMO))) {
        return "copy";
    }

    if (editMode === EditModeType.CREATE_RELATION) {
        return "crosshair";
    }

    return "default";
};

type KeyEventHandler = {

    isMatching: (event: KeyboardEvent) => boolean,

    /**
     * Handles the keyboard event.
     *
     * @returns {boolean}
     *      Return `true` to prevent event propagation (e.g., calling `event.preventDefault()` and `event.stopPropagation()`).
     *      Return `false` to allow the event to propagate further.
     */
    handle: () => boolean
};

export const initEffectOfKeyDownOnCanvas = (handlers: KeyEventHandler[]) => {

    const handleKeyUpOnCanvas = (event: KeyboardEvent) => {

        // ダイアログが表示されているときはキー操作を無視する
        const inOpenControlPane = inOpenControlPanel();
        if (inOpenControlPane) {
            return;
        }

        for (const handler of handlers) {
            if (handler.isMatching(event) === false) {
                continue;
            }

            const shouldPreventDefault = handler.handle();
            if (shouldPreventDefault === false) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            return;
        }
    };

    window.document.addEventListener("keydown", handleKeyUpOnCanvas, true);

    return () => {
        window.document.removeEventListener("keydown", handleKeyUpOnCanvas, true);
    };
};

export const initSelectModeHandler = (
    dispatchEditMode: (action: EditMode) => void, erdCanvasRef: React.RefObject<HTMLDivElement | null>
): KeyEventHandler => {
    return {
        isMatching: (event: KeyboardEvent) => (event.key === "Escape"),
        handle: () => {
            dispatchEditMode(EditModeType.SELECT);

            if (erdCanvasRef.current) {
                erdCanvasRef.current.style.cursor = "default";
            }

            return true; // イベントの伝播を止める
        }
    };
};

export const initRedoHandler = (documentsHolder: ErdDocumentsHolder): KeyEventHandler => {
    return {
        isMatching: (event: KeyboardEvent) => (event.metaKey || event.ctrlKey)
            && ((event.key === "y") || ((event.key === "z") && event.shiftKey)),
        handle: () => {
            documentsHolder.redo();
            return true; // イベントの伝播を止める
        }
    };
};

export const initUndoHandler = (documentsHolder: ErdDocumentsHolder): KeyEventHandler => {
    return {
        isMatching: (event: KeyboardEvent) => (event.metaKey || event.ctrlKey)
            && (event.key === "z"),
        handle: () => {
            documentsHolder.undo();
            return true; // イベントの伝播を止める
        }
    };
};

export const initDeleteHandler = (
    documentsHolder: ErdDocumentsHolder, selectState: SelectState,
    dispatchSelectAction: (action: SelectAction) => void
): KeyEventHandler => {
    return {
        isMatching: (event: KeyboardEvent) => (event.key === "Delete") || (event.key === "Backspace"),
        handle: () => {
            if (selectState.status === "none") {
                return false; // イベントの伝播を止めない
            }

            const deleteIds = {
                tableIds: selectState.tableIds,
                memoIds: selectState.memoIds,
                relationId: selectState.relationId ?? null
            };

            documentsHolder.delete(deleteIds);
            dispatchSelectAction(RELEASE_ACTION);

            return true; // イベントの伝播を止める
        }
    };
};
