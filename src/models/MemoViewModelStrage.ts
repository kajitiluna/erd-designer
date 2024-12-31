import MemoViewModel from "~/models/MemoViewModel";

type MemoPosition = "front" | "back";

export default class MemoViewModelStrage {

    private memoIdMap: Map<string, MemoViewModel>;
    private foregroundIds: readonly string[];
    private backgroundIds: readonly string[];

    private constructor(
        memoIdMap: Map<string, MemoViewModel>,
        foregroundIds: readonly string[],
        backgroundIds: readonly string[]
    ) {
        this.memoIdMap = new Map(memoIdMap);
        this.foregroundIds = foregroundIds;
        this.backgroundIds = backgroundIds;
    }

    public static create(foregroundMemos: MemoViewModel[], backgroundMemos: MemoViewModel[]): MemoViewModelStrage {
        return new MemoViewModelStrage(
            new Map(foregroundMemos.concat(backgroundMemos).map(memo => [memo.memoId, memo])),
            foregroundMemos.map(memo => memo.memoId),
            backgroundMemos.map(memo => memo.memoId)
        );
    }

    public find(memoId: string): MemoViewModel | null {
        return this.memoIdMap.get(memoId) || null;
    }

    public getMemos() {
        const fronts = this.foregroundIds
            .map(memoId => this.memoIdMap.get(memoId))
            .filter((memo): memo is MemoViewModel => memo != null);
        const backs = this.backgroundIds
            .map(memoId => this.memoIdMap.get(memoId))
            .filter((memo): memo is MemoViewModel => memo != null);

        return { frontMemoViewModels: fronts, backMemoViewModels: backs };
    }

    public addMemo(addingMemo: MemoViewModel, position: MemoPosition = "front"): MemoViewModelStrage {
        const nextMemoIdMap = new Map(this.memoIdMap);
        nextMemoIdMap.set(addingMemo.memoId, addingMemo);

        const nextFronts = (position === "front") ? [...this.foregroundIds, addingMemo.memoId] : this.foregroundIds;
        const nextBacks = (position === "back") ? [addingMemo.memoId, ...this.backgroundIds] : this.backgroundIds;

        return new MemoViewModelStrage(nextMemoIdMap, nextFronts, nextBacks);
    }

    public updateMemo(updatingMemo: MemoViewModel): MemoViewModelStrage {
        const nextMemoIdMap = new Map(this.memoIdMap);
        nextMemoIdMap.set(updatingMemo.memoId, updatingMemo);

        return new MemoViewModelStrage(nextMemoIdMap, this.foregroundIds, this.backgroundIds);
    }

    public deleteMemo(memoId: string): MemoViewModelStrage {
        const nextMemoIdMap = new Map(this.memoIdMap);
        const deleted = nextMemoIdMap.delete(memoId);
        if (deleted === false) {
            return this;
        }

        const frontIndex = this.foregroundIds.indexOf(memoId);
        const backIndex = (frontIndex < 0) ? this.backgroundIds.indexOf(memoId) : -1;

        const nextFronts = (frontIndex >= 0) ? this.foregroundIds.slice(frontIndex, 1) : this.foregroundIds;
        const nextBacks = (backIndex >= 0) ? this.backgroundIds.slice(backIndex, 1) : this.backgroundIds;

        return new MemoViewModelStrage(nextMemoIdMap, nextFronts, nextBacks);
    }

    public moveMemo(memoId: string, position: MemoPosition): MemoViewModelStrage {
        const targetMemo = this.memoIdMap.get(memoId);
        if (targetMemo == null) {
            return this;
        }

        const frontIndex = this.foregroundIds.indexOf(memoId);
        if ((position === "front") && (frontIndex === this.foregroundIds.length - 1)) {
            return this;
        }

        const backIndex = (frontIndex < 0) ? this.backgroundIds.indexOf(memoId) : -1;
        if ((position === "back") && (backIndex === 0)) {
            return this;
        }

        const nextFronts = (frontIndex >= 0) ? removeElement(this.foregroundIds, frontIndex) : this.foregroundIds;
        const nextBacks = (backIndex >= 0) ? removeElement(this.backgroundIds, backIndex) : this.backgroundIds;

        return new MemoViewModelStrage(
            this.memoIdMap,
            ((position === "front") ? [...nextFronts, memoId] : nextFronts),
            ((position === "back") ? [memoId, ...nextBacks] : nextBacks)
        );
    }
}

const removeElement = <TYPE>(array: TYPE[] | readonly TYPE[], index: number) => {
    if (array.length === 0) {
        return [];
    }

    if ((index < 0) || (index >= array.length)) {
        return array;
    }

    const nextArray = [...array];
    nextArray.splice(index, 1);
    return nextArray;
}