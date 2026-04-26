import React from "react";

import { getScroll } from "~/features/canvas/support";

type Point = { x: number; y: number };

/**
 * キャンバス上のマウス座標を論理座標に変換するためのクラス。
 * body の padding/margin 等の親要素オフセットを吸収し、
 * VSCode Webview とブラウザの両環境で一貫した動作を保証する。
 *
 * コンストラクタ時点でキャンバス要素の body オフセットを算出しキャッシュするため、
 * 高頻度ハンドラ (onMouseMove, ドラッグ等) でも reflow を発生させずに座標変換を行える。
 */
export class CanvasPositionResolver {

    private readonly canvasArea: { width: number; height: number };
    private readonly origin: Point;
    private readonly bodyOffset: Point;

    constructor(canvasElement: HTMLElement | null, canvasArea: { width: number; height: number }) {
        this.canvasArea = canvasArea;
        // DRAWABLE_AREA.width/2 = CANVAS_AREA.width の関係から origin = canvasArea
        this.origin = { x: canvasArea.width, y: canvasArea.height };
        this.bodyOffset = initBodyOffset(canvasElement, this.origin);
    }

    /**
     * 論理座標をキャンバス上の物理座標（スクロール可能な DOM 上の絶対位置）に変換する。
     * なお、論理座標とはキャンバス中央を (0, 0) とした座標を指す。
     *
     * @param logicalPosition 論理座標
     */
    public toPhysicalPosition(logicalPosition: Point): Point {
        return {
            x: logicalPosition.x + this.origin.x,
            y: logicalPosition.y + this.origin.y
        };
    }

    /**
     * displayScale の表示拡大率を無視した、論理的な点座標を取得する。
     * なお、論理的な点座標とは、キャンバス中央を (0, 0) とした座標を指す。
     *
     * @param event マウスイベント
     * @param displayScale 表示拡大率
     */
    public getLogicalPosition(event: React.MouseEvent | MouseEvent, displayScale: number): Point {
        const { scrollX, scrollY } = getScroll();

        const logicalX = (event.clientX + scrollX - this.bodyOffset.x - this.origin.x) / displayScale;
        const logicalY = (event.clientY + scrollY - this.bodyOffset.y - this.origin.y) / displayScale;

        const validatedX = Math.min(Math.max(this.canvasArea.width * (-1) / 2, logicalX), this.canvasArea.width / 2);
        const validatedY = Math.min(Math.max(this.canvasArea.height * (-1) / 2, logicalY), this.canvasArea.height / 2);

        return {
            x: Math.floor(validatedX * 100) / 100,
            y: Math.floor(validatedY * 100) / 100
        };
    }
}

const initBodyOffset = (canvasElement: HTMLElement | null, origin: Point): Point => {
    if (canvasElement == null) {
        return { x: 0, y: 0 };
    }

    const { scrollX, scrollY } = getScroll();
    const rect = canvasElement.getBoundingClientRect();

    // body の padding/margin による、キャンバス表示位置と理論位置の差分を算出する。
    // ブラウザ環境では通常 { x: 0, y: 0 }、VSCode Webview では body padding 分の値になる。
    return {
        x: rect.left + rect.width / 2 + scrollX - origin.x,
        y: rect.top + rect.height / 2 + scrollY - origin.y
    };
}

const CanvasPositionContext = React.createContext<CanvasPositionResolver>({} as CanvasPositionResolver);

export default CanvasPositionContext;
