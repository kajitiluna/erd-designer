import { fireEvent, render, screen } from "@testing-library/react";
import { TableCell, TableHead, TableRow } from "@mui/material";
import { describe, expect, test, vi } from "vitest";

import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import { useInitializeSearchDialog } from "~/features/editor/SearchContentDialog";

type Item = { id: string, name: string };

const ITEMS: Item[] = [
    { id: "a", name: "alpha" },
    { id: "b", name: "beta" },
    { id: "c", name: "gamma" }
];

const DOCUMENTS_HOLDER = {
    current: () => {
        return { getDisplayNameStyle: () => { return { withLogicalName: () => false }; } };
    }
} as unknown as ErdDocumentsHolder;

const TABLE_HEADER = (
    <TableHead>
        <TableRow><TableCell>name</TableCell></TableRow>
    </TableHead>
);

const identity = (item: Item) => item.id;

const filterItems = () => ITEMS;

const initRecord = (item: Item, _selected: boolean, attributes: React.ComponentProps<typeof TableRow>) => {
    return (
        <TableRow key={item.id} data-testid={`row-${item.id}`} {...attributes}>
            <TableCell>{item.name}</TableCell>
        </TableRow>
    );
};

type HarnessProps = { onCompleted: (item: Item) => void, onClose: () => void };

const Harness = ({ onCompleted, onClose }: HarnessProps) => {
    const searchDialog = useInitializeSearchDialog<Item>({
        dialogTitle: "Search items", tableHeader: TABLE_HEADER, identity,
        onFiltering: filterItems, initRecord
    });

    return searchDialog({ isOpen: true, onCompleted, onClose });
};

const renderDialog = (onCompleted: (item: Item) => void, onClose: () => void) => {
    return render(
        <ErdDocumentsHolderContext.Provider value={DOCUMENTS_HOLDER}>
            <Harness onCompleted={onCompleted} onClose={onClose} />
        </ErdDocumentsHolderContext.Provider>
    );
};

describe("SearchContentDialog のキーボード操作", () => {
    test("検索語の入力欄で ↓ を押すと先頭の結果行を選択してフォーカスする", () => {
        renderDialog(vi.fn(), vi.fn());
        const okButton = screen.getByRole("button", { name: "OK" });
        expect(okButton).toBeDisabled();

        const notPrevented = fireEvent.keyDown(screen.getByLabelText("keywords"), { key: "ArrowDown" });

        expect(notPrevented).toBe(false);
        expect(document.activeElement).toBe(screen.getByTestId("row-a"));
        expect(okButton).toBeEnabled();
    });

    test("結果行では ↑↓ で選択とフォーカスが隣へ移る", () => {
        renderDialog(vi.fn(), vi.fn());
        fireEvent.keyDown(screen.getByLabelText("keywords"), { key: "ArrowDown" });

        fireEvent.keyDown(screen.getByTestId("row-a"), { key: "ArrowDown" });
        expect(document.activeElement).toBe(screen.getByTestId("row-b"));

        fireEvent.keyDown(screen.getByTestId("row-b"), { key: "ArrowDown" });
        expect(document.activeElement).toBe(screen.getByTestId("row-c"));

        fireEvent.keyDown(screen.getByTestId("row-c"), { key: "ArrowUp" });
        expect(document.activeElement).toBe(screen.getByTestId("row-b"));
    });

    test("再度 ↓ で入力欄から戻ると、選択済みの行にフォーカスする", () => {
        renderDialog(vi.fn(), vi.fn());
        fireEvent.keyDown(screen.getByLabelText("keywords"), { key: "ArrowDown" });
        fireEvent.keyDown(screen.getByTestId("row-a"), { key: "ArrowDown" });
        screen.getByLabelText("keywords").focus();

        fireEvent.keyDown(screen.getByLabelText("keywords"), { key: "ArrowDown" });

        expect(document.activeElement).toBe(screen.getByTestId("row-b"));
    });

    test("結果行で Enter を押すとその行を確定してダイアログを閉じる", () => {
        const onCompleted = vi.fn();
        const onClose = vi.fn();
        renderDialog(onCompleted, onClose);
        fireEvent.keyDown(screen.getByLabelText("keywords"), { key: "ArrowDown" });
        fireEvent.keyDown(screen.getByTestId("row-a"), { key: "ArrowDown" });

        fireEvent.keyDown(screen.getByTestId("row-b"), { key: "Enter" });

        expect(onCompleted).toHaveBeenCalledTimes(1);
        expect(onCompleted).toHaveBeenCalledWith(ITEMS[1]);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test("未選択のまま行へフォーカスしただけでも Enter でその行を確定できる", () => {
        const onCompleted = vi.fn();
        renderDialog(onCompleted, vi.fn());

        fireEvent.keyDown(screen.getByTestId("row-c"), { key: "Enter" });

        expect(onCompleted).toHaveBeenCalledWith(ITEMS[2]);
    });

    test("Space は行の選択を切り替え、OK ボタンの有効状態に反映される", () => {
        renderDialog(vi.fn(), vi.fn());
        const okButton = screen.getByRole("button", { name: "OK" });

        fireEvent.keyDown(screen.getByTestId("row-a"), { key: " " });
        expect(okButton).toBeEnabled();

        fireEvent.keyDown(screen.getByTestId("row-a"), { key: " " });
        expect(okButton).toBeDisabled();
    });

    test("Tab 停止は結果一覧で1行だけ (選択行、未選択なら先頭行)", () => {
        renderDialog(vi.fn(), vi.fn());
        const tabbableIds = () => ITEMS
            .filter(item => (screen.getByTestId(`row-${item.id}`).tabIndex === 0))
            .map(item => item.id);
        expect(tabbableIds()).toEqual(["a"]);

        fireEvent.keyDown(screen.getByTestId("row-a"), { key: "ArrowDown" });
        expect(tabbableIds()).toEqual(["b"]);
    });

    test("Escape は行の上でもダイアログを閉じる", () => {
        const onClose = vi.fn();
        renderDialog(vi.fn(), onClose);
        screen.getByTestId("row-a").focus();

        fireEvent.keyDown(screen.getByTestId("row-a"), { key: "Escape" });

        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
