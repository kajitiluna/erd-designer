const STORAGE_KEY = "erdDesigner.dialogLayouts";

/**
 * Held as ratios relative to the viewport.
 * The relative position of all four edges is preserved even when the window size changes,
 * so a saved layout can be applied as-is to a different screen size.
 */
export type DialogBounds = {
    leftRatio: number,
    topRatio: number,
    widthRatio: number,
    heightRatio: number
};

const loadDialogLayout = (layoutName: string): DialogBounds | null => {
    const layouts = readLayouts();
    const bounds = layouts[layoutName];

    return isDialogBounds(bounds) ? bounds : null;
};

const saveDialogLayout = (layoutName: string, bounds: DialogBounds): void => {
    const layouts = readLayouts();

    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...layouts, [layoutName]: bounds }));
    } catch (exc) {
        console.warn(`Failed to save dialog layout for "${layoutName}"`, exc);
    }
};

const readLayouts = (): Record<string, unknown> => {
    try {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (stored == null) {
            return {};
        }

        const parsed = JSON.parse(stored);
        if (typeof parsed !== "object") {
            return {};
        }

        return parsed as Record<string, unknown>;
    } catch {
        return {};
    }
};

const isDialogBounds = (value: unknown): value is DialogBounds => {
    if ((value == null) || (typeof value !== "object")) {
        return false;
    }

    const candidate = value as Record<string, unknown>;

    return isFiniteNumber(candidate.leftRatio) && isFiniteNumber(candidate.topRatio)
        && isFiniteNumber(candidate.widthRatio) && isFiniteNumber(candidate.heightRatio);
};

const isFiniteNumber = (value: unknown): value is number => {
    return (typeof value === "number") && Number.isFinite(value);
};

const DialogLayoutStore = {
    load: loadDialogLayout, save: saveDialogLayout
} as const;

export default DialogLayoutStore;
