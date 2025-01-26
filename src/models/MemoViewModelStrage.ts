import MemoViewModel from "~/models/MemoViewModel";

type MemoDirection = "front" | "back";

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
        const frontMemos = this.foregroundIds
            .map(memoId => this.memoIdMap.get(memoId))
            .filter((memo): memo is MemoViewModel => memo != null);
        const backMemos = this.backgroundIds
            .map(memoId => this.memoIdMap.get(memoId))
            .filter((memo): memo is MemoViewModel => memo != null);

        return { frontMemos, backMemos };
    }

    public addMemo(addingMemo: MemoViewModel, position: MemoDirection = "front"): MemoViewModelStrage {
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

    public moveMemo(memoIds: string[], moving: { x: number, y: number }): MemoViewModelStrage {
        const nextMemoIdMap = new Map(this.memoIdMap);
        memoIds.forEach(memoId => {
            const current = nextMemoIdMap.get(memoId);
            if (current == null) {
                return;
            }

            nextMemoIdMap.set(memoId, current.move(moving));
        });

        return new MemoViewModelStrage(nextMemoIdMap, this.foregroundIds, this.backgroundIds);
    }

    public arrangeMemo(memoId: string, direction: MemoDirection): MemoViewModelStrage {
        const targetMemo = this.memoIdMap.get(memoId);
        if (targetMemo == null) {
            return this;
        }

        const frontIndex = this.foregroundIds.indexOf(memoId);
        if ((direction === "front") && (this.foregroundIds.length > 0)
            && (frontIndex === this.foregroundIds.length - 1)) {
            return this;
        }

        const backIndex = (frontIndex < 0) ? this.backgroundIds.indexOf(memoId) : -1;
        if ((direction === "back") && (this.backgroundIds.length > 0) && (backIndex === 0)) {
            return this;
        }

        const nextFronts = (frontIndex >= 0) ? removeElement(this.foregroundIds, frontIndex) : this.foregroundIds;
        const nextBacks = (backIndex >= 0) ? removeElement(this.backgroundIds, backIndex) : this.backgroundIds;

        return new MemoViewModelStrage(
            this.memoIdMap,
            ((direction === "front") ? [...nextFronts, memoId] : nextFronts),
            ((direction === "back") ? [memoId, ...nextBacks] : nextBacks)
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