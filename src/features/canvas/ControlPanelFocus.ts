type TabKeyEvent = {
    key: string, shiftKey: boolean, ctrlKey: boolean, altKey: boolean, metaKey: boolean, target: EventTarget | null
};

type TabDirection = "forward" | "backward";

/**
 * Decides how Tab / Shift+Tab moves focus between a table and its control panel.
 * The panel is portalled after every table, so the browser's DOM-order Tab never reaches it from the selected table.
 */
export default class ControlPanelFocus {

    private constructor() {
        // do nothing
    }

    /**
     * Returns the element to focus when Tab is pressed on a table whose control panel is shown,
     * or `null` when the browser's default Tab order should apply.
     */
    public static findEntry(event: TabKeyEvent, panelElement: HTMLElement | null): HTMLElement | null {
        if ((panelElement == null) || (toTabDirection(event) !== "forward")) {
            return null;
        }

        const focusableElements = findFocusableElements(panelElement);
        return focusableElements[0] ?? null;
    }

    /**
     * Tells whether Tab / Shift+Tab leaves the control panel past its last / first focusable element.
     * Returns `null` while focus stays inside the panel, so the browser moves it as usual.
     */
    public static findExit(event: TabKeyEvent, panelElement: HTMLElement | null): TabDirection | null {
        const direction = toTabDirection(event);
        if ((panelElement == null) || (direction == null)) {
            return null;
        }

        const focusableElements = findFocusableElements(panelElement);
        const lastElement = focusableElements[focusableElements.length - 1];
        const edgeElement = (direction === "forward") ? lastElement : focusableElements[0];
        if ((edgeElement == null) || (event.target !== edgeElement)) {
            return null;
        }

        return direction;
    }

    /** Returns the tab stop that follows `current` in document order among `candidates`, or `null` at the end. */
    public static findNextTabStop(current: Element, candidates: readonly HTMLElement[]): HTMLElement | null {
        const tabStops = candidates.filter(candidate => candidate.tabIndex === 0);
        const currentIndex = tabStops.findIndex(tabStop => tabStop === current);
        if (currentIndex < 0) {
            return null;
        }

        return tabStops[currentIndex + 1] ?? null;
    }
}

// 修飾キー付きの Tab はブラウザや OS の操作 (タブ切り替えなど) なので対象外にする
const toTabDirection = (event: TabKeyEvent): TabDirection | null => {
    if ((event.key !== "Tab") || event.ctrlKey || event.altKey || event.metaKey) {
        return null;
    }

    return event.shiftKey ? "backward" : "forward";
};

const findFocusableElements = (panelElement: HTMLElement): HTMLElement[] => {
    return Array.from(panelElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
};

const FOCUSABLE_SELECTOR = "button:not([disabled]), [tabindex=\"0\"]";
