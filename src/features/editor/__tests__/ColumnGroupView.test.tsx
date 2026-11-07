import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import ColumnGroupView from "~/features/editor/ColumnGroupView";
import ColumnGroupModel from "~/models/database/ColumnGroupModel";

vi.mock("~/features/editor/ColumnGroupEditDialog", () => {
    return { default: () => { return <div data-testid="group-edit-dialog" />; } };
});

const COLUMN_GROUPS = [
    new ColumnGroupModel({ columnGroupId: "g1", groupName: "alpha" }),
    new ColumnGroupModel({ columnGroupId: "g2", groupName: "beta" }),
    new ColumnGroupModel({ columnGroupId: "g3", groupName: "gamma" })
];

const DOCUMENTS_HOLDER = {
    current: () => {
        return {
            getDisplayNameStyle: () => { return { withLogicalName: () => false }; },
            getColumnGroupModels: () => COLUMN_GROUPS,
            findColumnModel: () => null
        };
    }
} as unknown as ErdDocumentsHolder;

type RenderOptions = { viewMode?: "select" | "edit", initialColumnGroupId?: string };

const renderView = (options: RenderOptions = {}) => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
        <ErdDocumentsHolderContext.Provider value={DOCUMENTS_HOLDER}>
            <ColumnGroupView isOpen viewMode={options.viewMode ?? "select"}
                initialColumnGroupId={options.initialColumnGroupId}
                onSelect={onSelect} onClose={onClose} />
        </ErdDocumentsHolderContext.Provider>
    );
    return { onSelect, onClose };
};

const row = (name: string) => screen.getByRole("button", { name: new RegExp(name) });

const flushAutoFocus = async () => {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
};

const isSelected = (name: string) => row(name).textContent?.includes("✔") === true;

describe("ColumnGroupView select モードのキーボード操作", () => {
    test("開いた直後は先頭行にフォーカスし、何も選択していない", async () => {
        renderView();
        await flushAutoFocus();

        expect(document.activeElement).toBe(row("alpha"));
        expect(isSelected("alpha")).toBe(false);
        expect(screen.getByRole("button", { name: "OK" })).toBeDisabled();
    });

    test("矢印はフォーカスだけ移動し、Space で選択する", async () => {
        renderView();
        await flushAutoFocus();

        fireEvent.keyDown(row("alpha"), { key: "ArrowDown" });
        expect(document.activeElement).toBe(row("beta"));
        expect(isSelected("beta")).toBe(false);
        expect(row("beta")).toHaveAttribute("tabindex", "0");
        expect(row("alpha")).toHaveAttribute("tabindex", "-1");

        fireEvent.keyDown(row("beta"), { key: " " });
        expect(isSelected("beta")).toBe(true);
        expect(screen.getByRole("button", { name: "OK" })).toBeEnabled();
    });

    test("Enter は選択して onSelect を 1 回だけ呼び、onClose する", async () => {
        const { onSelect, onClose } = renderView();
        await flushAutoFocus();

        fireEvent.keyDown(row("alpha"), { key: "Enter" });

        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect.mock.calls[0][0].columnGroupModel.columnGroupId).toBe("g1");
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test("ダブルクリックで onSelect と onClose を呼ぶ", async () => {
        const { onSelect, onClose } = renderView();
        await flushAutoFocus();

        fireEvent.doubleClick(row("gamma"));

        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect.mock.calls[0][0].columnGroupModel.columnGroupId).toBe("g3");
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

describe("ColumnGroupView 編集元グループの指定", () => {
    test("編集元を選択済み・フォーカス済みで開き、OK は非活性", async () => {
        renderView({ initialColumnGroupId: "g2" });
        await flushAutoFocus();

        expect(isSelected("beta")).toBe(true);
        expect(document.activeElement).toBe(row("beta"));
        expect(screen.getByRole("button", { name: "OK" })).toBeDisabled();
    });

    test("別グループを選択すると OK が活性になり、押すと onSelect する", async () => {
        const { onSelect, onClose } = renderView({ initialColumnGroupId: "g2" });
        await flushAutoFocus();

        fireEvent.click(row("gamma"));
        const okButton = screen.getByRole("button", { name: "OK" });
        expect(okButton).toBeEnabled();

        fireEvent.click(okButton);
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test("編集元を Enter / ダブルクリックすると onSelect せず閉じる", async () => {
        const { onSelect, onClose } = renderView({ initialColumnGroupId: "g2" });
        await flushAutoFocus();

        fireEvent.keyDown(row("beta"), { key: "Enter" });
        fireEvent.doubleClick(row("beta"));

        expect(onSelect).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledTimes(2);
    });
});

describe("ColumnGroupView edit モードのキーボード操作", () => {
    test("Enter で選択して編集ダイアログを開く", async () => {
        const { onSelect } = renderView({ viewMode: "edit" });
        await flushAutoFocus();
        expect(screen.queryByTestId("group-edit-dialog")).toBeNull();

        fireEvent.keyDown(row("alpha"), { key: "Enter" });

        expect(screen.getByTestId("group-edit-dialog")).toBeInTheDocument();
        expect(onSelect).not.toHaveBeenCalled();
    });
});
