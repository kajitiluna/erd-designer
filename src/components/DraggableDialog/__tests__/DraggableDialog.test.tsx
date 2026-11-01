import { fireEvent, render, screen } from "@testing-library/react";
import { Autocomplete, Button, Dialog, DialogActions, DialogContent, TextField } from "@mui/material";
import { describe, expect, test, vi } from "vitest";

import DraggableDialog from "~/components/DraggableDialog";

const OPTIONS = ["alpha", "beta"];

type FixtureProps = {
    onSubmitRequest: () => void,
    onClose?: () => void,
    withNested?: boolean
};

const Fixture = ({ onSubmitRequest, onClose = () => { /* do nothing */ }, withNested = false }: FixtureProps) => {
    return (
        <DraggableDialog open={true} onClose={onClose} onSubmitRequest={onSubmitRequest}>
            <DialogContent>
                <TextField label="Name" />
                <TextField label="Description" multiline rows={3} />
                <Autocomplete options={OPTIONS} renderInput={params => <TextField {...params} label="Kind" />} />
                <Dialog open={withNested}>
                    <DialogActions>
                        <input aria-label="nested-input" />
                    </DialogActions>
                </Dialog>
            </DialogContent>
            <DialogActions>
                <Button>Cancel</Button>
            </DialogActions>
        </DraggableDialog>
    );
};

describe("DraggableDialog onSubmitRequest", () => {
    test("入力欄での Enter で呼ばれる", () => {
        const onSubmitRequest = vi.fn();
        render(<Fixture onSubmitRequest={onSubmitRequest} />);

        fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Enter" });

        expect(onSubmitRequest).toHaveBeenCalledTimes(1);
    });

    test("複数行入力では Enter で呼ばれず、Ctrl+Enter で呼ばれる", () => {
        const onSubmitRequest = vi.fn();
        render(<Fixture onSubmitRequest={onSubmitRequest} />);
        const description = screen.getByLabelText("Description");

        fireEvent.keyDown(description, { key: "Enter" });
        expect(onSubmitRequest).not.toHaveBeenCalled();

        fireEvent.keyDown(description, { key: "Enter", ctrlKey: true });
        expect(onSubmitRequest).toHaveBeenCalledTimes(1);
    });

    test("ボタン上の Enter と IME 変換中の Enter では呼ばれない", () => {
        const onSubmitRequest = vi.fn();
        render(<Fixture onSubmitRequest={onSubmitRequest} />);

        fireEvent.keyDown(screen.getByRole("button", { name: "Cancel" }), { key: "Enter" });
        fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Enter", isComposing: true });

        expect(onSubmitRequest).not.toHaveBeenCalled();
    });

    test("入れ子のダイアログ内のキー操作では親が呼ばれない", () => {
        const onSubmitRequest = vi.fn();
        render(<Fixture onSubmitRequest={onSubmitRequest} withNested={true} />);

        fireEvent.keyDown(screen.getByLabelText("nested-input"), { key: "Enter" });
        fireEvent.keyDown(screen.getByLabelText("nested-input"), { key: "Enter", ctrlKey: true });

        expect(onSubmitRequest).not.toHaveBeenCalled();
    });

    test("Autocomplete は 1 回目の Enter で候補を確定し、2 回目の Enter で呼ばれる", () => {
        const onSubmitRequest = vi.fn();
        render(<Fixture onSubmitRequest={onSubmitRequest} />);
        const kind = screen.getByLabelText("Kind");

        fireEvent.focus(kind);
        fireEvent.keyDown(kind, { key: "ArrowDown" });
        fireEvent.keyDown(kind, { key: "ArrowDown" });
        fireEvent.keyDown(kind, { key: "Enter" });
        expect(onSubmitRequest).not.toHaveBeenCalled();
        expect((kind as HTMLInputElement).value).toBe("alpha");

        fireEvent.keyDown(kind, { key: "Enter" });
        expect(onSubmitRequest).toHaveBeenCalledTimes(1);
    });

    test("Escape は閉じる操作へ伝わり、確定は呼ばれない", () => {
        const onSubmitRequest = vi.fn();
        const onClose = vi.fn();
        render(<Fixture onSubmitRequest={onSubmitRequest} onClose={onClose} />);

        fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Escape" });

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onSubmitRequest).not.toHaveBeenCalled();
    });

    test("onSubmitRequest 未指定のダイアログは Enter に何もしない", () => {
        render(
            <DraggableDialog open={true}>
                <DialogContent><TextField label="Name" /></DialogContent>
            </DraggableDialog>
        );

        expect(() => fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Enter" })).not.toThrow();
    });
});
