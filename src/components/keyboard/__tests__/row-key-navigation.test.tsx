import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { rowKeyNavigation } from "~/components/keyboard/row-key-navigation";

type FixtureOptions = Partial<Parameters<typeof rowKeyNavigation.initHandleKeyDown>[0]>;

type FixtureProps = {
    rowCount?: number,
    options: FixtureOptions
};

const Fixture = ({ rowCount = 3, options }: FixtureProps) => {
    const rows = Array.from({ length: rowCount }, (_, index) => {
        const handleKeyDown = rowKeyNavigation.initHandleKeyDown({
            orientation: "vertical", index, lastIndex: rowCount - 1, selectAt: () => { /* do nothing */ },
            ...options
        });

        return (
            <div key={`row-${index}`} data-testid={`row-${index}`} tabIndex={(index === 0) ? 0 : -1}
                onKeyDown={handleKeyDown}>
                {`row ${index}`}
                <input aria-label={`input-${index}`} />
            </div>
        );
    });

    return <div data-testid="container">{rows}</div>;
};

// fireEvent は preventDefault が呼ばれると false を返す
const press = (testId: string, init: KeyboardEventInit): boolean => {
    return fireEvent.keyDown(screen.getByTestId(testId), init);
};

describe("rowKeyNavigation 矢印キーによる移動", () => {
    test("vertical は ↓ で次の行を選択してフォーカスを移し、既定動作を止める", () => {
        const selectAt = vi.fn();
        render(<Fixture options={{ orientation: "vertical", selectAt }} />);
        screen.getByTestId("row-0").focus();

        const notPrevented = press("row-0", { key: "ArrowDown" });

        expect(notPrevented).toBe(false);
        expect(selectAt).toHaveBeenCalledWith(1);
        expect(document.activeElement).toBe(screen.getByTestId("row-1"));
    });

    test("vertical は ↑ で前の行へ移る", () => {
        const selectAt = vi.fn();
        render(<Fixture options={{ selectAt }} />);
        screen.getByTestId("row-2").focus();

        press("row-2", { key: "ArrowUp" });

        expect(selectAt).toHaveBeenCalledWith(1);
        expect(document.activeElement).toBe(screen.getByTestId("row-1"));
    });

    test("先頭の ↑ と末尾の ↓ は範囲内に丸められ、フォーカスは動かない", () => {
        const selectAt = vi.fn();
        render(<Fixture options={{ selectAt }} />);

        screen.getByTestId("row-0").focus();
        const firstNotPrevented = press("row-0", { key: "ArrowUp" });
        expect(selectAt).toHaveBeenLastCalledWith(0);
        expect(firstNotPrevented).toBe(false);
        expect(document.activeElement).toBe(screen.getByTestId("row-0"));

        screen.getByTestId("row-2").focus();
        press("row-2", { key: "ArrowDown" });
        expect(selectAt).toHaveBeenLastCalledWith(2);
        expect(document.activeElement).toBe(screen.getByTestId("row-2"));
    });

    test("horizontal は ←→ で移り、↑↓ は扱わない", () => {
        const selectAt = vi.fn();
        render(<Fixture options={{ orientation: "horizontal", selectAt }} />);
        screen.getByTestId("row-1").focus();

        const rightNotPrevented = press("row-1", { key: "ArrowRight" });
        expect(rightNotPrevented).toBe(false);
        expect(selectAt).toHaveBeenLastCalledWith(2);
        expect(document.activeElement).toBe(screen.getByTestId("row-2"));

        selectAt.mockClear();
        screen.getByTestId("row-1").focus();
        const downNotPrevented = press("row-1", { key: "ArrowDown" });
        expect(downNotPrevented).toBe(true);
        expect(selectAt).not.toHaveBeenCalled();
    });

    test("focusRowAt を渡すと、隣接要素ではなくその関数が移動先を決める", () => {
        const focusRowAt = vi.fn();
        render(<Fixture options={{ focusRowAt }} />);
        screen.getByTestId("row-0").focus();

        press("row-0", { key: "ArrowDown" });

        expect(focusRowAt).toHaveBeenCalledWith(1, screen.getByTestId("row-0"));
        expect(document.activeElement).toBe(screen.getByTestId("row-0"));
    });
});

