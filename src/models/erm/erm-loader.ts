import ColorValue from "~/models/ColorValue";
import ColumnType from "~/models/database/ColumnType";
import { CardinalityType, TableReferenceActionType } from "~/models/database/RelationModel";
import { TableIndexOption, TableIndexType } from "~/models/database/TableIndexSupport";
import { DatabaseType } from "~/models/database/DatabaseType";
import { ErmElement, ErmXmlParser } from "~/models/erm/erm-xml";
import { ErmSourceDatabase, resolveErmColumnType } from "~/models/erm/erm-sql-type";
import {
    ErmCategoryDefinition, ErmColumnDefinition, ErmColumnEntry, ErmColumnGroupDefinition,
    ErmIndexDefinition, ErmLoadResult, ErmLoadSummary, ErmNoteDefinition, ErmRelationDefinition,
    ErmTableDefinition, ErmUniqueKeyDefinition
} from "~/models/erm/support";

// 解決中の relation。<source>/<target> のどちらが親テーブルに対応するかは ERMaster の出力実装によって一貫しないため、
// 親子は生の2端点から一切決め打ちせず、doReduceColumn が <referenced_column> の所有テーブルを正として消去法で確定する。それまでは null。
type PendingErmRelation = {
    ermRelationId: string,
    endpointA: string,
    endpointB: string,
    relationName: string,
    parentCardinality: CardinalityType,
    childCardinality: CardinalityType,
    onUpdateAction: TableReferenceActionType,
    onDeleteAction: TableReferenceActionType,
    color: ColorValue,
    edges: { x: number, y: number }[],
    parentNodeId: string | null,
    childNodeId: string | null,
    columnPairs: { parentErmColumnId: string, childErmColumnId: string }[]
};

export const loadErm = (ermText: string): ErmLoadResult => {
    return new ErmLoader().load(ermText);
};

type ResolvedColumnType = {
    columnType: ColumnType,
    precision: string,
    scale: string,
    unsigned: boolean,
    physicalName: string,
    logicalName: string,
    description: string
};

const NUMERIC_ID = /^\d+$/;

const ERM_DATABASE_MAPPING: Record<string, { sourceDatabase: ErmSourceDatabase, databaseType: DatabaseType }> = {
    "MySQL": { sourceDatabase: "MySQL", databaseType: "mysql" },
    "PostgreSQL": { sourceDatabase: "PostgreSQL", databaseType: "postgres" },
    "SQLite": { sourceDatabase: "SQLite", databaseType: "sqlite" },
    "SQLServer": { sourceDatabase: "SQLServer", databaseType: "ms_sqlserver" },
    "SQLServer 2008": { sourceDatabase: "SQLServer 2008", databaseType: "ms_sqlserver" }
} as const;

// cSpell:ignore tablespace
const UNSUPPORTED_SECTIONS = [
    "tablespace_set", "test_data_list", "sequence_set", "trigger_set", "change_tracking_list"
] as const;

const EMPTY_STRING_PLACEHOLDERS = ["<EMPTY STRING>", "<空文字>", "<공백>"];
const CURRENT_TIME_PLACEHOLDERS = ["<CURRENT TIME>", "<現在日時>", "<현재일자>"];

class ErmLoader {

    private sourceDatabase: ErmSourceDatabase = "MySQL";
    private databaseType: DatabaseType = "mysql";
    private readonly summaries: ErmLoadSummary[] = [];
    private readonly wordDefinitions = new Map<string, ResolvedColumnType>();
    private readonly columnsById = new Map<string, ErmColumnDefinition>();
    private readonly relationsById = new Map<string, PendingErmRelation>();
    private readonly tables: ErmTableDefinition[] = [];
    private readonly columnGroups: ErmColumnGroupDefinition[] = [];
    private readonly relations: ErmRelationDefinition[] = [];
    private readonly notes: ErmNoteDefinition[] = [];
    private readonly categories: ErmCategoryDefinition[] = [];
    private readonly inheritedColumns = new Map<string, ErmColumnDefinition>();
    private readonly skippedViewNames: string[] = [];
    private skippedImageCount = 0;

