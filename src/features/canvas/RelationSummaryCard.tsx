import React from "react";
import { Divider, Tooltip, Typography } from "@mui/material";
import SyncIcon from "@mui/icons-material/Sync";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";

import { ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import type { ColorTheme } from "~/models/ColorValue";
import ThemePreferenceContext from "~/context/ThemePreferenceContext";
import ErdDocument from "~/models/ErdDocument";
import RelationModel, { TableReferenceActionType } from "~/models/database/RelationModel";
import RelationViewModel from "~/models/RelationViewModel";
import TableModel from "~/models/database/TableModel";
import SimpleColumnModel from "~/models/database/SimpleColumnModel";
import { overrideColumnName } from "~/models/database/support";
import { handlePreventMouseEvent } from "~/features/canvas/support";

type RelationSummaryCardProps = {
    relationView: RelationViewModel,
    /** Distance in px between the card's bottom edge and the parent's top edge, in the parent's local coordinates. */
    gap: number
};

/**
 * Display-only card that summaries a relation (tables, column pairs, cardinality and reference actions).
 * Visibility is decided by the caller.
 *
 * The card must be rendered as a child of an absolutely positioned element that is already scaled to the
 * screen. It aligns its right edge with that element's right edge and stacks above it, separated by `gap`.
 * Because the parent's scale is inherited, the card does not apply any scale of its own.
 */
const RelationSummaryCard = ({ relationView, gap }: RelationSummaryCardProps) => {
    const documentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { colorTheme } = React.useContext(ThemePreferenceContext);

    const erdDocument = documentsHolder.current();
    const relation = relationView.relationModel;

    const parentTableView = erdDocument.findTableViewModel(relation.parentTableModelId);
    const childTableView = erdDocument.findTableViewModel(relation.childTableModelId);
    if ((parentTableView == null) || (childTableView == null)) {
        return null;
    }

    const displayNameStyle = erdDocument.getDisplayNameStyle();
    const parentTable = parentTableView.tableModel;
    const childTable = childTableView.tableModel;

    const parentTableName = displayNameStyle.displayName(parentTable.physicalName, parentTable.logicalName);
    const childTableName = displayNameStyle.displayName(childTable.physicalName, childTable.logicalName);
    const columnNamePairs = toColumnNamePairs(relation, parentTable, childTable, erdDocument);

    const cardStyle: React.CSSProperties = {
        position: "absolute",
        right: 0,
        bottom: `calc(100% + ${gap}px)`,
        pointerEvents: "auto",
        backgroundColor: "var(--mui-palette-erd-tableBody)",
        border: "1px solid var(--mui-palette-erd-floatingBorder)",
        borderRadius: 10,
        boxShadow: "0 8px 24px var(--mui-palette-erd-floatingShadow)",
        padding: "8px 12px",
        color: "var(--mui-palette-erd-tableText)",
        fontSize: "0.7rem",
        whiteSpace: "nowrap",
        zIndex: 100
    };

    return (
        <div style={cardStyle} onClick={handlePreventMouseEvent}
            onMouseDown={handlePreventMouseEvent} onMouseUp={handlePreventMouseEvent}>
            {(relation.relationName !== "") && (<>
                <Typography variant="subtitle2" sx={{ textAlign: "center", marginBottom: "4px" }}>
                    {relation.relationName}
                </Typography>
                <Divider sx={{ marginBottom: 1 }} />
            </>)}

            <div style={STYLE_GRID}>
                <div style={{ fontWeight: 700, gridColumn: 1, gridRow: 1 }}>{parentTableName}</div>
                <div style={{ fontWeight: 700, gridColumn: 3, gridRow: 1, textAlign: "right" }}>
                    {childTableName}
                </div>

                {initArrowView(relationView, columnNamePairs.length + 1, colorTheme)}

                {columnNamePairs.map((pair, index) => {
                    const rowIndex = index + 2;
                    return (
                        <React.Fragment key={`relation-summary-column-pair_${index}`}>
                            <div style={{ gridColumn: 1, gridRow: rowIndex }}>{pair.parentColumnName}</div>
                            <div style={{ gridColumn: 3, gridRow: rowIndex, textAlign: "right" }}>
                                {pair.childColumnName}
                            </div>
                        </React.Fragment>
                    );
                })}
            </div>
            <div style={STYLE_ACTION_ROW}>
                <ReferenceAction kind="ON UPDATE" action={relation.onUpdateAction} />
                <ReferenceAction kind="ON DELETE" action={relation.onDeleteAction} />
            </div>
        </div>
    );
};

const STYLE_GRID: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "auto auto auto",
    justifyContent: "center",
    columnGap: 16,
    rowGap: 2
};

