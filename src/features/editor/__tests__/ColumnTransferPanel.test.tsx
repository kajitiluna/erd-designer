import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { TableCell } from "@mui/material";
import { describe, expect, test } from "vitest";

import ColumnShareModelStorage from "~/models/ColumnShareModelStorage";
import SimpleColumnModel from "~/models/database/SimpleColumnModel";
import { ColumnShareModelStorageContext } from "~/context/ColumnShareModelStorageContext";
import ColumnTransferPanel from "~/features/editor/ColumnTransferPanel";

type IndexedColumn = { columnModelId: string };

const COLUMN_MODELS = ["c1", "c2", "c3"].map(columnModelId => {
    return new SimpleColumnModel({ columnModelId, physicalName: `col-${columnModelId}`, columnShareModelId: "share" });
});

const STORAGE_CONTEXT = {
    columnShareStorage: {
        findColumnShare: () => { return { specifiedColumnType: () => "INT" }; }
    } as unknown as ColumnShareModelStorage
} as React.ContextType<typeof ColumnShareModelStorageContext>;

const isChildRelation = () => false;
const newIndexedColumn = (columnModelId: string): IndexedColumn => { return { columnModelId }; };

const renderIndexedColumn = (arg: { columnModel: SimpleColumnModel }) => {
    return <TableCell>{arg.columnModel.physicalName}</TableCell>;
};

type HarnessProps = { initialIndexedIds: string[] };

const Harness = ({ initialIndexedIds }: HarnessProps) => {
    const [indexedColumns, setIndexedColumns] = React.useState<IndexedColumn[]>(
        initialIndexedIds.map(columnModelId => { return { columnModelId }; }));

    return (
        <ColumnShareModelStorageContext.Provider value={STORAGE_CONTEXT}>
            <ColumnTransferPanel columnModels={COLUMN_MODELS} indexedColumns={indexedColumns}
                isChildRelation={isChildRelation} onNewIndexedColumn={newIndexedColumn}
                onRenderIndexedColumn={renderIndexedColumn} onUpdateIndexedColumns={setIndexedColumns} />
        </ColumnShareModelStorageContext.Provider>
    );
};

const rowOf = (name: string): HTMLElement => {
    return screen.getByText(name).closest("tr") as HTMLElement;
};

const listRowNames = (): string[] => {
    return screen.getAllByRole("row").map(row => (row.textContent ?? "").replace("INT", ""));
};

