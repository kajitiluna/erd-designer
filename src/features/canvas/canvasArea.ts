import { ERD_RELATION_PATH_CLASS_NAME } from "~/features/canvas/ErdRelationPathView";
import { ERD_TABLE_VIEW_CLASS_NAME } from "~/features/canvas/ErdTableView";
import { ERD_RELATION_LABEL_CLASS_NAME } from "~/features/canvas/RelationLabelOverlay";
import { ERD_MEMO_VIEW_CLASS_NAME } from "~/features/canvas/StickyMemoView";
import { getScroll } from "~/features/canvas/support";

export const calculateImageArea = (erdCanvas: HTMLElement) => {
    let bounding = {
        leftEdge: Number.MAX_SAFE_INTEGER,
        topEdge: Number.MAX_SAFE_INTEGER,
        rightEdge: Number.MIN_SAFE_INTEGER,
        bottomEdge: Number.MIN_SAFE_INTEGER,
    };

    Array.from(erdCanvas.children).forEach(element => {
        const tableViewElements = element.getElementsByClassName(ERD_TABLE_VIEW_CLASS_NAME);
        if ((tableViewElements != null) && (tableViewElements.length > 0)) {
            bounding = calculateBoundingRect(tableViewElements[0], bounding);
        }

        const memoElements = element.getElementsByClassName(ERD_MEMO_VIEW_CLASS_NAME);
        if ((memoElements != null) && (memoElements.length > 0)) {
            bounding = calculateBoundingRect(memoElements[0], bounding);
        }

        const relationPathElements = element.getElementsByClassName(ERD_RELATION_PATH_CLASS_NAME);
        if ((relationPathElements != null) && (relationPathElements.length > 0)) {
            for (let index = 0; index < relationPathElements.length; index++) {
                bounding = calculateBoundingRect(relationPathElements[index], bounding);
            }
        }

        const relationLabelElements = element.getElementsByClassName(ERD_RELATION_LABEL_CLASS_NAME);
        if ((relationLabelElements != null) && (relationLabelElements.length > 0)) {
            for (let index = 0; index < relationLabelElements.length; index++) {
                bounding = calculateBoundingRect(relationLabelElements[index], bounding);
            }
        }
    });

    const { scrollX, scrollY } = getScroll();

    if ((bounding.leftEdge > bounding.rightEdge) || (bounding.topEdge > bounding.bottomEdge)) {
        return { leftEdge: 0, topEdge: 0, rightEdge: 100, bottomEdge: 100 };
    }

    return {
        leftEdge: bounding.leftEdge + scrollX,
        topEdge: bounding.topEdge + scrollY,
        rightEdge: bounding.rightEdge + scrollX,
        bottomEdge: bounding.bottomEdge + scrollY
    };
};

const calculateBoundingRect = (
    element: Element, previous: { leftEdge: number, topEdge: number, rightEdge: number, bottomEdge: number }
) => {
    const rectangle = element.getBoundingClientRect()

    return {
        leftEdge: Math.min(previous.leftEdge, rectangle.left),
        topEdge: Math.min(previous.topEdge, rectangle.top),
        rightEdge: Math.max(previous.rightEdge, rectangle.right),
        bottomEdge: Math.max(previous.bottomEdge, rectangle.bottom),
    };
};