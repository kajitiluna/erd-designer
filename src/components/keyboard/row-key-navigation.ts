import type React from "react";

/** Axis along which the rows are laid out. Its two arrow keys move between rows. */
type RowKeyOrientation = "vertical" | "horizontal";

type RowKeyNavigationOptions = {

    orientation: RowKeyOrientation,

    /** Position of the row that owns the handler. */
    index: number,

    /** Position of the last row; arrow keys never move past `0` and this value. */
    lastIndex: number,

    /** Selects the row at the given position. Called with the clamped neighbour on every arrow key. */
    selectAt: (targetIndex: number) => void,

    /** Space: does what a click on the row does. */
    onSelect?: () => void,

    /** Enter: edits / confirms the row. */
    onActivate?: () => void,

    /** Delete or Backspace: removes the row. */
    onRemove?: () => void,

    /** Ctrl/Cmd + arrow along the row axis: moves the row one place (-1 = toward the first row). */
    onReorder?: (shift: 1 | -1) => void,

    /**
     * Arrow across the row axis toward its start (ArrowLeft for vertical rows, ArrowUp for horizontal rows).
     * Only moves the cursor; it never changes data.
     */
    onCrossPrevious?: () => void,

    /**
     * Arrow across the row axis toward its end (ArrowRight for vertical rows, ArrowDown for horizontal rows).
     * Only moves the cursor; it never changes data.
     */
    onCrossNext?: () => void,

    /** Ctrl/Cmd + arrow across the row axis toward its start: moves the row to the adjacent list on that side. */
    onTransferPrevious?: () => void,

    /** Ctrl/Cmd + arrow across the row axis toward its end: moves the row to the adjacent list on that side. */
    onTransferNext?: () => void,

    /**
     * Moves DOM focus to the row at `targetIndex`. Defaults to the adjacent sibling of `currentRow`,
     * which only fits lists where one row is one element.
     */
    focusRowAt?: (targetIndex: number, currentRow: HTMLElement) => void
};

type RowKeyNavigation = {

    /**
     * Builds the `onKeyDown` handler of one row of a roving-tabindex list (one Tab stop per list).
     * Keys the options do not ask for are left untouched, so preventDefault is called only for handled keys.
     */
    initHandleKeyDown: (options: RowKeyNavigationOptions) => (event: React.KeyboardEvent<HTMLElement>) => void,

    /** Focuses the child at `index` (clamped to the last child). Does nothing when the container has no child. */
    focusChildAt: (container: HTMLElement | null, index: number) => void,

    /** Position to focus after the row at `removedIndex` of a list of `length` rows is removed; -1 when none remain. */
    neighbourIndexAfterRemoval: (length: number, removedIndex: number) => number
};

type ArrowRole = "previous" | "next" | "crossPrevious" | "crossNext";

const initHandleKeyDown = (options: RowKeyNavigationOptions) => {
    return (event: React.KeyboardEvent<HTMLElement>) => {
        if (isOwnKeyInput(event) === false) {
            return;
        }

        const action = decideAction(options, event);
        if (action == null) {
            return;
        }

        event.preventDefault();
        action(event.currentTarget);
    };
};

// 行の中の入力欄・チェックボックスが受けたキーは、その部品自身の操作なので行では扱わない。
// IME 変換中のキーと、Shift / Alt 付きの操作も行の対象外にする。Ctrl/Cmd 付きは状態変更の操作として行で扱う。
const isOwnKeyInput = (event: React.KeyboardEvent<HTMLElement>): boolean => {
    if (event.target !== event.currentTarget) {
        return false;
    }

    if ((event.nativeEvent.isComposing) || (event.keyCode === IME_KEY_CODE)) {
        return false;
    }

    return (event.shiftKey === false) && (event.altKey === false);
};

type RowAction = (currentRow: HTMLElement) => void;

