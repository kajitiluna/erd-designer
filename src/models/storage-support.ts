/**
 * Storage クラス群で共通の一致判定ロジック。
 */

/**
 * モデルID をキーとするマップ同士の一致判定。
 * サイズが同じで、全キーについて相手側にも同じキーが存在し、モデルの equals() が成立する場合に一致とみなす。
 */
export function equalsModelMap<MODEL extends { equals(other: MODEL): boolean }>(
    thisMap: ReadonlyMap<string, MODEL>,
    otherMap: ReadonlyMap<string, MODEL>
): boolean {
    if (thisMap.size !== otherMap.size) {
        return false;
    }

    const entries = Array.from(thisMap.entries());
    return entries.every(([modelId, model]) => {
        const otherModel = otherMap.get(modelId);
        return (otherModel != null) && model.equals(otherModel);
    });
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
