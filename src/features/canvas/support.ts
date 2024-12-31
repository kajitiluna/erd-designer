import { CardinalityType } from "~/models/database";

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