    public load(ermText: string): ErmLoadResult {
        let root: ErmElement;
        try {
            root = ErmXmlParser.parse(ermText);
        } catch (error) {
            const message = (error instanceof Error) ? error.message : String(error);
            return this.toFailure("document", `Failed to parse .erm file: ${message}`);
        }

        if (root.tagName !== "diagram") {
            return this.toFailure("document", `Expected root element <diagram> but found <${root.tagName}>.`);
        }

        const resolvedDatabase = this.doResolveDatabase(root);
        if (resolvedDatabase == null) {
            return { outcome: "failure", summaries: this.summaries };
        }
        this.sourceDatabase = resolvedDatabase.sourceDatabase;
        this.databaseType = resolvedDatabase.databaseType;

        const dictionaryElement = ErmXmlParser.findChild(root, "dictionary");
        if (dictionaryElement != null) {
            this.doLoadDictionary(dictionaryElement);
        }

        const columnGroupsElement = ErmXmlParser.findChild(root, "column_groups");
        if (columnGroupsElement != null) {
            this.doLoadColumnGroups(columnGroupsElement);
        }

        const contentsElement = ErmXmlParser.findChild(root, "contents");
        if (contentsElement != null) {
            this.doLoadContents(contentsElement);
        }

        const settingsElement = ErmXmlParser.findChild(root, "settings");
        if (settingsElement != null) {
            this.doLoadCategorySettings(settingsElement);
        }

        this.doResolveForeignKeys();
        const tables = this.tables.map(table => this.doInheritTableColumns(table));
        const columnGroups = this.columnGroups.map(group => this.doInheritGroupColumns(group));
        this.doFinalizeSkippedSections(root);

        return {
            outcome: "success",
            databaseType: this.databaseType,
            summaries: this.summaries,
            tables,
            columnGroups,
            relations: this.relations,
            notes: this.notes,
            categories: this.categories
        };
    }

    private toFailure(target: string, message: string): ErmLoadResult {
        return { outcome: "failure", summaries: [...this.summaries, { result: "failure", target, message }] };
    }

    private doResolveDatabase(
        root: ErmElement
    ): { sourceDatabase: ErmSourceDatabase, databaseType: DatabaseType } | null {
        const settingsElement = ErmXmlParser.findChild(root, "settings");
        const rawDatabase = (settingsElement != null) ? ErmXmlParser.childText(settingsElement, "database") : "";

        const mapping = ERM_DATABASE_MAPPING[rawDatabase];
        if (mapping == null) {
            this.summaries.push({
                result: "failure",
                target: "settings",
                message: `Unsupported database "${rawDatabase}". erd-designer can only import .erm files for `
                    + `MySQL, PostgreSQL, SQLite, and SQL Server (SQLServer / SQLServer 2008).`
            });
            return null;
        }

        return mapping;
    }

    private doLoadDictionary(dictionaryElement: ErmElement): void {
        ErmXmlParser.findChildren(dictionaryElement, "word").forEach(wordElement => this.doLoadWord(wordElement));
    }

    private doLoadWord(wordElement: ErmElement): void {
        const wordId = ErmXmlParser.childText(wordElement, "id");
        const physicalName = ErmXmlParser.childText(wordElement, "physical_name");
        const sqlTypeId = ErmXmlParser.childText(wordElement, "type");

        const columnType = this.doResolveSqlType(sqlTypeId, `column type: ${physicalName}`);
        const length = ErmXmlParser.childInt(wordElement, "length", 0);
        const decimal = ErmXmlParser.childInt(wordElement, "decimal", 0);

        this.wordDefinitions.set(wordId, {
            columnType,
            precision: (columnType.withPrecision && (length > 0)) ? String(length) : "",
            scale: (columnType.withScale && (decimal > 0)) ? String(decimal) : "",
            unsigned: columnType.withUnsigned && ErmXmlParser.childBoolean(wordElement, "unsigned", false),
            physicalName,
            logicalName: ErmXmlParser.childText(wordElement, "logical_name"),
            description: ErmXmlParser.childText(wordElement, "description")
        });
    }