const decideAction = (options: RowKeyNavigationOptions, event: React.KeyboardEvent<HTMLElement>): RowAction | null => {
    const arrowRole = ARROW_ROLES[options.orientation][event.key];

    // Windows/Linux の Ctrl と macOS の Cmd は同列に扱う。macOS の Ctrl+矢印は OS (Mission Control) が先に処理するため届かない。
    if (event.ctrlKey || event.metaKey) {
        return decideCommandAction(options, arrowRole);
    }

    if ((arrowRole === "previous") || (arrowRole === "next")) {
        return initMoveAction(options, arrowRole);
    }

    if (arrowRole === "crossPrevious") {
        return (options.onCrossPrevious ?? null);
    }

    if (arrowRole === "crossNext") {
        return (options.onCrossNext ?? null);
    }

    if (event.key === "Enter") {
        return (options.onActivate ?? null);
    }

    if (event.key === " ") {
        return (options.onSelect ?? null);
    }

    if ((event.key === "Delete") || (event.key === "Backspace")) {
        return (options.onRemove ?? null);
    }

    return null;
};

// Ctrl/Cmd 付きの矢印だけがデータを変える。Ctrl/Cmd + Enter などはダイアログ確定 (DraggableDialog/submit-key.ts) に譲る。
const decideCommandAction = (options: RowKeyNavigationOptions, arrowRole: ArrowRole | undefined): RowAction | null => {
    const onReorder = options.onReorder;

    if ((arrowRole === "previous") && (onReorder != null)) {
        return () => onReorder(-1);
    }

    if ((arrowRole === "next") && (onReorder != null)) {
        return () => onReorder(1);
    }

    if (arrowRole === "crossPrevious") {
        return (options.onTransferPrevious ?? null);
    }

    if (arrowRole === "crossNext") {
        return (options.onTransferNext ?? null);
    }

    return null;
};

const initMoveAction = (options: RowKeyNavigationOptions, arrowRole: "previous" | "next"): RowAction => {
    return (currentRow: HTMLElement) => {
        const shift = (arrowRole === "next") ? 1 : -1;
        const targetIndex = Math.min(Math.max(options.index + shift, 0), options.lastIndex);

        options.selectAt(targetIndex);
        if (targetIndex !== options.index) {
            focusRow(options, shift, targetIndex, currentRow);
        }
    };
};

// フォーカス移動は ref を経由せず、イベントが運んでくる現在行 (currentTarget) から DOM 上の隣接要素を辿る。
const focusRow = (options: RowKeyNavigationOptions, shift: 1 | -1, targetIndex: number, currentRow: HTMLElement) => {
    if (options.focusRowAt != null) {
        options.focusRowAt(targetIndex, currentRow);
        return;
    }

    const siblingRow = (shift === 1) ? currentRow.nextElementSibling : currentRow.previousElementSibling;
    (siblingRow as HTMLElement | null)?.focus();
};

const focusChildAt = (container: HTMLElement | null, index: number) => {
    if ((container == null) || (container.children.length === 0)) {
        return;
    }

    const targetIndex = Math.min(Math.max(index, 0), container.children.length - 1);
    (container.children[targetIndex] as HTMLElement).focus();
};

const neighbourIndexAfterRemoval = (length: number, removedIndex: number): number => {
    return Math.min(removedIndex, length - 2);
};

const IME_KEY_CODE = 229;

const ARROW_ROLES: Record<RowKeyOrientation, Partial<Record<string, ArrowRole>>> = {
    vertical: {
        ArrowUp: "previous", ArrowDown: "next", ArrowLeft: "crossPrevious", ArrowRight: "crossNext"
    },
    horizontal: {
        ArrowLeft: "previous", ArrowRight: "next", ArrowUp: "crossPrevious", ArrowDown: "crossNext"
    }
} as const;

export const rowKeyNavigation: RowKeyNavigation = {
    initHandleKeyDown: initHandleKeyDown,
    focusChildAt: focusChildAt,
    neighbourIndexAfterRemoval: neighbourIndexAfterRemoval
} as const;
