import ColorValue from "~/models/ColorValue";
import ColumnType from "~/models/database/ColumnType";
import { CardinalityType, TableReferenceActionType } from "~/models/database/RelationModel";
import { TableIndexOption, TableIndexType } from "~/models/database/TableIndexSupport";
import { DatabaseType } from "~/models/database/DatabaseType";

export type ErmLoadSummary = {
    result: "success" | "warning" | "skipped" | "failure",
    target: string,
    message: string
};

export type ErmColumnDefinition = {
    ermColumnId: string,
    // 所属テーブルの ermNodeId。column_group が直接所有する列は、
    // どの relation の親テーブルにも一致し得ないよう空文字にする (FK 解決の doReduceColumn が参照する)。
    ownerErmNodeId: string,
    physicalName: string,
    logicalName: string,
    columnType: ColumnType,
    precision: string,
    scale: string,
    unsigned: boolean,
    description: string,
    notNull: boolean,
    primaryKey: boolean,
    uniqueKey: boolean,
    autoIncrement: boolean,
    defaultValue: string,
    characterSet: string,
    collation: string,
    referencedColumnIds: string[],
    relationIds: string[]
};

export type ErmColumnEntry = { kind: "single", column: ErmColumnDefinition }
    | { kind: "group", ermGroupId: string };

export type ErmIndexDefinition = {
    physicalName: string,
    indexOption: TableIndexOption,
    indexType: TableIndexType,
    description: string,
    columns: { ermColumnId: string, descending: boolean }[]
};

export type ErmUniqueKeyDefinition = {
    physicalName: string,
    columnIds: string[]
};

export type ErmTableDefinition = {
    ermNodeId: string,
    physicalName: string,
    logicalName: string,
    description: string,
    checkExpression: string,
    optionExpression: string,
    schemaName: string,
    characterSet: string,
    collation: string,
    location: { x: number, y: number },
    headerColor: ColorValue,
    columnEntries: ErmColumnEntry[],
    indexes: ErmIndexDefinition[],
    uniqueKeys: ErmUniqueKeyDefinition[]
};

export type ErmColumnGroupDefinition = {
    ermGroupId: string,
    groupName: string,
    columns: ErmColumnDefinition[]
};

export type ErmRelationDefinition = {
    ermRelationId: string,
    parentNodeId: string,
    childNodeId: string,
    relationName: string,
    parentCardinality: CardinalityType,
    childCardinality: CardinalityType,
    onUpdateAction: TableReferenceActionType,
    onDeleteAction: TableReferenceActionType,
    color: ColorValue,
    edges: { x: number, y: number }[],
    columnPairs: { parentErmColumnId: string, childErmColumnId: string }[]
};

export type ErmNoteDefinition = {
    ermNodeId: string,
    text: string,
    positionX: number,
    positionY: number,
    width: number,
    height: number,
    color: ColorValue,
    fontSize: number
};

export type ErmCategoryDefinition = {
    name: string,
    ermNodeIds: string[]
};

export type ErmLoadResult = {
    outcome: "success",
    databaseType: DatabaseType,
    summaries: ErmLoadSummary[],
    tables: ErmTableDefinition[],
    columnGroups: ErmColumnGroupDefinition[],
    relations: ErmRelationDefinition[],
    notes: ErmNoteDefinition[],
    categories: ErmCategoryDefinition[]
} | { outcome: "failure", summaries: ErmLoadSummary[] };