describe("rowKeyNavigation 操作キー", () => {
    test("Enter / Space / Delete / Backspace はそれぞれ指定された操作を呼ぶ", () => {
        const onActivate = vi.fn();
        const onSelect = vi.fn();
        const onRemove = vi.fn();
        render(<Fixture options={{ onActivate, onSelect, onRemove }} />);

        const enterNotPrevented = press("row-0", { key: "Enter" });
        const spaceNotPrevented = press("row-0", { key: " " });
        const deleteNotPrevented = press("row-0", { key: "Delete" });
        const backspaceNotPrevented = press("row-0", { key: "Backspace" });

        expect(onActivate).toHaveBeenCalledTimes(1);
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onRemove).toHaveBeenCalledTimes(2);
        expect([enterNotPrevented, spaceNotPrevented, deleteNotPrevented, backspaceNotPrevented])
            .toEqual([false, false, false, false]);
    });

    test("指定されていない操作は何もせず、既定動作も止めない", () => {
        render(<Fixture options={{}} />);

        const results = ["Enter", " ", "Delete", "Backspace", "ArrowLeft", "ArrowRight", "a"]
            .map(key => press("row-0", { key }));

        expect(results.every(notPrevented => notPrevented)).toBe(true);
    });

    test("vertical の ←→ は軸と交差する操作として扱われる", () => {
        const onCrossPrevious = vi.fn();
        const onCrossNext = vi.fn();
        render(<Fixture options={{ onCrossPrevious, onCrossNext }} />);

        const leftNotPrevented = press("row-0", { key: "ArrowLeft" });
        const rightNotPrevented = press("row-0", { key: "ArrowRight" });

        expect(onCrossPrevious).toHaveBeenCalledTimes(1);
        expect(onCrossNext).toHaveBeenCalledTimes(1);
        expect([leftNotPrevented, rightNotPrevented]).toEqual([false, false]);
    });

    test("horizontal の ↑↓ は軸と交差する操作として扱われる", () => {
        const onCrossPrevious = vi.fn();
        const onCrossNext = vi.fn();
        render(<Fixture options={{ orientation: "horizontal", onCrossPrevious, onCrossNext }} />);

        press("row-0", { key: "ArrowUp" });
        press("row-0", { key: "ArrowDown" });

        expect(onCrossPrevious).toHaveBeenCalledTimes(1);
        expect(onCrossNext).toHaveBeenCalledTimes(1);
    });
});

describe("rowKeyNavigation Ctrl/Cmd による並べ替え", () => {
    test("vertical は Ctrl+↑ で -1、Meta+↓ で 1 を渡し、選択は動かさない", () => {
        const onReorder = vi.fn();
        const selectAt = vi.fn();
        render(<Fixture options={{ onReorder, selectAt }} />);

        const upNotPrevented = press("row-1", { key: "ArrowUp", ctrlKey: true });
        const downNotPrevented = press("row-1", { key: "ArrowDown", metaKey: true });

        expect(onReorder.mock.calls).toEqual([[-1], [1]]);
        expect(selectAt).not.toHaveBeenCalled();
        expect([upNotPrevented, downNotPrevented]).toEqual([false, false]);
    });

    test("horizontal は Ctrl+← で -1、Meta+→ で 1 を渡す", () => {
        const onReorder = vi.fn();
        render(<Fixture options={{ orientation: "horizontal", onReorder }} />);

        press("row-1", { key: "ArrowLeft", ctrlKey: true });
        press("row-1", { key: "ArrowRight", metaKey: true });

        expect(onReorder.mock.calls).toEqual([[-1], [1]]);
    });

    test("onReorder がなければ Ctrl/Cmd+並びの向きの矢印は移動にもならず、既定動作も止めない", () => {
        const selectAt = vi.fn();
        render(<Fixture options={{ selectAt }} />);

        const ctrlNotPrevented = press("row-1", { key: "ArrowDown", ctrlKey: true });
        const metaNotPrevented = press("row-1", { key: "ArrowUp", metaKey: true });

        expect([ctrlNotPrevented, metaNotPrevented]).toEqual([true, true]);
        expect(selectAt).not.toHaveBeenCalled();
    });
});

