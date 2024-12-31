import { v4 as uuidV4 } from 'uuid';
import { PropertyNotExistsError } from '~/models/exceptions';
import RectangleViewModel from '~/models/RectangleViewModel';

type MemoViewModelOptions = {
    memoId: string;
    memo: string;
    rectangleViewModel: RectangleViewModel;
    verticalAlign?: AlignType;
    horizontalAlign?: AlignType;
    fontSize?: number;
    createdAt?: Date | null;
};

export type AlignType = "start" | "center" | "end";

const DEFAULT_VERTICAL_ALIGN = "center";
const DEFAULT_HORIZONTAL_ALIGN = "center";
const DEFAULT_FONT_SIZE = 9;

export default class MemoViewModel {

    public readonly memoId: string;
    public readonly memo: string;
    public readonly rectangleViewModel: RectangleViewModel;
    public readonly verticalAlign: AlignType;
    public readonly horizontalAlign: AlignType;
    public readonly fontSize: number;
    public readonly createdAt: Date;

    private constructor({
        memoId, memo, rectangleViewModel,
        verticalAlign = DEFAULT_VERTICAL_ALIGN, horizontalAlign = DEFAULT_HORIZONTAL_ALIGN,
        fontSize = DEFAULT_FONT_SIZE, createdAt = null
    }: MemoViewModelOptions) {
        this.memoId = memoId;
        this.memo = memo;
        this.rectangleViewModel = rectangleViewModel;
        this.verticalAlign = verticalAlign;
        this.horizontalAlign = horizontalAlign;
        this.fontSize = (fontSize >= 1) ? fontSize : 1;
        this.createdAt = createdAt ? createdAt : new Date();
    }

    public static create({ rectangleViewModel }: { rectangleViewModel: RectangleViewModel }): MemoViewModel {
        return new MemoViewModel({
            memoId: uuidV4(),
            memo: "",
            rectangleViewModel: rectangleViewModel
        });
    }

    public updateMemo(memo: string): MemoViewModel {
        const nextMemo = memo.trim();
        if (this.memo === nextMemo) {
            return this;
        }

        return new MemoViewModel({ ...this, memo: nextMemo });
    }

    public updateRectangleView(nextRectangle: RectangleViewModel): MemoViewModel {
        if (nextRectangle.isEqual(this.rectangleViewModel)) {
            return this;
        }

        return new MemoViewModel({ ...this, rectangleViewModel: nextRectangle });
    }

    public updateVerticalAlign(nextVerticalAlign: AlignType): MemoViewModel {
        if (this.verticalAlign === nextVerticalAlign) {
            return this;
        }

        return new MemoViewModel({ ...this, verticalAlign: nextVerticalAlign });
    }

    public updateHorizontalAlign(nextHorizontalAlign: AlignType): MemoViewModel {
        if (this.horizontalAlign === nextHorizontalAlign) {
            return this;
        }

        return new MemoViewModel({ ...this, horizontalAlign: nextHorizontalAlign });
    }

    public updateFontSize(nextFontSize: number): MemoViewModel {
        if ((this.fontSize === nextFontSize) || (nextFontSize < 1)) {
            return this
        }

        return new MemoViewModel({ ...this, fontSize: nextFontSize });
    }

    public toJSON(): Record<string, unknown> {
        return {
            memoId: this.memoId,
            memo: this.memo,
            rectangleViewModel: this.rectangleViewModel.toJSON(),
            verticalAlign: this.verticalAlign,
            horizontalAlign: this.horizontalAlign,
            fontSize: this.fontSize,
            createdAt: this.createdAt
        };
    }

    public static toObject(obj: object): MemoViewModel {
        if (!("memoId" in obj)) {
            throw new PropertyNotExistsError("memoId", obj);
        }
        if (!("memo" in obj)) {
            throw new PropertyNotExistsError("memo", obj);
        }
        if (!("rectangleViewModel" in obj)) {
            throw new PropertyNotExistsError("rectangleViewModel", obj);
        }

        const verticalAlign = ("verticalAlign" in obj) ? (obj.verticalAlign as AlignType) : DEFAULT_VERTICAL_ALIGN;
        const horizontalAlign = ("horizontalAlign" in obj) ? (obj.horizontalAlign as AlignType) : DEFAULT_HORIZONTAL_ALIGN;
        const fontSize = ("fontSize" in obj) ? (obj.fontSize as number) : DEFAULT_FONT_SIZE;
        const createdAt = ("createdAt" in obj) ? (obj.createdAt as Date) : new Date();

        return new MemoViewModel({
            memoId: obj.memoId as string,
            memo: obj.memo as string,
            rectangleViewModel: RectangleViewModel.toObject(obj.rectangleViewModel as object),
            verticalAlign: verticalAlign,
            horizontalAlign: horizontalAlign,
            fontSize: fontSize,
            createdAt: createdAt
        });
    }
}