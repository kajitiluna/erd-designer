import MemoViewModel from "~/models/MemoViewModel";
import { equalsIdSequence, equalsModelMap } from "~/models/storage-support";

type MemoDirection = "front" | "back";

export default class MemoViewModelStorage {

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

    public static create(foregroundMemos: MemoViewModel[], backgroundMemos: MemoViewModel[]): MemoViewModelStorage {
        return new MemoViewModelStorage(
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

    public addMemo(addingMemo: MemoViewModel, position: MemoDirection = "front"): MemoViewModelStorage {
        const nextMemoIdMap = new Map(this.memoIdMap);
        nextMemoIdMap.set(addingMemo.memoId, addingMemo);

        const nextFronts = (position === "front") ? [...this.foregroundIds, addingMemo.memoId] : this.foregroundIds;
        const nextBacks = (position === "back") ? [addingMemo.memoId, ...this.backgroundIds] : this.backgroundIds;

        return new MemoViewModelStorage(nextMemoIdMap, nextFronts, nextBacks);
    }

    public updateMemo(updatingMemo: MemoViewModel): MemoViewModelStorage {
        const nextMemoIdMap = new Map(this.memoIdMap);
        nextMemoIdMap.set(updatingMemo.memoId, updatingMemo);

        return new MemoViewModelStorage(nextMemoIdMap, this.foregroundIds, this.backgroundIds);
    }

    public deleteMemo(memoId: string): MemoViewModelStorage {
        const nextMemoIdMap = new Map(this.memoIdMap);
        const deleted = nextMemoIdMap.delete(memoId);
        if (deleted === false) {
            return this;
        }

        const frontIndex = this.foregroundIds.indexOf(memoId);
        const backIndex = (frontIndex < 0) ? this.backgroundIds.indexOf(memoId) : -1;

        const nextFronts = (frontIndex >= 0) ? removeElement(this.foregroundIds, frontIndex) : this.foregroundIds;
        const nextBacks = (backIndex >= 0) ? removeElement(this.backgroundIds, backIndex) : this.backgroundIds;

        return new MemoViewModelStorage(nextMemoIdMap, nextFronts, nextBacks);
    }

    public moveMemo(memoIds: Set<string>, moving: { x: number, y: number }): MemoViewModelStorage {
        const nextMemoIdMap = new Map(this.memoIdMap);
        memoIds.forEach(memoId => {
            const current = nextMemoIdMap.get(memoId);
            if (current == null) {
                return;
            }

            nextMemoIdMap.set(memoId, current.move(moving));
        });

        return new MemoViewModelStorage(nextMemoIdMap, this.foregroundIds, this.backgroundIds);
    }

    public arrangeMemo(memoId: string, direction: MemoDirection): MemoViewModelStorage {
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

        return new MemoViewModelStorage(
            this.memoIdMap,
            ((direction === "front") ? [...nextFronts, memoId] : nextFronts),
            ((direction === "back") ? [memoId, ...nextBacks] : nextBacks)
        );
    }

    public equals(other: MemoViewModelStorage): boolean {
        if (equalsModelMap(this.memoIdMap, other.memoIdMap) === false) {
            return false;
        }
        if (equalsIdSequence(this.foregroundIds, other.foregroundIds) === false) {
            return false;
        }

        return equalsIdSequence(this.backgroundIds, other.backgroundIds);
    }
}

const removeElement = <TYPE>(array: TYPE[] | readonly TYPE[], index: number) => {
    if (array.length === 0) {
        return array;
    }

    if ((index < 0) || (index >= array.length)) {
        return array;
    }

    return array.slice(0, index).concat(array.slice(index + 1));
}