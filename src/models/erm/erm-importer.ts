import { v4 as uuidV4 } from "uuid";

import ColorValue from "~/models/ColorValue";
import ColumnEntry from "~/models/database/ColumnEntry";
import ColumnGroupModel from "~/models/database/ColumnGroupModel";
import ColumnModel from "~/models/database/ColumnModel";
import ColumnShareModel from "~/models/database/ColumnShareModel";
import { Database } from "~/models/database/DatabaseType";
import DatabaseSettingModel from "~/models/DatabaseSettingModel";
import DbSchemaConfig from "~/models/DbSchemaConfig";
import DbSchemaModel from "~/models/database/DbSchemaModel";
import ErdDocument from "~/models/ErdDocument";
import ErdSettingModel from "~/models/ErdSettingModel";
import LineViewModel from "~/models/LineViewModel";
import MemoViewModel from "~/models/MemoViewModel";
import PerspectiveModel from "~/models/PerspectiveModel";
import RectangleViewModel from "~/models/RectangleViewModel";
import RelationModel from "~/models/database/RelationModel";
import RelationPair from "~/models/database/RelationPair";
import RelationViewModel from "~/models/RelationViewModel";
import SimpleColumnModel from "~/models/database/SimpleColumnModel";
import TableIndexModel, { IndexColumnModel } from "~/models/database/TableIndexModel";
import TableModel from "~/models/database/TableModel";
import TableUniqueKeysModel, { UniqueKeysColumnModel } from "~/models/database/TableUniqueKeysModel";
import TableViewModel from "~/models/TableViewModel";
import {
    ErmCategoryDefinition, ErmColumnDefinition, ErmColumnEntry, ErmColumnGroupDefinition,
    ErmIndexDefinition, ErmLoadResult, ErmLoadSummary, ErmNoteDefinition, ErmRelationDefinition,
    ErmTableDefinition, ErmUniqueKeyDefinition
} from "~/models/erm/support";

type ErmLoadSuccessResult = Extract<ErmLoadResult, { outcome: "success" }>;

type ErmImportResult = {
    erdDocument: ErdDocument,
    summaries: ErmLoadSummary[]
};

export const importErm = (documentName: string, loadResult: ErmLoadSuccessResult): ErmImportResult => {
    const importer = new ErmImporter();
    return importer.import(documentName, loadResult);
};

class ErmImporter {

    private database: Database = Database.get("mysql");
    private readonly summaries: ErmLoadSummary[] = [];
    // 属性一致で ColumnShareModel を重複排除する。キーは physicalName/logicalName/columnTypeId/
    // precision/scale/unsigned/description の組。word_id 共有列は自然にこのキーで一致し、
    // word_id 無し (アドホック) 列も属性が一致すれば同じ Share を再利用する (spec §3.5 の設計判断は
    // work/ERM_IMPORT_PROGRESS.md 参照)。
    private readonly columnShareModels = new Map<string, ColumnShareModel>();
    private readonly ermColumnIdToColumnModelId = new Map<string, string>();
    private readonly ermGroupIdToColumnGroupId = new Map<string, string>();
    private readonly ermNodeIdToTableModelId = new Map<string, string>();
    private readonly ermNodeIdToMemoId = new Map<string, string>();
    private readonly schemaNameToSchemaId = new Map<string, string>();
    private readonly columnModels: ColumnModel[] = [];
    private readonly columnGroupModels: ColumnGroupModel[] = [];
    private readonly tableViewModels: TableViewModel[] = [];
    private readonly relationViewModels: RelationViewModel[] = [];
    private readonly memoViewModels: MemoViewModel[] = [];
    private readonly perspectiveModels: PerspectiveModel[] = [];

    public import(documentName: string, loadResult: ErmLoadSuccessResult): ErmImportResult {
        this.database = Database.get(loadResult.databaseType);
        const databaseSettingModel = DatabaseSettingModel.create(loadResult.databaseType);
        const schemaConfig = this.doBuildSchemaConfig(loadResult.tables);

        // column_groups はテーブルの columnEntries から参照されるため、テーブルより先に処理する。
        loadResult.columnGroups.forEach(group => this.doProcessColumnGroup(group));
        loadResult.tables.forEach(table => this.doProcessTable(table));
        loadResult.relations.forEach(relation => this.doProcessRelation(relation));
        loadResult.notes.forEach(note => this.doProcessNote(note));
        loadResult.categories.forEach(category => this.doProcessCategory(category));

        const erdSettingModel = ErdSettingModel.create(documentName)
            .update({ perspectiveModels: this.perspectiveModels });

        const erdDocument = ErdDocument.create({
            documentName,
            erdSettingModel,
            databaseSettingModel,
            schemaConfig,
            tableViewModels: this.tableViewModels,
            columnGroupModels: this.columnGroupModels,
            columnModels: this.columnModels,
            columnShareModels: Array.from(this.columnShareModels.values()),
            relationViewModels: this.relationViewModels,
            foregroundMemoViewModels: this.memoViewModels
        });

        return { erdDocument, summaries: [...loadResult.summaries, ...this.summaries] };
    }