    // ERMaster の SqlType ID を解決する共通処理。id が空 (型未設定) の場合は警告なしで EMPTY を返す。
    private doResolveSqlType(sqlTypeId: string, warningTarget: string): ColumnType {
        if (sqlTypeId === "") {
            return ColumnType.EMPTY;
        }

        const columnType = resolveErmColumnType(this.databaseType, this.sourceDatabase, sqlTypeId);
        if (columnType === ColumnType.EMPTY) {
            this.summaries.push({
                result: "warning",
                target: warningTarget,
                message: `Could not resolve the column type "${sqlTypeId}" for ${this.sourceDatabase}.`
            });
        }

        return columnType;
    }

    private doLoadColumnGroups(columnGroupsElement: ErmElement): void {
        ErmXmlParser.findChildren(columnGroupsElement, "column_group")
            .forEach(groupElement => this.doLoadColumnGroup(groupElement));
    }

    private doLoadColumnGroup(groupElement: ErmElement): void {
        const ermGroupId = ErmXmlParser.childText(groupElement, "id");
        const columnsElement = ErmXmlParser.findChild(groupElement, "columns");
        const columns = ErmXmlParser.findChildren(columnsElement, "normal_column")
            .map(columnElement => this.doRegisterNormalColumn(columnElement, ""));

        this.columnGroups.push({ ermGroupId, groupName: ErmXmlParser.childText(groupElement, "group_name"), columns });
    }

    // <normal_column> を読み取り、FK 解決用の columnsById にも登録する。
    // column_group が直接所有する列と、テーブルが直接所有する列の両方から呼ばれる共通経路。
    private doRegisterNormalColumn(columnElement: ErmElement, ownerErmNodeId: string): ErmColumnDefinition {
        const column = this.doLoadNormalColumn(columnElement, ownerErmNodeId);
        this.columnsById.set(column.ermColumnId, column);

        return column;
    }

    private doLoadNormalColumn(columnElement: ErmElement, ownerErmNodeId: string): ErmColumnDefinition {
        const ermColumnId = ErmXmlParser.childText(columnElement, "id");
        const wordId = ErmXmlParser.childText(columnElement, "word_id");
        const wordDefinition = (wordId !== "") ? this.wordDefinitions.get(wordId) : null;
        const resolved = wordDefinition ?? this.doResolveInlineType(columnElement);

        const referencedColumnIds = ErmXmlParser.findChildren(columnElement, "referenced_column")
            .map(child => child.text)
            .filter(id => NUMERIC_ID.test(id));
        const relationIds = ErmXmlParser.findChildren(columnElement, "relation")
            .map(child => child.text)
            .filter(id => NUMERIC_ID.test(id));
        // 同一 ID の重複列挙は ERMaster 出力の冗長 (実ファイルで 4〜8 回の重複を確認)。
        // 複合 FK は列ごとに 1 回ずつ持つため、重複排除しても壊れない。残すと同じ列ペアが重複登録される。
        const uniqueReferencedColumnIds = Array.from(new Set(referencedColumnIds));
        const uniqueRelationIds = Array.from(new Set(relationIds));

        return {
            ermColumnId,
            ownerErmNodeId,
            physicalName: resolved.physicalName,
            logicalName: resolved.logicalName,
            columnType: resolved.columnType,
            precision: resolved.precision,
            scale: resolved.scale,
            unsigned: resolved.unsigned,
            description: resolved.description,
            notNull: ErmXmlParser.childBoolean(columnElement, "not_null", false),
            primaryKey: ErmXmlParser.childBoolean(columnElement, "primary_key", false),
            uniqueKey: ErmXmlParser.childBoolean(columnElement, "unique_key", false),
            autoIncrement: ErmXmlParser.childBoolean(columnElement, "auto_increment", false),
            defaultValue: normalizeErmDefaultValue(ErmXmlParser.childText(columnElement, "default_value")),
            characterSet: ErmXmlParser.childText(columnElement, "character_set"),
            collation: ErmXmlParser.childText(columnElement, "collation"),
            referencedColumnIds: uniqueReferencedColumnIds,
            relationIds: uniqueRelationIds
        };
    }

