import { CanvasViewport } from "~/context/ViewportContext";
import PerspectiveModel from "~/models/PerspectiveModel";
import RectangleViewModel from "~/models/RectangleViewModel";
import { ERD_TABLE_VIEW_CLASS_NAME } from "~/features/canvas/ErdTableView";
import { ERD_MEMO_VIEW_CLASS_NAME } from "~/features/canvas/StickyMemoView";

/**
 * ErdCanvas 内部専用モジュール。外部からの import は禁止 (ESLint no-restricted-imports で検査)。
 *
 * Canvas に描画されているテーブル・メモの矩形情報の収集と、矩形選択の判定。
 */

export type RectangleArea = {
    tableRectangles: Map<string, RectangleViewModel>,
    memoRectangles: Map<string, RectangleViewModel>
};

export const initRectangleArea = (erdCanvas: HTMLDivElement, viewport: CanvasViewport): RectangleArea => {
    const tableRectangles = new Map<string, RectangleViewModel>();
    const memoRectangles = new Map<string, RectangleViewModel>();

    Array.from(erdCanvas.children).forEach(element => {
        if (element.tagName === "svg") {
            return;
        }

        const tableElements = element.getElementsByClassName(ERD_TABLE_VIEW_CLASS_NAME);
        if ((tableElements != null) && (tableElements.length > 0)) {
            const rectangle = initRectangleWithoutScale(tableElements[0], viewport);
            tableRectangles.set(tableElements[0].id, rectangle);
        }

        const memoElements = element.getElementsByClassName(ERD_MEMO_VIEW_CLASS_NAME);
        if ((memoElements != null) && (memoElements.length > 0)) {
            const rectangle = initRectangleWithoutScale(memoElements[0], viewport);
            memoRectangles.set(memoElements[0].id, rectangle);
        }
    });

    return { tableRectangles, memoRectangles };
};

const initRectangleWithoutScale = (element: Element, viewport: CanvasViewport) => {
    const elementRect = element.getBoundingClientRect();
    const { viewportPosition, screenCenter, scale: currentScale } = viewport.getViewInfo();

    return new RectangleViewModel({
        positionX: (elementRect.left - screenCenter.x) / currentScale + viewportPosition.centerX,
        positionY: (elementRect.top - screenCenter.y) / currentScale + viewportPosition.centerY,
        width: elementRect.width / currentScale,
        height: elementRect.height / currentScale
    });
};

export const doFindRectangleSelected = (
    selectedArea: RectangleViewModel, rectangles: Map<string, RectangleViewModel>, perspective: PerspectiveModel | null
) =>
    Array.from(rectangles.entries())
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .filter(([_rectangleId, rectangle]) => selectedArea.contains(rectangle))
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .filter(([rectangleId, _rectangle]) => (perspective == null) || perspective.containsModel(rectangleId))
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(([rectangleId, _rectangle]) => rectangleId);
