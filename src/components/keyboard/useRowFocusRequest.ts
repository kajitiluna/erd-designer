import React from "react";

import useStateRef from "~/components/useStateRef";
import { rowKeyNavigation } from "~/components/keyboard/row-key-navigation";

type RowFocusRequest<CONTAINER extends HTMLElement> = {

    /** Attach to the element whose children are the rows. */
    containerRef: (element: CONTAINER | null) => void,

    /**
     * Focuses the row at `index` (clamped to the last row) once the update being made in the same event has rendered.
     * Rows removed or reordered by that update take focus with them, so the caller names the row to land on.
     */
    requestFocus: (index: number) => void
};

type FocusRequest = { index: number };

const useRowFocusRequest = <CONTAINER extends HTMLElement>(): RowFocusRequest<CONTAINER> => {
    const [container, containerRef] = useStateRef<CONTAINER>();
    const [focusRequest, setFocusRequest] = React.useState<FocusRequest | null>(null);

    // 要求ごとに新しいオブジェクトを積むので、同じ位置への連続した要求でも毎回この効果が走る。
    // ref を読まず state 経由にしているのは、描画中に呼ばれうるイベントハンドラから ref を触らないため。
    React.useEffect(() => {
        if (focusRequest == null) {
            return;
        }

        rowKeyNavigation.focusChildAt(container, focusRequest.index);
    }, [focusRequest, container]);

    const requestFocus = React.useCallback((index: number) => {
        setFocusRequest({ index });
    }, []);

    return { containerRef, requestFocus };
};

export default useRowFocusRequest;