    // <word_id> が無い列 (FK 列を含む) は、<normal_column> 自身のインライン値のみが情報源。
    // length/decimal はここには存在しないため常に空文字となる。
    private doResolveInlineType(columnElement: ErmElement): ResolvedColumnType {
        const physicalName = ErmXmlParser.childText(columnElement, "physical_name");
        const sqlTypeId = ErmXmlParser.childText(columnElement, "type");
        const columnType = this.doResolveSqlType(sqlTypeId, `column: ${physicalName}`);

        return {
            columnType,
            precision: "",
            scale: "",
            unsigned: false,
            physicalName,
            logicalName: ErmXmlParser.childText(columnElement, "logical_name"),
            description: ErmXmlParser.childText(columnElement, "description")
        };
    }

    private doLoadContents(contentsElement: ErmElement): void {
        contentsElement.children.forEach(child => this.doLoadContentNode(child));
    }

    private doLoadContentNode(node: ErmElement): void {
        if (node.tagName === "table") {
            this.doLoadTable(node);
            return;
        }

        if (node.tagName === "view") {
            this.skippedViewNames.push(ErmXmlParser.childText(node, "physical_name"));
            return;
        }

        if (node.tagName === "note") {
            this.doLoadNote(node);
            return;
        }

        if (node.tagName === "image") {
            this.skippedImageCount++;
        }
    }

    private doLoadTable(tableElement: ErmElement): void {
        const ermNodeId = ErmXmlParser.childText(tableElement, "id");
        const physicalName = ErmXmlParser.childText(tableElement, "physical_name");

        const columnsElement = ErmXmlParser.findChild(tableElement, "columns");
        const columnEntries = this.doLoadColumnEntries(columnsElement, ermNodeId, physicalName);

        const indexesElement = ErmXmlParser.findChild(tableElement, "indexes");
        const indexes = this.doLoadIndexes(indexesElement);

        const uniqueKeysElement = ErmXmlParser.findChild(tableElement, "complex_unique_key_list");
        const uniqueKeys = (uniqueKeysElement != null) ? this.doLoadUniqueKeys(uniqueKeysElement) : [];

        const tablePropertiesElement = ErmXmlParser.findChild(tableElement, "table_properties");
        const schemaName = ErmXmlParser.childText(tablePropertiesElement, "schema");
        const characterSet = ErmXmlParser.childText(tablePropertiesElement, "character_set");
        const collation = ErmXmlParser.childText(tablePropertiesElement, "collation");

        const connectionsElement = ErmXmlParser.findChild(tableElement, "connections");
        if (connectionsElement != null) {
            this.doLoadConnections(connectionsElement);
        }

        this.tables.push({
            ermNodeId,
            physicalName,
            logicalName: ErmXmlParser.childText(tableElement, "logical_name"),
            description: ErmXmlParser.childText(tableElement, "description"),
            checkExpression: ErmXmlParser.childText(tableElement, "constraint"),
            optionExpression: ErmXmlParser.childText(tableElement, "option"),
            schemaName,
            characterSet,
            collation,
            location: {
                x: ErmXmlParser.childInt(tableElement, "x", 0),
                y: ErmXmlParser.childInt(tableElement, "y", 0)
            },
            headerColor: parseErmColor(ErmXmlParser.findChild(tableElement, "color"), ColorValue.WHITE),
            columnEntries,
            indexes,
            uniqueKeys
        });

        this.summaries.push({ result: "success", target: `table: ${physicalName}`, message: "" });
    }

    private doLoadColumnEntries(
        columnsElement: ErmElement | null, ownerErmNodeId: string, tableName: string
    ): ErmColumnEntry[] {
        if (columnsElement == null) {
            return [];
        }

        return columnsElement.children.flatMap((child): ErmColumnEntry[] => {
            if (child.tagName === "column_group") {
                return [{ kind: "group", ermGroupId: child.text }];
            }

            if (child.tagName === "normal_column") {
                return [{ kind: "single", column: this.doRegisterNormalColumn(child, ownerErmNodeId) }];
            }

            this.summaries.push({
                result: "warning", target: `table: ${tableName}`,
                message: `Unexpected element <${child.tagName}> inside <columns> was skipped.`
            });

            return [];
        });
    }

