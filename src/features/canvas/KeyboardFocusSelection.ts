import { SelectAction } from "~/context/SelectEntityContext";
import EditMode, { EditModeType } from "~/models/EditMode";
import SelectState from "~/models/SelectState";

type FindSelectActionArgs = {
    tableId: string,
    editMode: EditMode,
    selectState: SelectState
};

/**
 * Decides whether keyboard focus on a table should select it, and what the selection becomes.
 * Only keyboard-initiated focus selects; pointer focus stays with the mouse handlers.
 */
export default class KeyboardFocusSelection {

    private constructor() {
        // do nothing
    }

    /**
     * Tells whether the element received focus from the keyboard (Tab / Shift+Tab) rather than from a pointer.
     * Pointer-initiated focus must never select anything: the mouse handlers own that selection
     * (multi-select keys, drag-move, selection rectangle).
     */
    public static isKeyboardFocus(element: Element): boolean {
        try {
            return element.matches(":focus-visible");
        } catch {
            // :focus-visible を解釈できない環境ではポインタ操作とみなす。マウス操作の選択を奪うよりも安全側に倒す。
            return false;
        }
    }

    /**
     * Decides what keyboard focus on a table should select.
     * 
     * Returns `null` when nothing has to change: outside SELECT mode,
     * or when the table is already the only selected item.
     */
    public static findSelectAction(args: FindSelectActionArgs): SelectAction | null {
        if (args.editMode !== EditModeType.SELECT) {
            return null;
        }

        if (isOnlySelected(args.selectState, args.tableId)) {
            return null;
        }

        // "table" アクションは選択済みを再度送ると解除 (トグル) になるため、結果が冪等な "bulk" で単一選択にする
        return { type: "bulk", tableIds: [args.tableId], memoIds: [], withMultiSelection: false };
    }
}

const isOnlySelected = (selectState: SelectState, tableId: string): boolean => {
    return selectState.tableIds.has(tableId)
        && (selectState.tableIds.size === 1)
        && (selectState.memoIds.size === 0)
        && (selectState.relationId == null);
};
