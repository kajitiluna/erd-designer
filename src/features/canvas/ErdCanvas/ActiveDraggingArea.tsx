import React from "react";
import { Box } from "@mui/material";

import ViewportContext from "~/context/ViewportContext";
import EditMode, { EditModeType } from "~/models/EditMode";
import RectangleViewModel from "~/models/RectangleViewModel";
import { DragState } from "~/models/DragState";
import { SelectState } from "~/models/SelectState";

/**
 * ErdCanvas 内部専用モジュール。外部からの import は禁止 (ESLint no-restricted-imports で検査)。
 */

const SELECTED_COLOR = "rgba(73, 76, 218, 0.2)";

type ActiveDraggingAreaProps = {
    editMode: EditMode,
    dragState: DragState,
    selectState: SelectState
};

// 矩形選択中のドラッグ領域の表示
const ActiveDraggingArea = ({ editMode, dragState, selectState }: ActiveDraggingAreaProps) => {
    const { viewport } = React.useContext(ViewportContext);

    if ((editMode !== EditModeType.SELECT) || (dragState.status !== "on_dragging")
        || (selectState.tableIds.size + selectState.memoIds.size !== 0)
        || (selectState.relationId != null)) {

        return (<></>);
    }

    const rectangle = RectangleViewModel.createFromPoints(dragState.start, dragState.current);
    const physicalPosition = viewport.toPhysicalPosition({ x: rectangle.left, y: rectangle.top });

    return (
        <Box sx={{
            position: "absolute",
            left: physicalPosition.x, top: physicalPosition.y,
            width: rectangle.width, height: rectangle.height,
            border: `1px solid ${SELECTED_COLOR}`,
            backgroundColor: SELECTED_COLOR
        }} />
    );
};

export default ActiveDraggingArea;