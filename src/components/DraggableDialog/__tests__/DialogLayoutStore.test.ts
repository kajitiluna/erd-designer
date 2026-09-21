import { beforeEach, describe, expect, test } from "vitest";

import DialogLayoutStore, { DialogBounds } from "~/components/DraggableDialog/DialogLayoutStore";

const BOUNDS: DialogBounds = { leftRatio: 0.2, topRatio: 0.3, widthRatio: 0.5, heightRatio: 0.4 };
const STORAGE_KEY = "erdDesigner.dialogLayouts";

beforeEach(() => {
    sessionStorage.clear();
});

describe("dialogLayoutStore", () => {
    test("save したものを同じ layoutName で load できる", () => {
        DialogLayoutStore.save("table-edit", BOUNDS);

        expect(DialogLayoutStore.load("table-edit")).toStrictEqual(BOUNDS);
    });

    test("未保存の layoutName は null", () => {
        expect(DialogLayoutStore.load("unknown")).toBeNull();
    });

    test("同じキーの下で複数の layoutName を独立に扱う", () => {
        DialogLayoutStore.save("table-edit", BOUNDS);
        DialogLayoutStore.save("column-edit", { ...BOUNDS, leftRatio: 0.1 });

        expect(DialogLayoutStore.load("table-edit")).toStrictEqual(BOUNDS);
        expect(DialogLayoutStore.load("column-edit")).toStrictEqual({ ...BOUNDS, leftRatio: 0.1 });
    });

    test("壊れた JSON は例外を投げずに null を返す", () => {
        sessionStorage.setItem(STORAGE_KEY, "{not valid json");

        expect(DialogLayoutStore.load("table-edit")).toBeNull();
    });

    test("フィールド欠損は null を返す", () => {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "table-edit": { leftRatio: 0.2, topRatio: 0.3 } }));

        expect(DialogLayoutStore.load("table-edit")).toBeNull();
    });

    test("数値でないフィールドは null を返す", () => {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
            "table-edit": { leftRatio: "0.2", topRatio: 0.3, widthRatio: 0.5, heightRatio: 0.4 }
        }));

        expect(DialogLayoutStore.load("table-edit")).toBeNull();
    });
});
