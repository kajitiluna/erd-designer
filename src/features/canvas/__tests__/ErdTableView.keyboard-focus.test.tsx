import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import ViewportContext, { CanvasViewport } from "~/context/ViewportContext";
import EditModeContext from "~/context/EditModeContext";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import { SelectAction, SelectEntityContext } from "~/context/SelectEntityContext";
import ErdTableView from "~/features/canvas/ErdTableView";
import ColorValue from "~/models/ColorValue";
import DatabaseSettingModel from "~/models/DatabaseSettingModel";
import { EditModeType } from "~/models/EditMode";
import ErdDocument from "~/models/ErdDocument";
import ErdSettingModel from "~/models/ErdSettingModel";
import SelectState from "~/models/SelectState";
import TableViewModel from "~/models/TableViewModel";
import TableModel from "~/models/database/TableModel";

const tableModel = new TableModel({ tableModelId: "table-1", physicalName: "users", logicalName: "", columnEntries: [] });
const tableView = new TableViewModel({
    tableModel, corner: { top: 40, left: 20 }, headerColor: { background: ColorValue.WHITE, foreground: ColorValue.BLACK }
});

const documentsHolder = new ErdDocumentsHolder([
    ErdDocument.create({
        documentName: "test-document",
        erdSettingModel: ErdSettingModel.create("test-document"),
        databaseSettingModel: DatabaseSettingModel.create("postgres"),
        tableViewModels: [tableView],
        columnModels: [],
        columnGroupModels: [],
        relationViewModels: []
    })
], 0, vi.fn());

type Rendering = {
    dispatchSelectAction: (action: SelectAction) => void,
    viewport: CanvasViewport
};

const renderTable = (selectState: SelectState = SelectState.NONE, visible: boolean = true): Rendering => {
    const dispatchSelectAction = vi.fn();
    const viewport = {
        isMounted: () => true,
        toPhysicalPosition: (position: { x: number, y: number }) => position,
        getLogicalPosition: () => { return { x: 0, y: 0 }; },
        ensureVisible: vi.fn()
    } as unknown as CanvasViewport;
    const scaleState = { scale: 1, phase: "idle" as const };

    render(
        <ErdDocumentsHolderContext.Provider value={documentsHolder}>
            <EditModeContext.Provider value={{ editMode: EditModeType.SELECT, dispatchEditMode: vi.fn() }}>
                <SelectEntityContext.Provider value={{ selectState, dispatchSelectAction }}>
                    <ViewportContext.Provider value={{ viewport, scaleState }}>
                        <ErdTableView tableView={tableView} visible={visible} onEditAction={vi.fn()} onDragAction={vi.fn()} />
                    </ViewportContext.Provider>
                </SelectEntityContext.Provider>
            </EditModeContext.Provider>
        </ErdDocumentsHolderContext.Provider>
    );

    return { dispatchSelectAction, viewport };
};

// jsdom は :focus-visible を扱えないため、フォーカス起点 (キーボード / ポインタ) を matches のスタブで表現する
const stubFocusVisible = (focusVisible: boolean) => {
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string) {
        return (selector === ":focus-visible") && focusVisible;
    });
};

describe("ErdTableView のフォーカスによる選択", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test("キーボードでフォーカスされたテーブルを単一選択にし、見える位置へ viewport を移動する", () => {
        stubFocusVisible(true);
        const { dispatchSelectAction, viewport } = renderTable();

        fireEvent.focus(document.getElementById("table-1") as HTMLElement);

        expect(dispatchSelectAction).toHaveBeenCalledWith(
            { type: "bulk", tableIds: ["table-1"], memoIds: [], withMultiSelection: false }
        );
        expect(viewport.ensureVisible).toHaveBeenCalledWith(expect.anything(), { x: 20, y: 40 });
    });

    test("マウス操作によるフォーカスでは選択も viewport の移動も行わない", () => {
        stubFocusVisible(false);
        const { dispatchSelectAction, viewport } = renderTable();

        fireEvent.focus(document.getElementById("table-1") as HTMLElement);

        expect(dispatchSelectAction).not.toHaveBeenCalled();
        expect(viewport.ensureVisible).not.toHaveBeenCalled();
    });

    test("すでに唯一の選択であるテーブルへキーボードでフォーカスしても、選択は変更しない", () => {
        stubFocusVisible(true);
        const selectState: SelectState = {
            status: "selected", tableIds: new Set(["table-1"]), memoIds: new Set()
        };
        const { dispatchSelectAction } = renderTable(selectState);

        fireEvent.focus(document.getElementById("table-1") as HTMLElement);

        expect(dispatchSelectAction).not.toHaveBeenCalled();
    });

    test("テーブルにはキーボードで到達できる", () => {
        renderTable();

        expect(document.getElementById("table-1")?.tabIndex).toBe(0);
    });

    test("パースペクティブ外で表示されていないテーブルは Tab の対象にしない", () => {
        renderTable(SelectState.NONE, false);

        expect(document.getElementById("table-1")?.tabIndex).toBe(-1);
    });
});
