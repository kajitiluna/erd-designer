import { OrthogonalDirection } from "~/models/LineViewModel";
import RelationViewModel from "~/models/RelationViewModel";
import EditAction from "~/features/canvas/EditAction";
import { RectangleArea } from "~/features/canvas/ErdCanvas/rectangle-area";
import PerspectiveSettingView from "~/features/editor/PerspectiveSettingView";
import RelationEditView from "~/features/editor/RelationEditView";
import TableEditView from "~/features/editor/TableEditView";

/**
 * ErdCanvas 内部専用モジュール。外部からの import は禁止 (ESLint no-restricted-imports で検査)。
 *
 * Canvas 上の編集操作 (テーブル・リレーション・パースペクティブ) に応じた編集ダイアログの表示。
 */
export const initEditView = (editAction: EditAction, rectangleArea: RectangleArea, onClose: () => void) => {
    if (editAction.editType === "none") {
        return (<></>);
    }

    if (editAction.editType === "table") {
        return (
            <TableEditView isOpen={editAction.editType === "table"}
                tableViewModel={editAction.tableView}
                onClose={onClose} />
        );
    }

    if (editAction.editType === "perspective") {
        return (
            <PerspectiveSettingView
                isOpen={editAction.editType === "perspective"}
                targetId={editAction.targetId}
                onClose={onClose} />
        );
    }

    if (editAction.editType === "relation") {
        // 自己関連かつ、新規作成か否かを判断する
        const relationView = doCreateSelfRelation(editAction, rectangleArea);

        return (
            <RelationEditView isOpen={editAction.editType === "relation"}
                relationViewModel={relationView}
                parentTableModel={editAction.parentTable}
                childTableModel={editAction.childTable}
                onClose={onClose} />
        );
    }

    return (<></>);
};

const doCreateSelfRelation = (editAction: EditAction & { editType: "relation" }, rectangleArea: RectangleArea) => {
    const lineView = editAction.relationView.lineViewModel;
    const parentTableId = editAction.parentTable.tableModelId;
    const childTableId = editAction.childTable.tableModelId;

    if ((parentTableId !== childTableId) || (lineView.orthogonalLines.length >= 3)) {
        return editAction.relationView;
    }

    const rectangle = rectangleArea.tableRectangles.get(parentTableId);
    if (rectangle == null) {
        return editAction.relationView;
    }

    const orthogonalLines: OrthogonalDirection[] = [
        { direction: "horizontal", position: rectangle.bottom - rectangle.height / 4 },
        { direction: "vertical", position: rectangle.right + 70 },
        { direction: "horizontal", position: rectangle.bottom + 70 },
        { direction: "vertical", position: rectangle.right - rectangle.width / 4 }
    ];
    const nextLineView = lineView.updateOrthogonalLines(orthogonalLines);

    return new RelationViewModel({ ...editAction.relationView, lineViewModel: nextLineView });
};
