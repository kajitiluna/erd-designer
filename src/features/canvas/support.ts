import { MouseEvent } from "react";

import { CardinalityType } from "~/models/database";

export const CANVAS_AREA = { width: 25000, height: 25000 } as const;
// 描画領域は CANVAS_AREA を下に、最大拡大率を表示しうるサイズにする
export const DRAWABLE_AREA = { width: CANVAS_AREA.width * 2, height: CANVAS_AREA.height * 2 } as const;

/**
 * displayScale の表示拡大率を無視した、論理的な点座標を取得する。
 * なお、論理的な点座標とは、キャンバス中央を (0, 0) とした座標を指す。
 * 
 * @param event マウスイベント
 * @param displayScale 表示拡大率
 * @returns 
 */
export const getLogicalMousePosition = (event: MouseEvent, displayScale: number) => {
    const logicalPosition = {
        x: (event.clientX + window.scrollX - DRAWABLE_AREA.width / 2) / displayScale,
        y: (event.clientY + window.scrollY - DRAWABLE_AREA.height / 2) / displayScale
    };

    const validatedX = Math.min(Math.max(CANVAS_AREA.width * (-1) / 2, logicalPosition.x), CANVAS_AREA.width / 2);
    const validatedY = Math.min(Math.max(CANVAS_AREA.height * (-1) / 2, logicalPosition.y), CANVAS_AREA.height / 2);

    return {
        x: Math.floor(validatedX * 100) / 100,
        y: Math.floor(validatedY * 100) / 100
    };
};

export const handlePreventMouseEvent = (event: React.MouseEvent) => event.stopPropagation();

/**
 * shift, ctrl, command キーいずれかが押下されているかを判定する。
 * 
 * @param event マウスイベント
 * @returns 複数選択許可時は true
 */
export const withMultiSelectKey = (event: React.MouseEvent): boolean => {
    return (event.shiftKey || event.ctrlKey || event.metaKey) ? true : false;
};

export const CARDINALITY_MARKER = {
    ONE: "cardinality_one",
    NONE_TO_ONE: "cardinality_none_to_one",
    NONE_TO_MANY: "cardinality_none_to_many",
    ONE_TO_MANY: "cardinality_one_to_many"
} as const;

const cardinalityMapping = {
    "1": CARDINALITY_MARKER.ONE,
    "0..1": CARDINALITY_MARKER.NONE_TO_ONE,
    "0..N": CARDINALITY_MARKER.NONE_TO_MANY,
    "1..N": CARDINALITY_MARKER.ONE_TO_MANY
};

export const toMarkerId = (cardinality: CardinalityType) => `url(#${cardinalityMapping[cardinality]})`;
