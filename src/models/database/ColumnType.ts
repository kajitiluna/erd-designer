import { PropertyNotExistsError } from '~/models/exceptions';

type ColumnTypeOptions = {
    id: number,
    name: string,
    description: string,
    baseQuery: string,
    withPrecision?: boolean,
    withScale?: boolean,
    withUnsigned?: boolean,
    withAutoIncrement?: boolean,
    foreignColumn?: ColumnType | null,
    defaultValueCandidates?: string[]
}

export default class ColumnType {

    public static readonly EMPTY = new ColumnType({
        id: 0, name: "", description: "", baseQuery: "", withPrecision: false, withScale: false
    });

    public readonly id: number;
    public readonly name: string;
    public readonly description: string;
    public readonly baseQuery: string;
    public readonly withPrecision: boolean;
    public readonly withScale: boolean;
    public readonly withUnsigned: boolean;
    public readonly withAutoIncrement: boolean;
    public readonly foreignColumn: ColumnType | null;
    private readonly defaultValueCandidates: string[];

    /**
     * コンストラクタ。
     * 
     * @param id 型ID (データベース間の互換に用いる)
     * @param name 型定義
     * @param description 型の説明
     * @param baseQuery クエリ定義 (`[[PARAM]]` をクエリ作成時に `(precision, scale)` に変換する)
     * @param withPrecision precision の設定が可能な型か
     * @param withScale scale の設定が可能な型か
     * @param withUnsigned unsigned の設定が可能な型か
     * @param withAutoIncrement auto_increment の設定が可能な型か
     * @param foreignColumn 外部キー参照時の型 (null の場合は元の型と同じ)
     * @param defaultValueCandidates デフォルト値候補
     */
    constructor({
        id, name, description, baseQuery,
        withPrecision = false, withScale = false,
        withUnsigned = false, withAutoIncrement = false,
        foreignColumn = null, defaultValueCandidates = []
    }: ColumnTypeOptions) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.baseQuery = baseQuery;
        this.withPrecision = withPrecision;
        this.withScale = withScale;
        this.withUnsigned = withUnsigned;
        this.withAutoIncrement = withAutoIncrement;
        this.foreignColumn = (foreignColumn != null) ? foreignColumn : null;
        this.defaultValueCandidates = defaultValueCandidates;
    }

    public specifiedType({
        precision = "", scale = "", isArray = false, inChildRelation = false
    }): string {
        if (this.foreignColumn && inChildRelation) {
            return this.foreignColumn.specifiedType({ precision, scale, isArray });
        }

        if (this.baseQuery.indexOf("[[PARAM]]") < 0) {
            return this.baseQuery + (isArray ? "[]" : "");
        }

        const param = this.initTypeParam(precision, scale);
        return this.baseQuery.replace("[[PARAM]]", param) + (isArray ? "[]" : "");
    }

    public candidateDefaultValues(precision: string, scale: string): string[] {
        return this.defaultValueCandidates.map(candidate => {
            if (candidate.indexOf("[[PARAM]]") < 0) {
                return candidate;
            }

            const param = this.initTypeParam(precision, scale);
            return candidate.replaceAll("[[PARAM]]", param);
        });
    }

    private initTypeParam(precision: string, scale: string) {
        return (scale && this.withScale)
            ? `(${precision}, ${scale})`
            : ((precision && this.withPrecision) ? `(${precision})` : "");
    }

    public toJSON(): Record<string, unknown> {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            baseQuery: this.baseQuery,
            withPrecision: this.withPrecision,
            withScale: this.withScale,
            withUnsigned: this.withUnsigned,
            withAutoIncrement: this.withAutoIncrement,
            ...((this.foreignColumn != null) && { foreignColumn: this.foreignColumn.toJSON() }),
            defaultValueCandidates: this.defaultValueCandidates
        };
    }

    public static toObject(obj: object): ColumnType {
        if (!("id" in obj)) {
            throw new PropertyNotExistsError("id", obj);
        }
        if (!("name" in obj)) {
            throw new PropertyNotExistsError("name", obj);
        }
        if (!("description" in obj)) {
            throw new PropertyNotExistsError("description", obj);
        }
        if (!("baseQuery" in obj)) {
            throw new PropertyNotExistsError("baseQuery", obj);
        }
        if (!("withPrecision" in obj)) {
            throw new PropertyNotExistsError("withPrecision", obj);
        }
        if (!("withScale" in obj)) {
            throw new PropertyNotExistsError("withScale", obj);
        }
        if (!("withUnsigned" in obj)) {
            throw new PropertyNotExistsError("withUnsigned", obj);
        }

        // 過去バージョンに typo があったので、互換性のために以下のように処理する
        const withAutoIncrement = ("withAutoIncrement" in obj)
            ? (obj.withAutoIncrement as boolean)
            : (("withAuthIncrement" in obj) ? (obj.withAuthIncrement as boolean) : false);

        const foreignColumn = (("foreignColumn" in obj) && (obj.foreignColumn != null))
            ? ColumnType.toObject(obj.foreignColumn as object) : null;
        const defaultValueCandidates = ("defaultValueCandidates" in obj)
            ? (obj.defaultValueCandidates as string[]) : [];

        return new ColumnType({
            id: obj.id as number,
            name: obj.name as string,
            description: obj.description as string,
            baseQuery: obj.baseQuery as string,
            withPrecision: obj.withPrecision as boolean,
            withScale: obj.withScale as boolean,
            withUnsigned: obj.withUnsigned as boolean,
            withAutoIncrement: withAutoIncrement,
            foreignColumn: foreignColumn,
            defaultValueCandidates: defaultValueCandidates
        });
    }

    public equals(other: ColumnType): boolean {
        return (
            (this.id === other.id) &&
            (this.name === other.name) &&
            (this.description === other.description) &&
            (this.baseQuery === other.baseQuery) &&
            (this.withPrecision === other.withPrecision) &&
            (this.withScale === other.withScale) &&
            (this.withUnsigned === other.withUnsigned) &&
            (this.withAutoIncrement === other.withAutoIncrement) &&
            (
                ((this.foreignColumn === null) && (other.foreignColumn === null))
                || ((this.foreignColumn !== null) && (other.foreignColumn !== null) &&
                    this.foreignColumn.equals(other.foreignColumn))
            ) &&
            (this.defaultValueCandidates.length === other.defaultValueCandidates.length) &&
            this.defaultValueCandidates.every((value, index) => (value === other.defaultValueCandidates[index]))
        );
    }

    public static migrateDefaultValueCandidates(source: ColumnType, latest: ColumnType, orgVersion: number) {
        if (source.name !== latest.name) {
            return source;
        }

        if (latest.defaultValueCandidates.length === 0) {
            return source;
        }

        // ColumnType に defaultValueCandidates プロパティを追加
        if (orgVersion < 20250612) {
            return new ColumnType({
                ...source,
                defaultValueCandidates: [...latest.defaultValueCandidates]
            });
        }

        // ColumnType の defaultValueCandidates プロパティに動的項目を追加
        if (orgVersion < 20260321) {
            const sourceCandidates = new Set(source.defaultValueCandidates);
            if (latest.defaultValueCandidates.some(candidate => !sourceCandidates.has(candidate))) {
                return new ColumnType({
                    ...source,
                    defaultValueCandidates: [...latest.defaultValueCandidates]
                });
            }
        }

        return source;
    }
}
