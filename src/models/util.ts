import { PropertyNotArrayError, PropertyNotExistsError, PropertyNotObjectError } from "~/models/exceptions";

/**
 * デコード対象のオブジェクトに指定プロパティが存在することを検証するアサーション関数。
 * 存在しない場合は PropertyNotExistsError を送出する。
 */
export function requireProperty<KEY extends string>(
    obj: object, propertyName: KEY
): asserts obj is Record<KEY, unknown> {
    if ((propertyName in obj) === false) {
        throw new PropertyNotExistsError(propertyName, obj);
    }
}

export function toObjects<OUTPUT_TYPE>(
    // oxlint-disable-next-line typescript/no-explicit-any
    obj: any, propertyName: string, convert: (item: object) => OUTPUT_TYPE
): OUTPUT_TYPE[] {
    if (isArray(obj) === false) {
        throw new PropertyNotArrayError(propertyName, obj);
    }

    if (obj.length === 0) {
        return [];
    }

    if (isObject(obj) === false) {
        throw new PropertyNotObjectError(propertyName, obj);
    }

    return obj.map((item: object) => convert(item));
}

// oxlint-disable-next-line typescript/no-explicit-any
function isArray(obj: any): obj is any[] {
    return Array.isArray(obj)
}

// oxlint-disable-next-line typescript/no-explicit-any
function isObject(obj: any[]): obj is object[] {
    return obj.every((item) => (typeof item === "object") && (item !== null));
}

// oxlint-disable-next-line typescript/no-explicit-any
export function toDateTime(org: any, defaultDate: Date | null = null): Date {
    if (org == null) {
        return defaultDate ?? new Date();
    }

    if (org instanceof Date) {
        return org;
    }

    if (typeof org === "string") {
        return new Date(org);
    }

    return new Date();
}

/**
 * Decides the names given to duplicated models.
 * A duplicate takes the original name plus a `_copy` suffix, with a sequence number
 * (`_copy2`, `_copy3`, ...) when that name is already taken.
 */
export class DuplicateName {

    private constructor() { /* do nothing */ }

    /**
     * Resolves the name of one duplicate.
     * An empty name stays empty: the original has no name to derive a copy name from.
     *
     * @param baseName name of the original
     * @param usedNames names already taken in the scope the duplicate is created in
     */
    public static resolve(baseName: string, usedNames: ReadonlySet<string>): string {
        if (baseName === "") {
            return baseName;
        }

        let sequence = 1;
        let candidate = toCandidate(baseName, sequence);
        while (usedNames.has(candidate) && (sequence < 99)) {
            sequence += 1;
            candidate = toCandidate(baseName, sequence);
        }

        return candidate;
    }

    /**
     * Resolves the names of several duplicates created in the same scope.
     * Each resolved name is treated as taken by the following entries, so entries never collide with each other.
     *
     * @param entries originals, identified by `id`
     * @param usedNames names already taken in the scope the duplicates are created in
     * @returns resolved name per `id`, and the taken names including the resolved ones
     */
    public static resolveEach(
        entries: readonly { id: string, name: string }[], usedNames: ReadonlySet<string>
    ): { sourceIdToDuplicatedNames: ReadonlyMap<string, string>, usedNames: Set<string> } {
        const initial = { sourceIdToDuplicatedNames: new Map<string, string>(), usedNames: new Set(usedNames) };

        return entries.reduce((state, entry) => {
            const duplicatedName = DuplicateName.resolve(entry.name, state.usedNames);
            const names = new Map(state.sourceIdToDuplicatedNames).set(entry.id, duplicatedName);
            const nextUsedNames = state.usedNames.add(duplicatedName);

            return { sourceIdToDuplicatedNames: names, usedNames: nextUsedNames };
        }, initial);
    }
}

const toCandidate = (baseName: string, sequence: number): string => {
    return (sequence === 1) ? `${baseName}_copy` : `${baseName}_copy${sequence}`;
};
