import { Box, Stack } from "@mui/material";
import { GRID_CELL_STYLE } from "~/components/constant";
import ForeignKeyIcon from "~/components/icons/ForeignKeyIcon";
import PrimaryKeyIcon from "~/components/icons/PrimaryKeyIcon";

import ColumnShareModelStorage from "~/models/ColumnShareModelStorage";
import ColumnModel from "~/models/database/ColumnModel";
import { overrideColumnName } from "~/models/database/support";

export const initGridColumnHeaders = (
    columnModels: ColumnModel[], columnShareModelStorage: ColumnShareModelStorage,
    isChildRelation: (columnModelId: string) => boolean
) => {
    // ヘッダータイトル
    const keyIconHeaderStyle = initHeaderStyle(10);
    const headerTitle = (
        <Stack direction="row" alignItems="center">
            <Box sx={keyIconHeaderStyle}>PK</Box>
            <Box sx={keyIconHeaderStyle}>FK</Box>
            <Box sx={initHeaderStyle(200)}>Physical Name</Box>
        </Stack>
    );
    const attributeHeaders = columnModels.map(columnModel => {
        const columnShareModel = columnShareModelStorage.find(columnModel.columnShareModelId);
        if (columnShareModel == null) {
            console.warn(`ColumnShareModel not found for columnModelId: ${columnModel.columnModelId}`);
            return {
                key: columnModel.columnModelId,
                content: <span>Unknown Column</span>
            };
        }

        const overrideName = overrideColumnName(columnModel, columnShareModel);
        const inChildRelation = isChildRelation(columnModel.columnModelId);

        return {
            key: columnModel.columnModelId,
            content: (
                <Stack direction="row" alignItems="center">
                    <Box sx={initTitleStyle(10, true)}>
                        {columnModel.primaryKey && <PrimaryKeyIcon />}
                    </Box>
                    <Box sx={initTitleStyle(10)}>
                        {inChildRelation && <ForeignKeyIcon />}
                    </Box>
                    <Box sx={initTitleStyle(200, true)}>
                        {overrideName.physicalName}
                    </Box>
                </Stack>
            )
        };
    });

    return { headerTitle, attributeHeaders };
};

const initHeaderStyle = (width: number): React.CSSProperties => {
    return {
        ...GRID_CELL_STYLE,
        minWidth: `${width}px`,
        maxWidth: `${width}px`,
        minHeight: "24px"
    };
};

const initTitleStyle = (width: number, withBackgroundColor: boolean = false): React.CSSProperties => {
    return {
        ...GRID_CELL_STYLE,
        minWidth: `${width}px`,
        maxWidth: `${width}px`,
        backgroundColor: withBackgroundColor ? "action.hover" : ""
    };
};