const initArrowView = (relationView: RelationViewModel, arrowRowSpan: number, colorTheme: ColorTheme) => {
    const relation = relationView.relationModel;
    const arrowColor = relationView.lineViewModel.color.toHex(colorTheme);

    const arrowStyle: React.CSSProperties = {
        minWidth: 36, display: "flex", flexDirection: "column", justifyContent: "center",
        gridColumn: 2, gridRow: `1 / span ${arrowRowSpan}`,
    };

    return (
        <div style={arrowStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.6rem", lineHeight: 1.2 }}>
                <span>{relation.parentCardinality}</span>
                <span>{relation.childCardinality}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center" }}>
                <div style={{ flex: 1, height: 2, backgroundColor: arrowColor }} />
                <div style={{
                    width: 0, height: 0, borderLeftColor: arrowColor,
                    borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "8px solid"
                }} />
            </div>
        </div>
    );
};

const STYLE_ACTION_ROW: React.CSSProperties = {
    display: "flex",
    justifyContent: "center",
    gap: 12,
    marginTop: 4,
    fontSize: "0.6rem",
    lineHeight: 1.2,
    color: "var(--mui-palette-erd-textMuted)"
};

type ReferenceActionProps = {
    kind: "ON UPDATE" | "ON DELETE",
    action: TableReferenceActionType
};

const ReferenceAction = ({ kind, action }: ReferenceActionProps) => {
    const icon = (kind === "ON UPDATE")
        ? <SyncIcon style={{ fontSize: "inherit" }} />
        : <DeleteOutlinedIcon style={{ fontSize: "inherit" }} />;

    return (
        <Tooltip title={`${kind} ${action}`} placement="bottom">
            <span style={STYLE_ACTION_ITEM}>{icon}{action}</span>
        </Tooltip>
    );
};

const STYLE_ACTION_ITEM: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 2 };

const toColumnNamePairs = (
    relation: RelationModel, parentTable: TableModel, childTable: TableModel, erdDocument: ErdDocument
) => {
    const parentColumnMap = toColumnModelMap(parentTable, erdDocument);
    const childColumnMap = toColumnModelMap(childTable, erdDocument);

    return relation.relationPairs.map(pair => {
        const parentColumnName = toColumnDisplayName(pair.parentColumnModelId, parentColumnMap, erdDocument);
        const childColumnName = toColumnDisplayName(pair.childColumnModelId, childColumnMap, erdDocument);

        return { parentColumnName, childColumnName };
    });
};

const toColumnModelMap = (table: TableModel, erdDocument: ErdDocument) => {
    const columns = erdDocument.toAllColumnsExceptStruct(table);
    return new Map(columns.map(column => [column.columnModelId, column]));
};

const toColumnDisplayName = (
    columnModelId: string, columnMap: Map<string, SimpleColumnModel>, erdDocument: ErdDocument
): string => {
    const columnModel = columnMap.get(columnModelId);
    if (columnModel == null) {
        return "";
    }

    const columnShare = erdDocument.findColumnShareModel(columnModel.columnShareModelId);
    if (columnShare == null) {
        return "";
    }

    const displayStyle = erdDocument.getDisplayNameStyle();
    const columnName = overrideColumnName(columnModel, columnShare);

    return displayStyle.displayName(columnName.physicalName, columnName.logicalName);
};

export default RelationSummaryCard;
