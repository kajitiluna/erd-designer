import { ERD_TABLE_VIEW_CLASS_NAME } from "~/features/canvas/ErdTableView";
import { ERD_MEMO_VIEW_CLASS_NAME } from "~/features/canvas/StickyMemoView";
import { getScroll } from "~/features/canvas/support";

export const calculateImageArea = (erdCanvas: HTMLElement) => {
    const { scrollX, scrollY } = getScroll();

    let leftEdge = Number.MAX_SAFE_INTEGER;
    let topEdge = Number.MAX_SAFE_INTEGER;
    let rightEdge = 0;
    let bottomEdge = 0;

    Array.from(erdCanvas.children).forEach(element => {
        if (element.tagName === "svg") {
            return;
        }

        const tableViewElements = element.getElementsByClassName(ERD_TABLE_VIEW_CLASS_NAME);
        if ((tableViewElements != null) && (tableViewElements.length > 0)) {
            const rectangle = tableViewElements[0].getBoundingClientRect()
            leftEdge = Math.min(leftEdge, rectangle.left + scrollX);
            topEdge = Math.min(topEdge, rectangle.top + scrollY);
            rightEdge = Math.max(rightEdge, rectangle.left + rectangle.width + scrollX);
            bottomEdge = Math.max(bottomEdge, rectangle.top + rectangle.height + scrollY);
        }

        const memoElements = element.getElementsByClassName(ERD_MEMO_VIEW_CLASS_NAME);
        if ((memoElements != null) && (memoElements.length > 0)) {
            const rectangle = memoElements[0].getBoundingClientRect()
            leftEdge = Math.min(leftEdge, rectangle.left + scrollX);
            topEdge = Math.min(topEdge, rectangle.top + scrollY);
            rightEdge = Math.max(rightEdge, rectangle.left + rectangle.width + scrollX);
            bottomEdge = Math.max(bottomEdge, rectangle.top + rectangle.height + scrollY);
        }
    });

    return { leftEdge, topEdge, rightEdge, bottomEdge };
};