    // cSpell:ignore inidex
    // <inidex> は原典の綴りミスであり、参照実装はタグ名を検査せず <indexes> の子要素すべてをインデックスとして扱う。
    // ここでも同じ寛容さで tagName を問わず処理する。
    private doLoadIndexes(indexesElement: ErmElement | null): ErmIndexDefinition[] {
        if (indexesElement == null) {
            return [];
        }

        return indexesElement.children.map(indexElement => this.doLoadSingleIndex(indexElement));
    }

    private doLoadSingleIndex(indexElement: ErmElement): ErmIndexDefinition {
        const fullText = ErmXmlParser.childBoolean(indexElement, "full_text", false);
        const nonUnique = ErmXmlParser.childBoolean(indexElement, "non_unique", true);
        const rawType = ErmXmlParser.childText(indexElement, "type");
        const indexType = ((rawType === "") || (rawType === "null")) ? "" : (rawType as TableIndexType);
        const indexOption = (fullText ? "FULLTEXT" : (nonUnique ? "" : "UNIQUE")) as TableIndexOption;

        const columnsElement = ErmXmlParser.findChild(indexElement, "columns");
        const columns = ErmXmlParser.findChildren(columnsElement, "column")
            .map(columnElement => {
                return {
                    ermColumnId: ErmXmlParser.childText(columnElement, "id"),
                    descending: ErmXmlParser.childBoolean(columnElement, "desc", true)
                };
            });

        return {
            physicalName: ErmXmlParser.childText(indexElement, "name"),
            indexOption,
            indexType,
            description: ErmXmlParser.childText(indexElement, "description"),
            columns
        };
    }

    private doLoadUniqueKeys(listElement: ErmElement | null): ErmUniqueKeyDefinition[] {
        if (listElement == null) {
            return [];
        }

        return ErmXmlParser.findChildren(listElement, "complex_unique_key").map(keyElement => {
            const columnsElement = ErmXmlParser.findChild(keyElement, "columns");
            const columnIds = ErmXmlParser.findChildren(columnsElement, "column")
                .map(columnElement => ErmXmlParser.childText(columnElement, "id"));

            return { physicalName: ErmXmlParser.childText(keyElement, "name"), columnIds };
        });
    }

    // <relation> はテーブルを跨いで直接テーブル間の参照を持つが、<comment_connection> は
    // 装飾用の注釈矢印であり FK 的な意味を持たないため読み飛ばす。
    private doLoadConnections(connectionsElement: ErmElement): void {
        ErmXmlParser.findChildren(connectionsElement, "relation")
            .forEach(relationElement => this.doLoadRelation(relationElement));
    }

    private doLoadRelation(relationElement: ErmElement): void {
        const ermRelationId = ErmXmlParser.childText(relationElement, "id");
        const relationName = ErmXmlParser.childText(relationElement, "name");

        const referencedComplexUniqueKey = ErmXmlParser.childText(relationElement, "referenced_complex_unique_key");
        if ((referencedComplexUniqueKey !== "") && (referencedComplexUniqueKey !== "null")) {
            this.summaries.push({
                result: "warning", target: `relation: ${relationName}`,
                message: "A relation referencing a complex unique key as its foreign key target is not "
                    + "supported by erd-designer and was skipped."
            });

            return;
        }

        const endpointA = ErmXmlParser.childText(relationElement, "source");
        const endpointB = ErmXmlParser.childText(relationElement, "target");
        if (isMissingReference(endpointA) || isMissingReference(endpointB)) {
            this.summaries.push({
                result: "warning", target: `relation: ${relationName}`,
                message: "This relation has a missing endpoint and was skipped."
            });

            return;
        }

        // cSpell:ignore bendpoint
        const edges = ErmXmlParser.findChildren(relationElement, "bendpoint")
            .filter(bendpoint => (ErmXmlParser.childBoolean(bendpoint, "relative", false) === false))
            .map(bendpoint => {
                return {
                    x: ErmXmlParser.childInt(bendpoint, "x", 0),
                    y: ErmXmlParser.childInt(bendpoint, "y", 0)
                };
            });

        const rawParentCardinality = ErmXmlParser.childText(relationElement, "parent_cardinality");
        const rawChildCardinality = ErmXmlParser.childText(relationElement, "child_cardinality");
        const cardinalityTarget = `relation: ${relationName}`;

        this.relationsById.set(ermRelationId, {
            ermRelationId,
            endpointA,
            endpointB,
            relationName,
            parentCardinality:
                this.doNormalizeCardinality(rawParentCardinality, PARENT_CARDINALITIES, "1", cardinalityTarget),
            childCardinality:
                this.doNormalizeCardinality(rawChildCardinality, CHILD_CARDINALITIES, "1..N", cardinalityTarget),
            onUpdateAction: normalizeReferenceAction(ErmXmlParser.childText(relationElement, "on_update_action")),
            onDeleteAction: normalizeReferenceAction(ErmXmlParser.childText(relationElement, "on_delete_action")),
            color: parseErmColor(ErmXmlParser.findChild(relationElement, "color"), ColorValue.BLACK),
            edges: edges,
            parentNodeId: null,
            childNodeId: null,
            columnPairs: []
        });
    }

