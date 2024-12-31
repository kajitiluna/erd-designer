import { instanceToPlain } from 'class-transformer';
import { PropertyNotExistsError } from '~/models/exceptions';

type QueryOptions = {
    precision?: string, scale?: string, onNotNull?: boolean, defaultValue?: string,
    onUnsign?: boolean, onAutoIncrement?: boolean
}

type ColumnTypeOptions = {
    id: number,
    name: string,
    description: string,
    baseQuery: string,
    withPrecision?: boolean,
    withScale?: boolean,
    withUnsigned?: boolean,
    withAuthIncrement?: boolean,
    foreignId?: number | null
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
    public readonly withAuthIncrement: boolean;
    public readonly foreignId: number;

    /**
     * コンストラクタ。
     * 
     * @param id 型ID (データベース間の互換に用いる)
     * @param name 型定義
     * @param description 型の説明
     * @param baseQuery クエリ定義 (`[[PARAM]]` をクエリ作成時に `(precision, sclae)` に変換する)
     * @param withPrecision precision の設定が可能な型か
     * @param withScale scale の設定が可能な型か
     * @param withUnsigned unsigned の設定が可能な型か
     * @param withAuthIncrement auto_increment の設定が可能な型か
     */
    constructor({
        id, name, description, baseQuery,
        withPrecision = false, withScale = false,
        withUnsigned = false, withAuthIncrement = false,
        foreignId = null
    }: ColumnTypeOptions) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.baseQuery = baseQuery;
        this.withPrecision = withPrecision;
        this.withScale = withScale;
        this.withUnsigned = withUnsigned;
        this.withAuthIncrement = withAuthIncrement;
        this.foreignId = (foreignId == null) ? id : foreignId;
    }

    query({
        precision = "", scale = "", onNotNull = false, defaultValue = "",
        onUnsign = false, onAutoIncrement = false
    }: QueryOptions): string {

        let query = this.specifiedType({ precision: precision, scale: scale });

        if (onUnsign) {
            query = query + " UNSIGNED";
        }
        if (onNotNull) {
            query = query + " NOT NULL";
        }
        if (onAutoIncrement) {
            query = query + " AUTO_INCREMENT";
        }
        if (defaultValue) {
            query = query + " DEFAULT " + defaultValue;
        }

        return query;
    }

    public specifiedType({ precision = "", scale = "" }): string {
        if (this.baseQuery.indexOf("[[PARAM]]") < 0) {
            return this.baseQuery;
        }

        const param = scale ? `(${precision}, ${scale})` : (precision ? `(${precision})` : "");
        return this.baseQuery.replace("[[PARAM]]", param);
    }

    public toJSON(): Record<string, unknown> {
        return instanceToPlain(this);
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
        if (!("withAuthIncrement" in obj)) {
            throw new PropertyNotExistsError("withAuthIncrement", obj);
        }

        return new ColumnType({
            id: obj.id as number,
            name: obj.name as string,
            description: obj.description as string,
            baseQuery: obj.baseQuery as string,
            withPrecision: obj.withPrecision as boolean,
            withScale: obj.withScale as boolean,
            withUnsigned: obj.withUnsigned as boolean,
            withAuthIncrement: obj.withAuthIncrement as boolean,
            foreignId: (("foreignId" in obj) ? obj.foreignId : obj.id) as number
        });
    }
}