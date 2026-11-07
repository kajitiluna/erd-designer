/** Display form of the control panel. */
export type PanelLayoutType = "normal" | "compact";

/** Owns the values of `PanelLayoutType` and restores them from their serialized form. */
export default class PanelLayout {

    private constructor() {
        /* do nothing */
    }

    /** Layout used while the user has not chosen one (and for unreadable stored values). */
    public static initial(): PanelLayoutType {
        return "normal";
    }

    /** Restores a layout from an untrusted serialized value. Unknown values become `initial()`. */
    public static toObject(value: unknown): PanelLayoutType {
        if ((value === "normal") || (value === "compact")) {
            return value;
        }

        return PanelLayout.initial();
    }
}