    private doNormalizeCardinality(
        rawCardinality: string, cardinalities: Record<string, CardinalityType>,
        defaultCardinality: CardinalityType, target: string
    ): CardinalityType {
        if (rawCardinality === "") {
            return defaultCardinality;
        }

        const cardinality = cardinalities[rawCardinality];
        if (cardinality == null) {
            this.summaries.push({
                result: "warning", target,
                message: `Unknown cardinality "${rawCardinality}" was replaced with "${defaultCardinality}".`
            });

            return defaultCardinality;
        }

        return cardinality;
    }

    private doLoadNote(noteElement: ErmElement): void {
        this.notes.push({
            ermNodeId: ErmXmlParser.childText(noteElement, "id"),
            text: ErmXmlParser.childText(noteElement, "text"),
            positionX: ErmXmlParser.childInt(noteElement, "x", 0),
            positionY: ErmXmlParser.childInt(noteElement, "y", 0),
            width: ErmXmlParser.childInt(noteElement, "width", 100),
            height: ErmXmlParser.childInt(noteElement, "height", 100),
            color: parseErmColor(ErmXmlParser.findChild(noteElement, "color"), ColorValue.WHITE),
            fontSize: ErmXmlParser.childInt(noteElement, "font_size", 9)
        });
    }

    private doLoadCategorySettings(settingsElement: ErmElement): void {
        const categorySettingsElement = ErmXmlParser.findChild(settingsElement, "category_settings");
        const categoriesElement = ErmXmlParser.findChild(categorySettingsElement, "categories");
        if (categoriesElement == null) {
            return;
        }

        ErmXmlParser.findChildren(categoriesElement, "category").forEach(categoryElement => {
            this.categories.push({
                name: ErmXmlParser.childText(categoryElement, "name"),
                ermNodeIds: ErmXmlParser.findChildren(categoryElement, "node_element").map(child => child.text)
            });
        });
    }

    // <referenced_column>/<relation> は生の ID 文字列でしか保持されておらず、
    // この段階で初めて columnsById / relationsById と突き合わせて解決する。
    private doResolveForeignKeys(): void {
        const pendingIds = new Set<string>(
            Array.from(this.columnsById.values())
                .filter(column => (column.referencedColumnIds.length > 0))
                .map(column => column.ermColumnId)
        );

        // FK チェーンの循環・共有を安全に処理するため、参照実装同様に「解決中集合」を再帰の外側で共有する。
        // 純粋な map/filter では循環検出と早期終了を表現できない。
        while (pendingIds.size > 0) {
            const nextId = pendingIds.values().next().value as string;
            this.doReduceColumn(pendingIds, nextId);
        }

        this.relationsById.forEach(relation => {
            if (
                (relation.columnPairs.length === 0)
                || (relation.parentNodeId == null) || (relation.childNodeId == null)
            ) {
                this.summaries.push({
                    result: "warning", target: `relation: ${relation.relationName}`,
                    message: "Could not resolve any column pair for this relation and it was skipped."
                });

                return;
            }

            this.relations.push({
                ermRelationId: relation.ermRelationId,
                parentNodeId: relation.parentNodeId,
                childNodeId: relation.childNodeId,
                relationName: relation.relationName,
                parentCardinality: relation.parentCardinality,
                childCardinality: relation.childCardinality,
                onUpdateAction: relation.onUpdateAction,
                onDeleteAction: relation.onDeleteAction,
                color: relation.color,
                edges: relation.edges,
                columnPairs: relation.columnPairs
            });
        });
    }