    private doBuildSchemaConfig(tables: readonly ErmTableDefinition[]): DbSchemaConfig {
        if (this.database.supportsSchema === false) {
            return DbSchemaConfig.create();
        }

        const schemaNames = Array.from(new Set(tables.map(table => table.schemaName).filter(name => (name !== ""))));
        const schemas = schemaNames.map(schemaName => {
            const schema = DbSchemaModel.create(schemaName, "");
            this.schemaNameToSchemaId.set(schemaName, schema.schemaId);
            return schema;
        });

        return DbSchemaConfig.create({ schemas });
    }

    private doProcessColumnGroup(group: ErmColumnGroupDefinition): void {
        const columnGroupId = uuidV4();
        this.ermGroupIdToColumnGroupId.set(group.ermGroupId, columnGroupId);

        const columnModelIds = group.columns.map(column => this.doProcessColumn(column).columnModelId);

        this.columnGroupModels.push(new ColumnGroupModel({ columnGroupId, groupName: group.groupName, columnModelIds }));
    }

    private doProcessTable(table: ErmTableDefinition): void {
        const tableModelId = uuidV4();
        this.ermNodeIdToTableModelId.set(table.ermNodeId, tableModelId);

        // インデックス・ユニークキーはカラムの columnModelId を参照するため、カラム解決を先に行う。
        const columnEntries = this.doResolveColumnEntries(table.columnEntries);
        const uniqueKeysModels = table.uniqueKeys.flatMap(uniqueKey => this.doBuildUniqueKeysModel(uniqueKey));
        const tableIndexModels = table.indexes.flatMap(index => this.doBuildIndexModel(index));

        const schemaId = ((this.database.supportsSchema) && (table.schemaName !== ""))
            ? (this.schemaNameToSchemaId.get(table.schemaName) ?? "") : "";
        const availableCharSet = (this.database.editableCharacterSet && this.database.supportsTableCollate);

        const tableModel = new TableModel({
            tableModelId,
            physicalName: table.physicalName,
            logicalName: table.logicalName,
            schemaId,
            columnEntries,
            uniqueKeysModels,
            tableIndexModels,
            description: table.description,
            checkExpression: table.checkExpression,
            characterSet: availableCharSet ? table.characterSet : "",
            collate: (this.database.supportsTableCollate) ? table.collation : "",
            optionExpression: table.optionExpression
        });
        const tableView = new TableViewModel({
            tableModel,
            corner: { top: table.location.y, left: table.location.x },
            headerColor: { background: table.headerColor, foreground: ColorValue.BLACK }
        });

        this.tableViewModels.push(tableView);
    }

    private doResolveColumnEntries(entries: readonly ErmColumnEntry[]): ColumnEntry[] {
        return entries.flatMap((entry): ColumnEntry[] => {
            if (entry.kind === "single") {
                const columnModel = this.doProcessColumn(entry.column);
                return [{ modelType: "single", columnModelId: columnModel.columnModelId }];
            }

            const columnGroupId = this.ermGroupIdToColumnGroupId.get(entry.ermGroupId);
            if (columnGroupId == null) {
                this.summaries.push({
                    result: "warning", target: "table",
                    message: `Referenced column group "${entry.ermGroupId}" was not found and was skipped.`
                });

                return [];
            }

            return [{ modelType: "group", columnGroupId }];
        });
    }

    private doProcessColumn(column: ErmColumnDefinition): SimpleColumnModel {
        const columnShare = this.doResolveColumnShare(column);
        const columnModel = new SimpleColumnModel({
            columnShareModelId: columnShare.columnShareModelId,
            primaryKey: column.primaryKey,
            notNull: column.notNull,
            unique: column.uniqueKey,
            autoIncrement: columnShare.columnType.withAutoIncrement && column.autoIncrement,
            defaultValue: column.defaultValue
        });

        this.columnModels.push(columnModel);
        this.ermColumnIdToColumnModelId.set(column.ermColumnId, columnModel.columnModelId);

        return columnModel;
    }

    private doResolveColumnShare(column: ErmColumnDefinition): ColumnShareModel {
        const dedupeKey = JSON.stringify([
            column.physicalName, column.logicalName, column.columnType.id,
            column.precision, column.scale, column.unsigned, column.description
        ]);

        const existing = this.columnShareModels.get(dedupeKey);
        if (existing != null) {
            return existing;
        }

        const columnShare = new ColumnShareModel({
            columnShareModelId: uuidV4(),
            physicalName: column.physicalName,
            logicalName: column.logicalName,
            columnType: column.columnType,
            precision: column.precision,
            scale: column.scale,
            unsigned: column.unsigned,
            description: column.description,
            characterSet: (this.database.editableCharacterSet && (column.columnType.category === "text"))
                ? column.characterSet : "",
            collate: (column.columnType.category === "text") ? column.collation : ""
        });

        this.columnShareModels.set(dedupeKey, columnShare);
        return columnShare;
    }

