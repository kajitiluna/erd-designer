import { describe, expect, test, vi } from "vitest";

import KeyboardFocusSelection from "~/features/canvas/KeyboardFocusSelection";
import { EditModeType } from "~/models/EditMode";
import SelectState from "~/models/SelectState";

describe("KeyboardFocusSelection.isKeyboardFocus", () => {
    test("要素が :focus-visible に一致するときはキーボードによるフォーカスとみなす", () => {
        const element = document.createElement("div");
        vi.spyOn(element, "matches").mockImplementation(selector => (selector === ":focus-visible"));

        expect(KeyboardFocusSelection.isKeyboardFocus(element)).toBe(true);
    });

    test("要素が :focus-visible に一致しないポインタ操作のフォーカスはキーボードとみなさない", () => {
        const element = document.createElement("div");
        vi.spyOn(element, "matches").mockReturnValue(false);

        expect(KeyboardFocusSelection.isKeyboardFocus(element)).toBe(false);
    });

    test(":focus-visible を解釈できない環境ではポインタ操作とみなす", () => {
        const element = document.createElement("div");
        vi.spyOn(element, "matches").mockImplementation(() => {
            throw new SyntaxError("unsupported selector");
        });

        expect(KeyboardFocusSelection.isKeyboardFocus(element)).toBe(false);
    });
});

describe("KeyboardFocusSelection.findSelectAction", () => {
    const selectedState = (tableIds: string[], memoIds: string[] = [], relationId?: string): SelectState => {
        return { status: "selected", tableIds: new Set(tableIds), memoIds: new Set(memoIds), relationId };
    };

    test("未選択のテーブルは排他的な単一選択にする", () => {
        const action = KeyboardFocusSelection.findSelectAction({
            tableId: "table-1", editMode: EditModeType.SELECT, selectState: SelectState.NONE
        });

        expect(action).toEqual({ type: "bulk", tableIds: ["table-1"], memoIds: [], withMultiSelection: false });
    });

    test("別のテーブルが選択されているときは、そのテーブルだけの選択へ置き換える", () => {
        const action = KeyboardFocusSelection.findSelectAction({
            tableId: "table-2", editMode: EditModeType.SELECT, selectState: selectedState(["table-1"])
        });

        expect(action).toEqual({ type: "bulk", tableIds: ["table-2"], memoIds: [], withMultiSelection: false });
    });

    test("複数選択の一部だったテーブルは、そのテーブルだけの選択に絞る", () => {
        const action = KeyboardFocusSelection.findSelectAction({
            tableId: "table-1", editMode: EditModeType.SELECT, selectState: selectedState(["table-1", "table-2"])
        });

        expect(action).toEqual({ type: "bulk", tableIds: ["table-1"], memoIds: [], withMultiSelection: false });
    });

    test("すでに唯一の選択であれば何もしない (選択解除のトグルを起こさない)", () => {
        const action = KeyboardFocusSelection.findSelectAction({
            tableId: "table-1", editMode: EditModeType.SELECT, selectState: selectedState(["table-1"])
        });

        expect(action).toBeNull();
    });

    test("リレーションが選択されているときは、テーブル選択へ置き換える", () => {
        const action = KeyboardFocusSelection.findSelectAction({
            tableId: "table-1", editMode: EditModeType.SELECT, selectState: selectedState([], [], "relation-1")
        });

        expect(action).toEqual({ type: "bulk", tableIds: ["table-1"], memoIds: [], withMultiSelection: false });
    });

    test("SELECT 以外の編集モードでは何もしない", () => {
        const action = KeyboardFocusSelection.findSelectAction({
            tableId: "table-1", editMode: EditModeType.CREATE_RELATION, selectState: SelectState.NONE
        });

        expect(action).toBeNull();
    });
});
