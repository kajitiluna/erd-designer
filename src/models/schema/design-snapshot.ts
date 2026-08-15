import ErdDocument from "~/models/ErdDocument";
import ColumnModel from "~/models/database/ColumnModel";
import ColumnShareModel from "~/models/database/ColumnShareModel";
import { DatabaseType } from "~/models/database/DatabaseType";
import RelationModel from "~/models/database/RelationModel";
import SimpleColumnModel from "~/models/database/SimpleColumnModel";
import { overrideColumnName } from "~/models/database/support";
import { TableIndexOption, TableIndexType } from "~/models/database/TableIndexSupport";
import TableModel from "~/models/database/TableModel";
import { ColumnSnapshots, DesignedColumnFacts } from "~/models/schema/column-snapshot";
import { DdlCommentOption, initDdlComment } from "~/models/schema/ddl-comment";
import {
    ColumnSnapshot, ForeignKeySnapshot, IndexSnapshot, SchemaCompareScope, SchemaSnapshot, SchemaWarning,
    TableSnapshot, UniqueKeySnapshot
} from "~/models/schema/schema-snapshot";
import TableViewModel from "~/models/TableViewModel";

/** .erd から中立表現を作る。CLI・イントロスペクタ双方の入口を1本に保つ。 */
export default class DesignSnapshot {

    private constructor() {
        // do nothing
    }

    public static toSchemaSnapshot(erdDocument: ErdDocument, scope: SchemaCompareScope): SchemaSnapshot {
        const databaseType = erdDocument.getDatabase().databaseType;
        const schemaNames = toSchemaNames(erdDocument, scope);
        const foreignKeysByChildTable = toForeignKeySnapshotsByChildTable(erdDocument, scope);

        const tableResults = erdDocument.getTableViewModels()
            .map(tableView => toTableSnapshot(erdDocument, tableView, scope, foreignKeysByChildTable));

        const tables = tableResults.map(result => result.table);
        const warnings = tableResults.flatMap(result => result.warnings);

        return { databaseType, schemaNames, tables, warnings };
    }

    /**
     * db-diff/migrate-ddl が実際に問い合わせるべき物理スキーマの集合(重複なし)。
     * schemaNames(schema.missing/unexpected の比較対象)とは別の事実であり、
     * withSchema の影響を受けない — --no-schema はスキーマ名の比較有無を左右するだけで、テーブルの所在には無関係のため。
     */
    public static toDeclaredTableSchemaNames(snapshot: SchemaSnapshot): readonly string[] {
        const schemaNames = snapshot.tables
            .map(table => table.schemaName)
            .filter(schemaName => (schemaName !== ""));

        return Array.from(new Set(schemaNames));
    }
}

const toSchemaNames = (erdDocument: ErdDocument, scope: SchemaCompareScope): string[] => {
    const database = erdDocument.getDatabase();
    if ((database.supportsSchema === false) || (scope.withSchema === false)) {
        return [];
    }

    const schemaNames = erdDocument.schemaConfig.getSchemas().map(schema => schema.schemaName);

    // PostgreSQL は明示的なスキーマを1つも作らない設計でも、テーブルは実際には既定スキーマ("public")に作成される。
    // スキーマを何も宣言していない .erd では、方言ごとの既定スキーマを補って DB 側と対称にする。
    if ((schemaNames.length === 0) && (database.defaultSchemaName !== "")) {
        return [database.defaultSchemaName];
    }

    return schemaNames;
};

// relationPairs は子テーブル単位に振り分けるため、全リレーションを1回だけ走査してグループ化する。
// RelationViewModelStorage.toTableIdMapping と同じ「Map への蓄積」パターン(関数的スタイルの例外)。
const toForeignKeySnapshotsByChildTable = (
    erdDocument: ErdDocument, scope: SchemaCompareScope
): Map<string, ForeignKeySnapshot[]> => {
    const foreignKeysByChildTable = new Map<string, ForeignKeySnapshot[]>();
    if (scope.withForeignKey === false) {
        return foreignKeysByChildTable;
    }

    erdDocument.getRelationViewModels().forEach(relationView => {
        const relationModel = relationView.relationModel;
        const foreignKey = toForeignKeySnapshot(erdDocument, relationModel);

        const existing = foreignKeysByChildTable.get(relationModel.childTableModelId) ?? [];
        existing.push(foreignKey);
        foreignKeysByChildTable.set(relationModel.childTableModelId, existing);
    });

    return foreignKeysByChildTable;
};

const toForeignKeySnapshot = (erdDocument: ErdDocument, relationModel: RelationModel): ForeignKeySnapshot => {
    // 参照整合性は ErdDocument が内部で維持する不変条件であり、create-ddl.ts の
    // foreignKeyQueryForAlter 生成部と同じ前提で解決する(異常時は as によるキャストに委ねる)。
    const parentTableView = erdDocument.findTableViewModel(relationModel.parentTableModelId) as TableViewModel;
    const parentTableModel = parentTableView.tableModel;

    const columnNames = relationModel.relationPairs
        .map(pair => toColumnPhysicalName(erdDocument, pair.childColumnModelId));
    const parentColumnNames = relationModel.relationPairs
        .map(pair => toColumnPhysicalName(erdDocument, pair.parentColumnModelId));

    return {
        constraintName: "",
        columnNames,
        parentSchemaName: toTableSchemaName(erdDocument, parentTableModel),
        parentTableName: parentTableModel.physicalName,
        parentColumnNames,
        onUpdate: relationModel.onUpdateAction,
        onDelete: relationModel.onDeleteAction
    };
};