describe("ColumnTransferPanel のキーボード操作", () => {
    test("Tab 停止はリストごとに1行 (選択行、未選択なら先頭行)", () => {
        render(<Harness initialIndexedIds={["c3"]} />);

        expect(rowOf("col-c1").tabIndex).toBe(0);
        expect(rowOf("col-c2").tabIndex).toBe(-1);
        expect(rowOf("col-c3").tabIndex).toBe(0);
    });

    test("↓ で隣の行を選択してフォーカスする", () => {
        render(<Harness initialIndexedIds={["c3"]} />);
        rowOf("col-c1").focus();

        fireEvent.keyDown(rowOf("col-c1"), { key: "ArrowDown" });

        expect(document.activeElement).toBe(rowOf("col-c2"));
        expect(rowOf("col-c2").tabIndex).toBe(0);
        expect(rowOf("col-c1").tabIndex).toBe(-1);
    });

    test("Base 側の → は Indexed 側の先頭行へカーソルを移すだけで、並びは変わらない", () => {
        render(<Harness initialIndexedIds={["c2", "c3"]} />);
        rowOf("col-c1").focus();

        fireEvent.keyDown(rowOf("col-c1"), { key: "ArrowRight" });

        expect(listRowNames()).toEqual(["col-c1", "col-c2", "col-c3"]);
        expect(document.activeElement).toBe(rowOf("col-c2"));
        expect(rowOf("col-c2")).toHaveClass("Mui-selected");
        expect(rowOf("col-c2").tabIndex).toBe(0);
    });

    test("Indexed 側の ← は Base 側で選択中の行へカーソルを移す", () => {
        render(<Harness initialIndexedIds={["c3"]} />);
        fireEvent.keyDown(rowOf("col-c2"), { key: " " });
        rowOf("col-c3").focus();

        fireEvent.keyDown(rowOf("col-c3"), { key: "ArrowLeft" });

        expect(listRowNames()).toEqual(["col-c1", "col-c2", "col-c3"]);
        expect(document.activeElement).toBe(rowOf("col-c2"));
    });

    test("反対側のリストが空なら ←→ は何もしない", () => {
        render(<Harness initialIndexedIds={[]} />);
        rowOf("col-c1").focus();

        fireEvent.keyDown(rowOf("col-c1"), { key: "ArrowRight" });

        expect(listRowNames()).toEqual(["col-c1", "col-c2", "col-c3"]);
        expect(document.activeElement).toBe(rowOf("col-c1"));
    });

    test("修飾キーなしの Enter では行が移動しない", () => {
        render(<Harness initialIndexedIds={["c3"]} />);
        rowOf("col-c1").focus();

        fireEvent.keyDown(rowOf("col-c1"), { key: "Enter" });
        fireEvent.keyDown(rowOf("col-c3"), { key: "Enter" });

        expect(listRowNames()).toEqual(["col-c1", "col-c2", "col-c3"]);
    });

    test("Base 側の Ctrl+→ で追加され、Indexed 側で移した行が選択・フォーカスされ、Base 側は隣の行が選択される", () => {
        render(<Harness initialIndexedIds={["c3"]} />);
        rowOf("col-c1").focus();

        fireEvent.keyDown(rowOf("col-c1"), { key: "ArrowRight", ctrlKey: true });

        expect(listRowNames()).toEqual(["col-c2", "col-c3", "col-c1"]);
        expect(document.activeElement).toBe(rowOf("col-c1"));
        expect(rowOf("col-c1")).toHaveClass("Mui-selected");
        expect(rowOf("col-c1").tabIndex).toBe(0);
        expect(rowOf("col-c2")).toHaveClass("Mui-selected");
        expect(rowOf("col-c2").tabIndex).toBe(0);
    });

    test("Base 側の Meta+→ も追加として扱う", () => {
        render(<Harness initialIndexedIds={[]} />);

        fireEvent.keyDown(rowOf("col-c2"), { key: "ArrowRight", metaKey: true });

        expect(listRowNames()).toEqual(["col-c1", "col-c3", "col-c2"]);
    });

    test("Base 側の最後の1行を追加すると、Base 側の選択は空になり、フォーカスは移した行に付く", () => {
        render(<Harness initialIndexedIds={["c2", "c3"]} />);
        rowOf("col-c1").focus();

        fireEvent.keyDown(rowOf("col-c1"), { key: "ArrowRight", ctrlKey: true });

        expect(listRowNames()).toEqual(["col-c2", "col-c3", "col-c1"]);
        expect(document.activeElement).toBe(rowOf("col-c1"));
        expect(rowOf("col-c1")).toHaveClass("Mui-selected");
    });

    test("Indexed 側の Ctrl+← で除外され、Base 側の元の位置で移した行がフォーカスされ、Indexed 側は隣の行が選択される", () => {
        render(<Harness initialIndexedIds={["c1", "c3"]} />);
        rowOf("col-c3").focus();

        fireEvent.keyDown(rowOf("col-c3"), { key: "ArrowLeft", ctrlKey: true });

        expect(listRowNames()).toEqual(["col-c2", "col-c3", "col-c1"]);
        expect(document.activeElement).toBe(rowOf("col-c3"));
        expect(rowOf("col-c3")).toHaveClass("Mui-selected");
        expect(rowOf("col-c1")).toHaveClass("Mui-selected");
    });

    test("Indexed 側の Meta+← で先頭に戻る行も Base 側の元の位置でフォーカスされる", () => {
        render(<Harness initialIndexedIds={["c1", "c3"]} />);
        rowOf("col-c1").focus();

        fireEvent.keyDown(rowOf("col-c1"), { key: "ArrowLeft", metaKey: true });

        expect(listRowNames()).toEqual(["col-c1", "col-c2", "col-c3"]);
        expect(document.activeElement).toBe(rowOf("col-c1"));
    });

    test("Indexed 側の最後の1行を外すと、Indexed 側の選択は空になり、フォーカスは Base 側の移した行に付く", () => {
        render(<Harness initialIndexedIds={["c3"]} />);
        rowOf("col-c3").focus();

        fireEvent.keyDown(rowOf("col-c3"), { key: "ArrowLeft", ctrlKey: true });

        expect(document.activeElement).toBe(rowOf("col-c3"));
        expect(rowOf("col-c3")).toHaveClass("Mui-selected");
        expect(rowOf("col-c3").tabIndex).toBe(0);
    });

    test("Indexed 側の Ctrl+↑↓ で並び順が変わり、フォーカスは動かした行に付いていく", () => {
        render(<Harness initialIndexedIds={["c1", "c2", "c3"]} />);
        rowOf("col-c2").focus();

        fireEvent.keyDown(rowOf("col-c2"), { key: "ArrowUp", ctrlKey: true });
        expect(listRowNames()).toEqual(["col-c2", "col-c1", "col-c3"]);
        expect(document.activeElement).toBe(rowOf("col-c2"));

        fireEvent.keyDown(rowOf("col-c2"), { key: "ArrowDown", metaKey: true });
        expect(listRowNames()).toEqual(["col-c1", "col-c2", "col-c3"]);
        expect(document.activeElement).toBe(rowOf("col-c2"));
    });

    test("先頭行の Ctrl+↑ は並び順を変えない", () => {
        render(<Harness initialIndexedIds={["c1", "c2"]} />);
        rowOf("col-c1").focus();

        fireEvent.keyDown(rowOf("col-c1"), { key: "ArrowUp", ctrlKey: true });

        expect(listRowNames()).toEqual(["col-c3", "col-c1", "col-c2"]);
    });

    test("Alt+矢印では並び順も所属も変わらない", () => {
        render(<Harness initialIndexedIds={["c1", "c2"]} />);

        fireEvent.keyDown(rowOf("col-c2"), { key: "ArrowUp", altKey: true });
        fireEvent.keyDown(rowOf("col-c3"), { key: "ArrowRight", altKey: true });

        expect(listRowNames()).toEqual(["col-c3", "col-c1", "col-c2"]);
    });

    test("中央と右端の4ボタンは Tab 停止から外れているが、押せる", () => {
        render(<Harness initialIndexedIds={["c2", "c3"]} />);
        fireEvent.keyDown(rowOf("col-c1"), { key: " " });
        fireEvent.keyDown(rowOf("col-c3"), { key: " " });

        const buttons = screen.getAllByRole("button");
        const enabledButtons = ["Add to index", "Remove from index", "Move up"]
            .map(name => screen.getByRole("button", { name }));

        expect(buttons).toHaveLength(4);
        enabledButtons.forEach(button => {
            expect(button).toBeEnabled();
        });
        buttons.forEach(button => {
            expect(button.tabIndex).toBe(-1);
        });

        fireEvent.click(screen.getByRole("button", { name: "Move up" }));
        expect(listRowNames()).toEqual(["col-c1", "col-c3", "col-c2"]);
    });

    test("Space は選択を切り替える", () => {
        render(<Harness initialIndexedIds={["c3"]} />);

        fireEvent.keyDown(rowOf("col-c1"), { key: " " });
        expect(rowOf("col-c1")).toHaveClass("Mui-selected");

        fireEvent.keyDown(rowOf("col-c1"), { key: " " });
        expect(rowOf("col-c1")).not.toHaveClass("Mui-selected");
    });

    test("ダブルクリックでの追加は従来どおり動く", () => {
        render(<Harness initialIndexedIds={[]} />);

        fireEvent.doubleClick(rowOf("col-c1"));

        expect(listRowNames()).toEqual(["col-c2", "col-c3", "col-c1"]);
    });
});