    private doReduceColumn(pendingIds: Set<string>, ermColumnId: string): void {
        if (pendingIds.has(ermColumnId) === false) {
            return;
        }

        pendingIds.delete(ermColumnId);

        const column = this.columnsById.get(ermColumnId);
        if (column == null) {
            return;
        }

        const referencedColumns = column.referencedColumnIds
            .map(id => this.columnsById.get(id))
            .filter((referenced): referenced is ErmColumnDefinition => (referenced != null));

        referencedColumns.filter(referenced => pendingIds.has(referenced.ermColumnId))
            .forEach(referenced => this.doReduceColumn(pendingIds, referenced.ermColumnId));

        column.relationIds.forEach(relationId => this.doWireRelation(relationId, column, referencedColumns));
    }

    // relation の <source>/<target> のうち、この FK 列自身のテーブルと一致する側が子、もう一方が親という消去法で親テーブルを確定する。
    // source/target のどちらが親を表すかは ERMaster のファイルによって一致しないため、その解釈には依存しない設計にしている。
    private doWireRelation(
        relationId: string, column: ErmColumnDefinition, referencedColumns: ErmColumnDefinition[]
    ): void {
        const relation = this.relationsById.get(relationId);
        if (relation == null) {
            return;
        }

        const parentEndpointId = doFindOtherEndpoint(relation, column.ownerErmNodeId);
        if (parentEndpointId == null) {
            return;
        }

        const matchingReferencedColumn =
            referencedColumns.find(referenced => (referenced.ownerErmNodeId === parentEndpointId));
        if (matchingReferencedColumn == null) {
            return;
        }

        relation.parentNodeId = parentEndpointId;
        relation.childNodeId = column.ownerErmNodeId;
        relation.columnPairs.push({
            parentErmColumnId: matchingReferencedColumn.ermColumnId,
            childErmColumnId: column.ermColumnId
        });
    }

    // ERMaster の FK 列は <physical_name>/<logical_name>/<description> に「FK 用の上書き値」だけを持ち、
    // 未設定なら参照先 (親) 列の値がその列の名前になる。精度に至っては FK 列側には一切書かれない。
    // 空の項目を親から引き継ぐことでのみ、ERMaster が表示・DDL 出力しているのと同じ列定義に復元できる。
    private doInheritTableColumns(table: ErmTableDefinition): ErmTableDefinition {
        const columnEntries = table.columnEntries.map(entry => this.doInheritColumnEntry(entry));

        return { ...table, columnEntries };
    }

    private doInheritColumnEntry(entry: ErmColumnEntry): ErmColumnEntry {
        if (entry.kind === "group") {
            return entry;
        }

        return { kind: "single", column: this.doInheritColumn(entry.column) };
    }

    private doInheritColumn(column: ErmColumnDefinition): ErmColumnDefinition {
        const resolved = this.inheritedColumns.get(column.ermColumnId);
        if (resolved != null) {
            return resolved;
        }

        // 参照が循環している壊れたファイルでも無限再帰しないよう、解決前に自分自身を暫定登録する。
        this.inheritedColumns.set(column.ermColumnId, column);
        if (column.referencedColumnIds.length === 0) {
            return column;
        }

        const referencedColumn = this.columnsById.get(column.referencedColumnIds[0]);
        if (referencedColumn == null) {
            return column;
        }

        // 親自身が FK である FK チェーンがあるため、親を解決してから引き継ぐ。
        const parentColumn = this.doInheritColumn(referencedColumn);
        const inheritedColumn = toInheritedColumn(column, parentColumn);
        this.inheritedColumns.set(column.ermColumnId, inheritedColumn);

        return inheritedColumn;
    }

    private doInheritGroupColumns(group: ErmColumnGroupDefinition): ErmColumnGroupDefinition {
        const columns = group.columns.map(column => this.doInheritColumn(column));

        return { ...group, columns };
    }

