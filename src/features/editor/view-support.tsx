import { Box, Stack, TextField } from "@mui/material";

import { GRID_CELL_STYLE } from "~/components/constant";
import ForeignKeyIcon from "~/components/icons/ForeignKeyIcon";
import PrimaryKeyIcon from "~/components/icons/PrimaryKeyIcon";
import { initHandleChangePattern, initHandleChangePhysicalName } from "~/features/editor/support";
import ColumnShareModelStorage from "~/models/ColumnShareModelStorage";
import { Database } from "~/models/database";
import ColumnModel from "~/models/database/ColumnModel";
import ColumnType from "~/models/database/ColumnType";
import { overrideColumnName } from "~/models/database/support";

export const initGridColumnHeaders = (
    columnModels: ColumnModel[], columnShareModelStorage: ColumnShareModelStorage,
    isChildRelation: (columnModelId: string) => boolean
) => {
    // ヘッダータイトル
    const keyIconHeaderStyle = initGridColumnHeaderStyle(10);
    const headerTitle = (
        <Stack direction="row" sx={{ alignItems: "center" }}>
            <Box sx={keyIconHeaderStyle}>PK</Box>
            <Box sx={keyIconHeaderStyle}>FK</Box>
            <Box sx={initGridColumnHeaderStyle(200)}>Physical Name</Box>
        </Stack>
    );
    const attributeHeaders = columnModels.map(columnModel => {
        const columnShareModel = columnShareModelStorage.find(columnModel.columnShareModelId);
        if (columnShareModel == null) {
            console.warn(`ColumnShareModel not found for columnModelId: ${columnModel.columnModelId}`);
            return {
                key: columnModel.columnModelId,
                content: (
                    <span key={`attribute-header_${columnModel.columnModelId}`}>
                        Unknown Column
                    </span>
                )
            };
        }

        const overrideName = overrideColumnName(columnModel, columnShareModel);
        const inChildRelation = isChildRelation(columnModel.columnModelId);

        return {
            key: columnModel.columnModelId,
            content: (
                <Stack key={`attribute-header_${columnModel.columnModelId}`}
                    direction="row" sx={{ alignItems: "center" }}>
                    <Box sx={initGridColumnTitleStyle(10, true)}>
                        {columnModel.primaryKey && <PrimaryKeyIcon />}
                    </Box>
                    <Box sx={initGridColumnTitleStyle(10)}>
                        {inChildRelation && <ForeignKeyIcon />}
                    </Box>
                    <Box sx={initGridColumnTitleStyle(200, true)}>
                        {overrideName.physicalName}
                    </Box>
                </Stack>
            )
        };
    });

    return { headerTitle, attributeHeaders };
};

const initGridColumnHeaderStyle = (width: number): React.CSSProperties => {
    return {
        ...GRID_CELL_STYLE,
        minWidth: `${width}px`,
        maxWidth: `${width}px`,
        minHeight: "24px"
    };
};

const initGridColumnTitleStyle = (width: number, withBackgroundColor: boolean = false): React.CSSProperties => {
    return {
        ...GRID_CELL_STYLE,
        minWidth: `${width}px`,
        maxWidth: `${width}px`,
        backgroundColor: withBackgroundColor ? "action.hover" : ""
    };
};

export type ExtraOption = {
    characterSet: string,
    collate: string,
    optionExpression: string
};

type ExtraOptionPanelProps<EXTRA_OPTION extends ExtraOption> = {
    optionType: "table",
    extraOption: EXTRA_OPTION,
    database: Database,
    onUpdateExtraOption: (updateFunction: (prevOptions: EXTRA_OPTION) => EXTRA_OPTION) => void
} | {
    optionType: "column",
    extraOption: EXTRA_OPTION,
    disabled: boolean,
    database: Database,
    columnType: ColumnType,
    onUpdateExtraOption: (updateFunction: (prevOptions: EXTRA_OPTION) => EXTRA_OPTION) => void
};

export const initOptionCollatePanel = <EXTRA_OPTION extends ExtraOption>(
    props: ExtraOptionPanelProps<EXTRA_OPTION>
) => {
    const { optionType, extraOption, database, onUpdateExtraOption } = props;
    // charset, collate を指定できるのは以下のパターン
    // - 対象がテーブルの場合 : supportsTableCollate が true のとき
    // - 対象がカラムの場合 : editableCharSet が true のとき
    const availableCollate = ((optionType === "table") && database.supportsTableCollate) ||
        ((optionType === "column") && (props.columnType.category === "text"));
    if (availableCollate === false) {
        return null;
    }

    const handleChangeCharacterSet = initHandleChangePhysicalName((updating: string) => {
        onUpdateExtraOption(previous => {
            if (previous.characterSet === updating) {
                return previous;
            }

            return { ...previous, characterSet: updating };
        });
    });

    const handleChangeCollate = initHandleChangePattern((updating: string) => {
        onUpdateExtraOption(previous => {
            if (previous.collate === updating) {
                return previous;
            }

            return { ...previous, collate: updating };
        });
    }, database.collatePattern);

    const disabled = (optionType === "column") && props.disabled;

    return (
        <Stack direction="row" spacing={1}>
            {database.editableCharacterSet && (
                <TextField id="extraOptionCharset" label="Character Set" disabled={disabled}
                    size="small" fullWidth variant="outlined"
                    value={extraOption.characterSet} onChange={handleChangeCharacterSet} />
            )}
            <TextField id="extraOptionCollate" label="Collate" disabled={disabled}
                size="small" fullWidth variant="outlined"
                value={extraOption.collate} onChange={handleChangeCollate} />
        </Stack>
    );
};