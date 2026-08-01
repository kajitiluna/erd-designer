/**
 * Storage クラス群で共通の一致判定ロジック。
 */

/**
 * モデルID をキーとするマップ同士の一致判定。
 * サイズが同じで、全キーについて相手側にも同じキーが存在し、モデルの equals() が成立する場合に一致とみなす。
 */
export function equalsModelMap<MODEL extends { equals(other: MODEL): boolean }>(
    thisMap: ReadonlyMap<string, MODEL>, otherMap: ReadonlyMap<string, MODEL>
): boolean {
    if (thisMap.size !== otherMap.size) {
        return false;
    }

    return Array.from(thisMap.entries()).every(([modelId, model]) => {
        const otherModel = otherMap.get(modelId);
        return (otherModel != null) && model.equals(otherModel);
    });
}

/**
 * next の各エントリについて、同じキーの previous エントリと equals() が真であれば
 * previous 側のインスタンスへ差し替える。全エントリが previous 側へ差し替わった場合は
 * previous のマップ参照をそのまま返す。
 */
export function reuseModelMap<MODEL extends { equals(other: MODEL): boolean }>(
    previousMap: ReadonlyMap<string, MODEL>, nextMap: ReadonlyMap<string, MODEL>
): ReadonlyMap<string, MODEL> {
    let allReused = (previousMap.size === nextMap.size);

    const entries = Array.from(nextMap.entries()).map(([modelId, nextModel]): [string, MODEL] => {
        const previousModel = previousMap.get(modelId);
        if ((previousModel != null) && previousModel.equals(nextModel)) {
            return [modelId, previousModel];
        }

        allReused = false;
        return [modelId, nextModel];
    });

    return allReused ? previousMap : new Map(entries);
}

/**
 * 要素数・並び順が同じであれば previous の配列参照を再利用する。
 */
export function reuseIdSequence(previousIds: readonly string[], nextIds: readonly string[]): readonly string[] {
    return equalsIdSequence(previousIds, nextIds) ? previousIds : nextIds;
}

/**
 * ID 配列同士の一致判定 (順序を含めて比較する)。
 */
export function equalsIdSequence(thisIds: readonly string[], otherIds: readonly string[]): boolean {
    if (thisIds.length !== otherIds.length) {
        return false;
    }

    return thisIds.every((thisId, index) => (thisId === otherIds[index]));
}
