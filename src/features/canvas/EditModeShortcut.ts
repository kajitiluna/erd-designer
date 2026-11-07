import EditMode, { EditModeType } from "~/models/EditMode";

type ShortcutKeyEvent = {
    key: string, ctrlKey: boolean, altKey: boolean, metaKey: boolean, shiftKey: boolean,
    repeat: boolean, isComposing: boolean
};

/**
 * Maps the keys that switch the canvas edit mode.
 */
export default class EditModeShortcut {

    private constructor() {
        // do nothing
    }

    /**
     * Returns the edit mode the key press switches to, or `null` when it is not a mode shortcut.
     * A press with any modifier, an auto-repeat or an IME composition is never a shortcut.
     */
    public static findEditMode(event: ShortcutKeyEvent): EditMode | null {
        if (hasModifier(event) || event.repeat || event.isComposing) {
            return null;
        }

        // Caps Lock 中は event.key が大文字になるため、小文字に揃えて同じ操作として扱う
        const key = event.key.toLowerCase();
        return SHORTCUT_MAPPING.get(key) ?? null;
    }
}

// Ctrl/Cmd/Alt 付きはブラウザ・OS・VSCode のショートカットに譲る。Shift 付きは将来の別操作のために空けておく。
const hasModifier = (event: ShortcutKeyEvent): boolean => {
    return event.ctrlKey || event.metaKey || event.altKey || event.shiftKey;
};

// key は KeyboardEvent.key を小文字にした値
const SHORTCUT_MAPPING = new Map<string, EditMode>([
    ["escape", EditModeType.SELECT],
    ["g", EditModeType.GRAB],
    ["t", EditModeType.CREATE_TABLE],
    ["r", EditModeType.CREATE_RELATION],
    ["m", EditModeType.CREATE_MEMO],
]);