    private doBuildIndexModel(index: ErmIndexDefinition): TableIndexModel[] {
        const indexColumnModels = index.columns.flatMap((column): IndexColumnModel[] => {
            const columnModelId = this.ermColumnIdToColumnModelId.get(column.ermColumnId);
            if (columnModelId == null) {
                return [];
            }

            return [new IndexColumnModel({ columnModelId, sortOrderType: column.descending ? "DESC" : "ASC" })];
        });

        if (indexColumnModels.length === 0) {
            this.summaries.push({
                result: "warning", target: `index: ${index.physicalName}`,
                message: "No resolvable columns for this index; it was skipped."
            });

            return [];
        }

        const tableIndex = new TableIndexModel({
            tableIndexModelId: uuidV4(),
            physicalName: index.physicalName,
            indexColumnModels,
            indexOption: index.indexOption,
            indexType: index.indexType,
            description: index.description
        });
        return [tableIndex];
    }

    private doBuildUniqueKeysModel(uniqueKey: ErmUniqueKeyDefinition): TableUniqueKeysModel[] {
        const uniqueKeysColumnModels = uniqueKey.columnIds.flatMap((ermColumnId): UniqueKeysColumnModel[] => {
            const columnModelId = this.ermColumnIdToColumnModelId.get(ermColumnId);
            return (columnModelId != null) ? [new UniqueKeysColumnModel({ columnModelId, sortOrderType: "" })] : [];
        });

        if (uniqueKeysColumnModels.length === 0) {
            this.summaries.push({
                result: "warning", target: `unique key: ${uniqueKey.physicalName}`,
                message: "No resolvable columns for this unique key; it was skipped."
            });

            return [];
        }

        const tableUniqueKey = new TableUniqueKeysModel({
            tableUniqueKeysModelId: uuidV4(),
            physicalName: uniqueKey.physicalName,
            uniqueKeysColumnModels
        });

        return [tableUniqueKey];
    }

    private doProcessRelation(relation: ErmRelationDefinition): void {
        const parentTableModelId = this.ermNodeIdToTableModelId.get(relation.parentNodeId);
        const childTableModelId = this.ermNodeIdToTableModelId.get(relation.childNodeId);
        if ((parentTableModelId == null) || (childTableModelId == null)) {
            this.summaries.push({
                result: "warning", target: `relation: ${relation.relationName}`,
                message: "One of the endpoint tables was not imported (it may be an unsupported view) and the "
                    + "relation was skipped."
            });

            return;
        }

        const relationPairs = relation.columnPairs.flatMap((pair): RelationPair[] => {
            const parentColumnModelId = this.ermColumnIdToColumnModelId.get(pair.parentErmColumnId);
            const childColumnModelId = this.ermColumnIdToColumnModelId.get(pair.childErmColumnId);
            if ((parentColumnModelId == null) || (childColumnModelId == null)) {
                return [];
            }

            return [new RelationPair({ parentColumnModelId, childColumnModelId })];
        });

        if (relationPairs.length === 0) {
            this.summaries.push({
                result: "warning", target: `relation: ${relation.relationName}`,
                message: "No resolvable column pairs for this relation; it was skipped."
            });

            return;
        }

        const relationModel = new RelationModel({
            relationName: relation.relationName,
            parentTableModelId, parentCardinality: relation.parentCardinality,
            childTableModelId, childCardinality: relation.childCardinality,
            relationPairs,
            onUpdateAction: relation.onUpdateAction,
            onDeleteAction: relation.onDeleteAction
        });
        const lineView = new LineViewModel({ edges: relation.edges, color: relation.color });

        this.relationViewModels.push(new RelationViewModel({ relationModel, lineViewModel: lineView }));
    }

    private doProcessNote(note: ErmNoteDefinition): void {
        const rectangleView = new RectangleViewModel({
            positionX: note.positionX, positionY: note.positionY, width: note.width, height: note.height
        });

        const memoViewModel = MemoViewModel
            .create(rectangleView, { background: note.color, foreground: ColorValue.BLACK }, note.fontSize)
            .updateMemo(note.text);

        this.ermNodeIdToMemoId.set(note.ermNodeId, memoViewModel.memoId);
        this.memoViewModels.push(memoViewModel);
    }

    private doProcessCategory(category: ErmCategoryDefinition): void {
        const containIds = category.ermNodeIds.flatMap((ermNodeId): string[] => {
            const tableModelId = this.ermNodeIdToTableModelId.get(ermNodeId);
            if (tableModelId != null) {
                return [tableModelId];
            }

            const memoId = this.ermNodeIdToMemoId.get(ermNodeId);
            return (memoId != null) ? [memoId] : [];
        });

        const perspective = PerspectiveModel.create(category.name).updateAllContainIds(containIds);
        this.perspectiveModels.push(perspective);
    }
}