    private doFinalizeSkippedSections(root: ErmElement): void {
        if (this.skippedViewNames.length > 0) {
            this.summaries.push({
                result: "skipped", target: "view",
                message: `${this.skippedViewNames.length} view(s) are not supported by erd-designer and were `
                    + `skipped: ${this.skippedViewNames.join(", ")}`
            });
        }

        if (this.skippedImageCount > 0) {
            this.summaries.push({
                result: "skipped", target: "image",
                message: `${this.skippedImageCount} image(s) are not supported by erd-designer and were skipped.`
            });
        }

        UNSUPPORTED_SECTIONS
            .map(sectionTagName => ErmXmlParser.findChild(root, sectionTagName))
            .filter((section): section is ErmElement => ((section != null) && (section.children.length > 0)))
            .forEach(section => {
                this.summaries.push({
                    result: "skipped", target: section.tagName,
                    message: `<${section.tagName}> is not supported by erd-designer and was skipped.`
                });
            });
    }
}

const isMissingReference = (rawId: string): boolean => {
    return (rawId === "") || (rawId === "null");
};

// 2端点 (endpointA/endpointB) のうち ownNodeId と一致しない側を返す。
// 一致しない場合はこの relation がそのテーブルと無関係 (不整合な参照) とみなし null を返す。
const doFindOtherEndpoint = (relation: PendingErmRelation, ownNodeId: string): string | null => {
    if (relation.endpointA === ownNodeId) {
        return relation.endpointB;
    }

    if (relation.endpointB === ownNodeId) {
        return relation.endpointA;
    }

    return null;
};

// FK 列の <type> は親の型そのものではない (bigserial の親に対し FK 列は bigint)。
// 型は FK 列自身の値を正とし、型が受け付ける場合にのみ precision/scale/unsigned を親から補う。
const toInheritedColumn = (column: ErmColumnDefinition, parentColumn: ErmColumnDefinition): ErmColumnDefinition => {
    const columnType = (column.columnType !== ColumnType.EMPTY) ? column.columnType : parentColumn.columnType;

    return {
        ...column,
        physicalName: (column.physicalName !== "") ? column.physicalName : parentColumn.physicalName,
        logicalName: (column.logicalName !== "") ? column.logicalName : parentColumn.logicalName,
        description: (column.description !== "") ? column.description : parentColumn.description,
        columnType,
        precision: (columnType.withPrecision && (column.precision === "")) ? parentColumn.precision : column.precision,
        scale: (columnType.withScale && (column.scale === "")) ? parentColumn.scale : column.scale,
        unsigned: columnType.withUnsigned && (column.unsigned || parentColumn.unsigned)
    };
};

const parseErmColor = (colorElement: ErmElement | null, defaultColor: ColorValue): ColorValue => {
    if (colorElement == null) {
        return defaultColor;
    }

    return new ColorValue({
        red: ErmXmlParser.childInt(colorElement, "r", defaultColor.red),
        green: ErmXmlParser.childInt(colorElement, "g", defaultColor.green),
        blue: ErmXmlParser.childInt(colorElement, "b", defaultColor.blue)
    });
};

const PARENT_CARDINALITIES: Record<string, CardinalityType> = { "1": "1", "0..1": "0..1" };
const CHILD_CARDINALITIES: Record<string, CardinalityType> = { "1": "1", "0..n": "0..N", "1..n": "1..N" };

const VALID_REFERENCE_ACTIONS: readonly TableReferenceActionType[] =
    ["RESTRICT", "SET NULL", "CASCADE", "NO ACTION", "SET DEFAULT"];

const normalizeReferenceAction = (raw: string): TableReferenceActionType => {
    const matched = VALID_REFERENCE_ACTIONS.find(action => (action === raw));
    return matched ?? "RESTRICT";
};

const normalizeErmDefaultValue = (rawValue: string): string => {
    if (EMPTY_STRING_PLACEHOLDERS.includes(rawValue)) {
        return "";
    }
    if (CURRENT_TIME_PLACEHOLDERS.includes(rawValue)) {
        return "CURRENT_TIMESTAMP";
    }

    return rawValue;
};
