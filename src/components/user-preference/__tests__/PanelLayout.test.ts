import { describe, test, expect } from "vitest";

import PanelLayout from "~/components/user-preference/PanelLayout";

describe("PanelLayout.toObject", () => {
    test.each(["normal", "compact"])("%s はそのまま復元する", (value) => {
        expect(PanelLayout.toObject(value)).toBe(value);
    });

    test.each([null, undefined, "", "Compact", "wide", 1, {}])("不正値 %j は初期値の normal", (value) => {
        expect(PanelLayout.toObject(value)).toBe(PanelLayout.initial());
    });

    test("初期値は normal", () => {
        expect(PanelLayout.initial()).toBe("normal");
    });
});