describe("rowKeyNavigation Ctrl/Cmd による移し替え", () => {
    test("vertical は Ctrl+← で onTransferPrevious、Meta+→ で onTransferNext を呼ぶ", () => {
        const onTransferPrevious = vi.fn();
        const onTransferNext = vi.fn();
        const onCrossPrevious = vi.fn();
        const onCrossNext = vi.fn();
        render(<Fixture options={{ onTransferPrevious, onTransferNext, onCrossPrevious, onCrossNext }} />);

        const leftNotPrevented = press("row-0", { key: "ArrowLeft", ctrlKey: true });
        const rightNotPrevented = press("row-0", { key: "ArrowRight", metaKey: true });

        expect(onTransferPrevious).toHaveBeenCalledTimes(1);
        expect(onTransferNext).toHaveBeenCalledTimes(1);
        expect(onCrossPrevious).not.toHaveBeenCalled();
        expect(onCrossNext).not.toHaveBeenCalled();
        expect([leftNotPrevented, rightNotPrevented]).toEqual([false, false]);
    });

    test("horizontal は Ctrl+↑ で onTransferPrevious、Meta+↓ で onTransferNext を呼ぶ", () => {
        const onTransferPrevious = vi.fn();
        const onTransferNext = vi.fn();
        render(<Fixture options={{ orientation: "horizontal", onTransferPrevious, onTransferNext }} />);

        press("row-0", { key: "ArrowUp", ctrlKey: true });
        press("row-0", { key: "ArrowDown", metaKey: true });

        expect(onTransferPrevious).toHaveBeenCalledTimes(1);
        expect(onTransferNext).toHaveBeenCalledTimes(1);
    });

    test("onTransfer* がなければ Ctrl/Cmd+交差する矢印は既定動作を止めない", () => {
        render(<Fixture options={{ onCrossPrevious: vi.fn(), onCrossNext: vi.fn() }} />);

        const leftNotPrevented = press("row-0", { key: "ArrowLeft", ctrlKey: true });
        const rightNotPrevented = press("row-0", { key: "ArrowRight", metaKey: true });

        expect([leftNotPrevented, rightNotPrevented]).toEqual([true, true]);
    });

    test("修飾キーなしの交差する矢印は、カーソル移動の onCross* だけを呼ぶ", () => {
        const onTransferNext = vi.fn();
        const onCrossNext = vi.fn();
        render(<Fixture options={{ onTransferNext, onCrossNext }} />);

        press("row-0", { key: "ArrowRight" });

        expect(onCrossNext).toHaveBeenCalledTimes(1);
        expect(onTransferNext).not.toHaveBeenCalled();
    });
});

describe("rowKeyNavigation Alt 付きの入力", () => {
    test("Alt+矢印は並べ替えにも移し替えにもならず、既定動作も止めない", () => {
        const onReorder = vi.fn();
        const onTransferNext = vi.fn();
        const selectAt = vi.fn();
        render(<Fixture options={{ onReorder, onTransferNext, selectAt }} />);

        const results = [
            press("row-1", { key: "ArrowUp", altKey: true }),
            press("row-1", { key: "ArrowDown", altKey: true }),
            press("row-1", { key: "ArrowRight", altKey: true }),
            press("row-1", { key: "ArrowDown", altKey: true, ctrlKey: true })
        ];

        expect(results).toEqual([true, true, true, true]);
        expect(onReorder).not.toHaveBeenCalled();
        expect(onTransferNext).not.toHaveBeenCalled();
        expect(selectAt).not.toHaveBeenCalled();
    });
});

