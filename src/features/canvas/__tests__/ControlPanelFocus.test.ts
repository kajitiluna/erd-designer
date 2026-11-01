import { describe, expect, test } from "vitest";

import ControlPanelFocus from "~/features/canvas/ControlPanelFocus";

type KeyOptions = { shiftKey?: boolean, ctrlKey?: boolean, altKey?: boolean, metaKey?: boolean, key?: string };

const buildPanel = (): { panel: HTMLElement, buttons: HTMLElement[] } => {
    const panel = document.createElement("div");
    const buttons = ["color", "edit", "delete"].map(name => {
        const button = document.createElement("button");
        button.dataset.name = name;
        panel.appendChild(button);
        return button;
    });

    return { panel, buttons };
};

const tabEvent = (target: EventTarget | null, options: KeyOptions = {}) => {
    return {
        key: options.key ?? "Tab",
        shiftKey: options.shiftKey ?? false,
        ctrlKey: options.ctrlKey ?? false,
        altKey: options.altKey ?? false,
        metaKey: options.metaKey ?? false,
        target
    };
};

describe("ControlPanelFocus.findEntry", () => {
    test("Tab ではパネルの先頭の要素を返す", () => {
        const { panel, buttons } = buildPanel();

        expect(ControlPanelFocus.findEntry(tabEvent(null), panel)).toBe(buttons[0]);
    });

    test("無効化されたボタンは飛ばして先頭の操作可能な要素を返す", () => {
        const { panel, buttons } = buildPanel();
        (buttons[0] as HTMLButtonElement).disabled = true;

        expect(ControlPanelFocus.findEntry(tabEvent(null), panel)).toBe(buttons[1]);
    });

    test("Shift+Tab では null を返す", () => {
        const { panel } = buildPanel();

        expect(ControlPanelFocus.findEntry(tabEvent(null, { shiftKey: true }), panel)).toBeNull();
    });

    test("修飾キー付きの Tab では null を返す", () => {
        const { panel } = buildPanel();

        expect(ControlPanelFocus.findEntry(tabEvent(null, { ctrlKey: true }), panel)).toBeNull();
        expect(ControlPanelFocus.findEntry(tabEvent(null, { altKey: true }), panel)).toBeNull();
        expect(ControlPanelFocus.findEntry(tabEvent(null, { metaKey: true }), panel)).toBeNull();
    });

    test("Tab 以外のキーでは null を返す", () => {
        const { panel } = buildPanel();

        expect(ControlPanelFocus.findEntry(tabEvent(null, { key: "Enter" }), panel)).toBeNull();
    });

    test("パネルが無いときは null を返す", () => {
        expect(ControlPanelFocus.findEntry(tabEvent(null), null)).toBeNull();
    });

    test("パネルに操作可能な要素が無いときは null を返す", () => {
        expect(ControlPanelFocus.findEntry(tabEvent(null), document.createElement("div"))).toBeNull();
    });
});

describe("ControlPanelFocus.findExit", () => {
    test("末尾の要素での Tab は forward を返す", () => {
        const { panel, buttons } = buildPanel();

        expect(ControlPanelFocus.findExit(tabEvent(buttons[2]), panel)).toBe("forward");
    });

    test("先頭の要素での Shift+Tab は backward を返す", () => {
        const { panel, buttons } = buildPanel();

        expect(ControlPanelFocus.findExit(tabEvent(buttons[0], { shiftKey: true }), panel)).toBe("backward");
    });

    test("パネルの途中の要素では null を返す", () => {
        const { panel, buttons } = buildPanel();

        expect(ControlPanelFocus.findExit(tabEvent(buttons[1]), panel)).toBeNull();
        expect(ControlPanelFocus.findExit(tabEvent(buttons[1], { shiftKey: true }), panel)).toBeNull();
    });

    test("末尾での Shift+Tab、先頭での Tab は null を返す", () => {
        const { panel, buttons } = buildPanel();

        expect(ControlPanelFocus.findExit(tabEvent(buttons[2], { shiftKey: true }), panel)).toBeNull();
        expect(ControlPanelFocus.findExit(tabEvent(buttons[0]), panel)).toBeNull();
    });

    test("パネル外の要素 (Popover など) からのイベントでは null を返す", () => {
        const { panel } = buildPanel();
        const outsideButton = document.createElement("button");

        expect(ControlPanelFocus.findExit(tabEvent(outsideButton), panel)).toBeNull();
    });

    test("修飾キー付きの Tab、Tab 以外のキー、パネルが無いときは null を返す", () => {
        const { panel, buttons } = buildPanel();

        expect(ControlPanelFocus.findExit(tabEvent(buttons[2], { ctrlKey: true }), panel)).toBeNull();
        expect(ControlPanelFocus.findExit(tabEvent(buttons[2], { key: "Enter" }), panel)).toBeNull();
        expect(ControlPanelFocus.findExit(tabEvent(buttons[2]), null)).toBeNull();
    });
});

describe("ControlPanelFocus.findNextTabStop", () => {
    const buildTables = (tabIndexes: number[]): HTMLElement[] => {
        return tabIndexes.map(tabIndex => {
            const table = document.createElement("div");
            table.tabIndex = tabIndex;
            return table;
        });
    };

    test("文書順で次の Tab 対象を返す", () => {
        const tables = buildTables([0, 0, 0]);

        expect(ControlPanelFocus.findNextTabStop(tables[0], tables)).toBe(tables[1]);
    });

    test("tabIndex が -1 の候補は飛ばす", () => {
        const tables = buildTables([0, -1, 0]);

        expect(ControlPanelFocus.findNextTabStop(tables[0], tables)).toBe(tables[2]);
    });

    test("末尾のテーブルでは null を返す", () => {
        const tables = buildTables([0, 0]);

        expect(ControlPanelFocus.findNextTabStop(tables[1], tables)).toBeNull();
    });

    test("後続がすべて tabIndex -1 のときは null を返す", () => {
        const tables = buildTables([0, -1]);

        expect(ControlPanelFocus.findNextTabStop(tables[0], tables)).toBeNull();
    });

    test("現在の要素が候補に無いときは null を返す", () => {
        const tables = buildTables([0, 0]);

        expect(ControlPanelFocus.findNextTabStop(document.createElement("div"), tables)).toBeNull();
    });
});
