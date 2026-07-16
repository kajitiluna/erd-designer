import React from "react";
import {
    Accordion, AccordionDetails, AccordionSummary, Box, IconButton, Stack, TextField, Tooltip, Typography
} from "@mui/material";
import ClearIcon from '@mui/icons-material/Clear';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';

import { GRID_CELL_STYLE } from "~/components/constant";
import ForeignKeyIcon from "~/components/icons/ForeignKeyIcon";
import PrimaryKeyIcon from "~/components/icons/PrimaryKeyIcon";
import {
    initHandleChangePattern, initHandleChangePhysicalName, initHandleEnterKeyDown
} from "~/features/editor/support";
import ColumnShareModelStorage from "~/models/ColumnShareModelStorage";
import { Database } from "~/models/database";
import ColumnType from "~/models/database/ColumnType";
import SimpleColumnModel from "~/models/database/SimpleColumnModel";
import { overrideColumnName } from "~/models/database/support";

export const initGridColumnHeaders = (
    columnModels: SimpleColumnModel[], columnShareModelStorage: ColumnShareModelStorage,
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
        const columnShareModel = columnShareModelStorage.findColumnShare(columnModel.columnShareModelId);
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

type OverrideNamePanelProps = {
    physicalName: string,
    logicalName: string,
    onCompleted: (overriddenName: { physical: string, logical: string }) => void
};

export const useOverrideNamePanel = ({ physicalName, logicalName, onCompleted }: OverrideNamePanelProps) => {
    const [overriddenPhysicalName, setOverriddenPhysicalName] = React.useState<string>(physicalName);
    const [overriddenLogicalName, setOverriddenLogicalName] = React.useState<string>(logicalName);

    const initClearButton = (value: string, setValue: (value: string) => void) => {
        return value == "" ? {} : {
            input: {
                endAdornment: <IconButton size="small" onClick={() => setValue("")}>
                    <ClearIcon />
                </IconButton>
            }
        }
    };

    const overriddenName = {
        physical: overriddenPhysicalName,
        logical: overriddenLogicalName
    };

    const handleEnterDown = initHandleEnterKeyDown(
        () => onCompleted(overriddenName)
    );

    const overriddenPanel = (
        <Accordion disableGutters defaultExpanded={(overriddenPhysicalName != "") || (overriddenLogicalName != "")}>
            <AccordionSummary id="override-names-header"
                aria-controls="override-names-content" expandIcon={<ExpandMoreIcon />}>
                <Stack direction="row" spacing={2} sx={{ alignItems: "center", width: "100%" }}>
                    <Typography variant="body2">Override Names (optional)</Typography>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                        <Tooltip placement="right" arrow title={messageForOverrideNames}>
                            <HelpOutlineOutlinedIcon fontSize="small" />
                        </Tooltip>
                    </Box>
                </Stack>
            </AccordionSummary>
            <AccordionDetails>
                <Stack direction="row" spacing={1}>
                    <TextField label="Physical Name" fullWidth variant="outlined" size="small"
                        slotProps={initClearButton(overriddenPhysicalName, setOverriddenPhysicalName)}
                        value={overriddenPhysicalName} onKeyDown={handleEnterDown}
                        onChange={initHandleChangePhysicalName(setOverriddenPhysicalName)} />
                    <TextField label="Logical Name" fullWidth variant="outlined" size="small"
                        slotProps={initClearButton(overriddenLogicalName, setOverriddenLogicalName)}
                        value={overriddenLogicalName} onKeyDown={handleEnterDown}
                        onChange={event => setOverriddenLogicalName(event.target.value)} />
                </Stack>
            </AccordionDetails>
        </Accordion>
    );

    return { overriddenPanel, overriddenName };
};

const messageForOverrideNames =
    "Allows you to override physical or logical names defined in the column model for this specific column." +
    " This is useful when you want to customize names individually while maintaining shared column definitions.";

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