describe("rowKeyNavigation 対象外の入力", () => {
    test("Ctrl/Cmd + Enter など矢印以外は扱わない (ダイアログ確定などに譲る)", () => {
        const onActivate = vi.fn();
        const onSelect = vi.fn();
        const onRemove = vi.fn();
        render(<Fixture options={{ onActivate, onSelect, onRemove }} />);

        const results = [
            press("row-0", { key: "Enter", ctrlKey: true }),
            press("row-0", { key: "Enter", metaKey: true }),
            press("row-0", { key: " ", ctrlKey: true }),
            press("row-0", { key: "Delete", metaKey: true })
        ];

        expect(results).toEqual([true, true, true, true]);
        expect(onActivate).not.toHaveBeenCalled();
        expect(onSelect).not.toHaveBeenCalled();
        expect(onRemove).not.toHaveBeenCalled();
    });

    test("Shift 付きは扱わない", () => {
        const selectAt = vi.fn();
        const onReorder = vi.fn();
        render(<Fixture options={{ selectAt, onReorder }} />);

        const results = [
            press("row-0", { key: "ArrowDown", shiftKey: true }),
            press("row-0", { key: "ArrowDown", shiftKey: true, ctrlKey: true })
        ];

        expect(results).toEqual([true, true]);
        expect(selectAt).not.toHaveBeenCalled();
        expect(onReorder).not.toHaveBeenCalled();
    });

    test("IME 変換中のキーは扱わない", () => {
        const onActivate = vi.fn();
        const selectAt = vi.fn();
        render(<Fixture options={{ onActivate, selectAt }} />);

        const composingResult = press("row-0", { key: "Enter", isComposing: true });
        const keyCodeResult = press("row-0", { key: "ArrowDown", keyCode: 229 });

        expect([composingResult, keyCodeResult]).toEqual([true, true]);
        expect(onActivate).not.toHaveBeenCalled();
        expect(selectAt).not.toHaveBeenCalled();
    });

    test("行の中の入力欄が受けたキーは扱わない", () => {
        const onSelect = vi.fn();
        const onActivate = vi.fn();
        render(<Fixture options={{ onSelect, onActivate }} />);

        const spaceNotPrevented = fireEvent.keyDown(screen.getByLabelText("input-0"), { key: " " });
        const enterNotPrevented = fireEvent.keyDown(screen.getByLabelText("input-0"), { key: "Enter" });

        expect([spaceNotPrevented, enterNotPrevented]).toEqual([true, true]);
        expect(onSelect).not.toHaveBeenCalled();
        expect(onActivate).not.toHaveBeenCalled();
    });
});

describe("rowKeyNavigation 補助関数", () => {
    test("focusChildAt は範囲に丸めて子要素へフォーカスする", () => {
        render(<Fixture options={{}} />);
        const container = screen.getByTestId("container");

        rowKeyNavigation.focusChildAt(container, 1);
        expect(document.activeElement).toBe(screen.getByTestId("row-1"));

        rowKeyNavigation.focusChildAt(container, 99);
        expect(document.activeElement).toBe(screen.getByTestId("row-2"));

        rowKeyNavigation.focusChildAt(container, -5);
        expect(document.activeElement).toBe(screen.getByTestId("row-0"));
    });

    test("focusChildAt はコンテナが null でも子がなくても何もしない", () => {
        expect(() => rowKeyNavigation.focusChildAt(null, 0)).not.toThrow();

        const emptyContainer = document.createElement("div");
        expect(() => rowKeyNavigation.focusChildAt(emptyContainer, 0)).not.toThrow();
    });

    test("neighbourIndexAfterRemoval は削除後に残る隣の位置を返し、残らなければ -1", () => {
        expect(rowKeyNavigation.neighbourIndexAfterRemoval(3, 0)).toBe(0);
        expect(rowKeyNavigation.neighbourIndexAfterRemoval(3, 1)).toBe(1);
        expect(rowKeyNavigation.neighbourIndexAfterRemoval(3, 2)).toBe(1);
        expect(rowKeyNavigation.neighbourIndexAfterRemoval(1, 0)).toBe(-1);
    });
});
