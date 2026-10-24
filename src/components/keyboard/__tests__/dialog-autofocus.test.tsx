import React, { StrictMode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Button, Dialog, DialogActions } from "@mui/material";
import { describe, expect, test } from "vitest";

import useAutoFocus from "~/components/keyboard/useAutoFocus";

// StrictMode は開発ビルドで effect を setup -> cleanup -> setup と二重実行する。
// MUI FocusTrap の cleanup が開く前の要素へフォーカスを戻すため、autoFocus 属性で入ったフォーカスは失われる。

// 実利用では開く操作をした要素 (opener) にフォーカスがある状態でダイアログが開く。
// FocusTrap はこの要素を復元先として記録するため、テストでも opener をフォーカスしてから開く。
const PlainAutoFocusDialog = () => {
    const [isOpen, setIsOpen] = React.useState(false);

    return (<>
        <Button onClick={() => setIsOpen(true)}>Open</Button>
        <Dialog open={isOpen}>
            <DialogActions>
                <Button>Cancel</Button>
                <Button autoFocus>Delete</Button>
            </DialogActions>
        </Dialog>
    </>);
};

const HookAutoFocusDialog = () => {
    const [isOpen, setIsOpen] = React.useState(false);
    const deleteButtonRef = useAutoFocus<HTMLButtonElement>(isOpen);

    return (<>
        <Button onClick={() => setIsOpen(true)}>Open</Button>
        <Dialog open={isOpen}>
            <DialogActions>
                <Button>Cancel</Button>
                <Button ref={deleteButtonRef}>Delete</Button>
            </DialogActions>
        </Dialog>
    </>);
};

const openDialog = () => {
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    fireEvent.click(opener);
};

describe("StrictMode 配下の確認ダイアログの初期フォーカス", () => {
    test("素の autoFocus 属性を付けたボタンはフォーカスを失う", async () => {
        render(<PlainAutoFocusDialog />, { wrapper: StrictMode });
        openDialog();
        const deleteButton = screen.getByRole("button", { name: "Delete" });

        // FocusTrap のフォーカス処理が落ち着くまで待ってから確認する
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(document.activeElement).not.toBe(deleteButton);
    });

    test("useAutoFocus の ref を付けた確定ボタンにフォーカスが入る", async () => {
        render(<HookAutoFocusDialog />, { wrapper: StrictMode });
        openDialog();
        const deleteButton = screen.getByRole("button", { name: "Delete" });

        await waitFor(() => { expect(document.activeElement).toBe(deleteButton); });
    });
});