const toColumnPhysicalName = (erdDocument: ErdDocument, columnModelId: string): string => {
    // FK の親子カラムは PK 由来の simple カラムに限定される(create-ddl.ts と同じ前提)。
    const columnModel = erdDocument.findColumnModel(columnModelId) as SimpleColumnModel;
    const columnShare = erdDocument.findColumnShareModel(columnModel.columnShareModelId) as ColumnShareModel;

    return overrideColumnName(columnModel, columnShare).physicalName;
};

type TableSnapshotResult = { table: TableSnapshot, warnings: readonly SchemaWarning[] };

const toTableSnapshot = (
    erdDocument: ErdDocument, tableViewModel: TableViewModel, scope: SchemaCompareScope,
    foreignKeysByChildTable: Map<string, ForeignKeySnapshot[]>
): TableSnapshotResult => {
    const database = erdDocument.getDatabase()
    const tableModel = tableViewModel.tableModel;
    const schemaName = toTableSchemaName(erdDocument, tableModel);
    const commentOption = toCommentOption(erdDocument);

    const columnResult = toColumnSnapshotsForTable(erdDocument, tableModel, commentOption, scope);
    const comment = initDdlComment(
        tableModel.physicalName, tableModel.logicalName, tableModel.description, commentOption
    );
    const logicalName = scope.withLogicalName ? tableModel.logicalName : "";

    const primaryKeyColumnNames = columnResult.contexts
        .filter(context => context.columnModel.primaryKey)
        .map(context => context.physicalName);

    const table: TableSnapshot = {
        schemaName,
        tableName: tableModel.physicalName,
        logicalName,
        comment,
        columns: columnResult.columns,
        primaryKeyColumnNames,
        uniqueKeys: toUniqueKeySnapshotsForTable(tableModel, columnResult.contexts),
        indexes: toIndexSnapshotsForTable(tableModel, columnResult.contexts, scope, database.databaseType),
        foreignKeys: foreignKeysByChildTable.get(tableModel.tableModelId) ?? []
    };

    const warnings = columnResult.warnings.map(warning => {
        return { ...warning, schemaName, tableName: tableModel.physicalName };
    });

    return { table, warnings };
};

const toTableSchemaName = (erdDocument: ErdDocument, tableModel: TableModel): string => {
    const database = erdDocument.getDatabase();
    if (database.supportsSchema === false) {
        return "";
    }

    const schema = erdDocument.findSchema(tableModel.schemaId);
    if (schema != null) {
        return schema.schemaName;
    }

    // PostgreSQL はスキーマを割り当てていないテーブルも実際には既定スキーマ("public")に作成される。
    // 空文字のままだと table.missing と table.unexpected の二重報告になるため、方言ごとの既定スキーマに合わせる。
    return database.defaultSchemaName;
};

// withComment は常に true で initDdlComment に渡す:
// 設計側のコメントは常に実値を持ち、出し分けは migrate-ddl の生成側で行う
// (scope.withComment は schema-diff.ts の比較ゲートにのみ使う)。
// initDdlComment は create-ddl.ts の export-ddl とも共有しており、
// そちらの withComment はDDL 出力設定という別の関心のため、共有関数自体はここでは変更しない。
const toCommentOption = (erdDocument: ErdDocument): DdlCommentOption => {
    const exportDdlSetting = erdDocument.erdSettingModel.exportDdlSetting;

    return {
        withComment: true,
        commentStyle: exportDdlSetting.commentStyle,
        commentSeparator: exportDdlSetting.commentSeparator
    };
};

type ColumnContext = {
    columnModelId: string;
    columnModel: SimpleColumnModel;
    columnShareModel: ColumnShareModel;
    physicalName: string;
    logicalName: string;
};

type ColumnSnapshotsResult = {
    columns: ColumnSnapshot[];
    contexts: readonly ColumnContext[];
    warnings: SchemaWarning[];
};

const toColumnSnapshotsForTable = (
    erdDocument: ErdDocument, tableModel: TableModel, commentOption: DdlCommentOption, scope: SchemaCompareScope
): ColumnSnapshotsResult => {
    const columnModels = erdDocument.toAllColumnsWithStruct(tableModel);
    const structColumnCount = columnModels.filter(ColumnModel.isStructColumn).length;

    // struct 列は本機能の第1段階では比較対象外(第1段階の対象方言 postgres/mysql/mariadb は
    // いずれも struct 非対応であり、実害は薄いが将来 bigquery を扱う際のため明示しておく)。
    const warnings: SchemaWarning[] = (structColumnCount > 0) ? [{
        category: "struct.skipped", schemaName: "", tableName: "",
        message: `${structColumnCount} struct column(s) are not supported by schema verification `
            + "and were excluded from comparison."
    }] : [];

    const contexts = columnModels.filter(ColumnModel.isSimpleColumn)
        .map(columnModel => toColumnContext(erdDocument, columnModel));

    const columns = contexts.map(context => toColumnSnapshot(context, commentOption, scope));

    return { columns, contexts, warnings };
};

