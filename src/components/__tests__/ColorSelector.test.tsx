import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import ColorSelector from "~/components/ColorSelector";

const SWATCH_SELECTOR = "button[data-color-swatch]";
const SWATCHES_PER_COLUMN = 10;

const findSwatches = (): HTMLElement[] => {
    return Array.from(document.querySelectorAll<HTMLElement>(SWATCH_SELECTOR));
};

// 実利用ではトリガーをクリックするとフォーカスがトリガーに移る。FocusTrap はそれを復元先として記録する。
const openPalette = () => {
    const trigger = screen.getByRole("button");
    trigger.focus();
    fireEvent.click(trigger);
};

const renderSelector = (element: React.ReactElement) => {
    return render(element, { wrapper: StrictMode });
};

describe("ColorSelector", () => {
    test("丸型トリガーは click で開き、先頭のスウォッチにフォーカスが入る", async () => {
        renderSelector(<ColorSelector callback={vi.fn()} />);

        openPalette();

        const swatches = findSwatches();
        expect(swatches.length).toBeGreaterThan(SWATCHES_PER_COLUMN);
        await waitFor(() => { expect(document.activeElement).toBe(swatches[0]); });
        expect(swatches.filter(swatch => swatch.tabIndex === 0)).toHaveLength(1);
    });

    test("mousedown だけでは開かない (click で開く)", () => {
        renderSelector(<ColorSelector callback={vi.fn()} />);

        fireEvent.mouseDown(screen.getByRole("button"));

        expect(findSwatches()).toHaveLength(0);
    });

    test("矢印キーでスウォッチ間のフォーカスが移動する", async () => {
        renderSelector(<ColorSelector callback={vi.fn()} />);
        openPalette();
        const swatches = findSwatches();
        await waitFor(() => { expect(document.activeElement).toBe(swatches[0]); });

        fireEvent.keyDown(swatches[0], { key: "ArrowDown" });
        expect(document.activeElement).toBe(swatches[1]);

        fireEvent.keyDown(swatches[1], { key: "ArrowRight" });
        expect(document.activeElement).toBe(swatches[1 + SWATCHES_PER_COLUMN]);

        fireEvent.keyDown(swatches[1 + SWATCHES_PER_COLUMN], { key: "ArrowUp" });
        expect(document.activeElement).toBe(swatches[SWATCHES_PER_COLUMN]);

        fireEvent.keyDown(swatches[SWATCHES_PER_COLUMN], { key: "ArrowUp" });
        expect(document.activeElement).toBe(swatches[SWATCHES_PER_COLUMN]);
    });

    test("スウォッチの選択でコールバックが呼ばれ、パレットが閉じる", () => {
        const callback = vi.fn();
        renderSelector(<ColorSelector callback={callback} />);
        fireEvent.click(screen.getByRole("button"));

        fireEvent.click(findSwatches()[3]);

        expect(callback).toHaveBeenCalledTimes(1);
    });

    test("矩形トリガーは Enter / Space で開く", () => {
        renderSelector(<ColorSelector shape="rectangle" callback={vi.fn()} />);
        const trigger = screen.getByRole("button", { name: "Select color" });

        fireEvent.keyDown(trigger, { key: "Tab" });
        expect(findSwatches()).toHaveLength(0);

        fireEvent.keyDown(trigger, { key: "Enter" });
        expect(findSwatches().length).toBeGreaterThan(0);
    });
});