const toColumnContext = (erdDocument: ErdDocument, columnModel: SimpleColumnModel): ColumnContext => {
    const columnShareModel = erdDocument.findColumnShareModel(columnModel.columnShareModelId) as ColumnShareModel;
    const overrideName = overrideColumnName(columnModel, columnShareModel);

    return {
        columnModelId: columnModel.columnModelId,
        columnModel,
        columnShareModel,
        physicalName: overrideName.physicalName,
        logicalName: overrideName.logicalName
    };
};

const toColumnSnapshot = (
    context: ColumnContext, commentOption: DdlCommentOption, scope: SchemaCompareScope
): ColumnSnapshot => {
    const facts: DesignedColumnFacts = {
        columnModel: context.columnModel,
        columnShare: context.columnShareModel,
        physicalName: context.physicalName,
        logicalName: context.logicalName,
        commentOption
    };

    return ColumnSnapshots.ofDesignedColumn(facts, scope);
};

const toUniqueKeySnapshotsForTable = (
    tableModel: TableModel, contexts: readonly ColumnContext[]
): UniqueKeySnapshot[] => {
    const nameByColumnModelId = new Map(contexts.map(context => [context.columnModelId, context.physicalName]));

    const constraintUniqueKeys = tableModel.uniqueKeysModels.map(uniqueKeysModel => {
        const columnNames = uniqueKeysModel.uniqueKeysColumnModels
            .map(entry => nameByColumnModelId.get(entry.columnModelId))
            .filter((name): name is string => (name != null));

        return { constraintName: uniqueKeysModel.physicalName, columnNames };
    });

    // SimpleColumnModel.unique はインラインの1列 UNIQUE。DB では UniqueKeySnapshot と同じ実体として現れるため、
    // ここで1列の UniqueKeySnapshot に正規化して合流させる。
    const inlineUniqueKeys = contexts
        .filter(context => context.columnModel.unique)
        .map(context => {
            return { constraintName: "", columnNames: [context.physicalName] };
        });

    // UNIQUE オプションのインデックスは MySQL では UNIQUE 制約と同一実体で、
    // DB 側イントロスペクタも常に uniqueKeys へ振る(mysql.ts の groupIndexColumnRows)。
    // ここで合流させないと、同じ物理インデックスが index.missing と uniqueKey.unexpected の両方として現れる。
    const uniqueIndexKeys = tableModel.tableIndexModels
        .filter(indexModel => (indexModel.indexOption === "UNIQUE"))
        .map(indexModel => {
            const columnNames = indexModel.indexColumnModels
                .map(entry => nameByColumnModelId.get(entry.columnModelId))
                .filter((name): name is string => (name != null));

            return { constraintName: indexModel.physicalName, columnNames };
        });

    return [...constraintUniqueKeys, ...inlineUniqueKeys, ...uniqueIndexKeys];
};

const toIndexSnapshotsForTable = (
    tableModel: TableModel, contexts: readonly ColumnContext[], scope: SchemaCompareScope, databaseType: DatabaseType
): IndexSnapshot[] => {
    if (scope.withIndex === false) {
        return [];
    }

    const nameByColumnModelId = new Map(contexts.map(context => [context.columnModelId, context.physicalName]));

    // UNIQUE オプションのインデックスは toUniqueKeySnapshotsForTable 側に合流させるため、ここでは除く。
    return tableModel.tableIndexModels
        .filter(indexModel => (indexModel.indexOption !== "UNIQUE"))
        .map(indexModel => {
            const columnNames = indexModel.indexColumnModels
                .map(entry => nameByColumnModelId.get(entry.columnModelId))
                .filter((name): name is string => (name != null));

            return {
                indexName: indexModel.physicalName,
                columnNames,
                indexOption: indexModel.indexOption,
                indexType: toIndexType(indexModel.indexType, indexModel.indexOption, databaseType)
            };
        });
};

// USING を省略した CREATE INDEX は postgres/mysql/mariadb のいずれも常に btree として作成される。
// design 側で未指定(空文字)のままだと DB 側の明示表現と恒常的に不一致になるため、比較のためだけに既定値を補う。
// FULLTEXT/SPATIAL は索引方式(indexType)を持たない別の索引実装のため対象外。
const DEFAULT_INDEX_TYPES: { [key in DatabaseType]?: TableIndexType } = {
    postgres: "BTREE", mysql: "BTREE", mariadb: "BTREE"
};

const toIndexType = (
    indexType: TableIndexType, indexOption: TableIndexOption, databaseType: DatabaseType
): TableIndexType => {
    if ((indexType !== "") || (indexOption === "FULLTEXT") || (indexOption === "SPATIAL")) {
        return indexType;
    }

    return DEFAULT_INDEX_TYPES[databaseType] ?? "";
};
