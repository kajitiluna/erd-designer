import { Button, Stack } from "@mui/material";
import { SxProps, Theme } from "@mui/material/styles";

import { containedButtonStyle } from "~/features/start_up/start-up-styles";

type DiagramActionButtonsProp = {
    onOpenCreateDialog: () => void;
    onOpenImportDialog: () => void;
    direction: "row" | "column";
    sx?: SxProps<Theme>;
};

const DiagramActionButtons = ({
    onOpenCreateDialog, onOpenImportDialog, direction, sx
}: DiagramActionButtonsProp) => {

    const isFullWidth = direction === "column";
    const createButtonSx = (direction === "row") ? { ...containedButtonStyle, flex: 1 } : containedButtonStyle;
    const importButtonSx = (direction === "row") ? { ...importButtonStyle, flex: 1 } : importButtonStyle;

    return (
        <Stack direction={direction} spacing={1.75} sx={sx}>
            <Button variant="contained" size="large" fullWidth={isFullWidth} sx={createButtonSx}
                onClick={onOpenCreateDialog}>
                + Create New ER Diagram
            </Button>
            <Button variant="outlined" size="large" fullWidth={isFullWidth} sx={importButtonSx}
                onClick={onOpenImportDialog}>
                Import from .erd file
            </Button>
        </Stack>
    );
};

const importButtonStyle = {
    fontSize: 15,
    padding: "14px 26px",
    borderRadius: "9px",
    backgroundColor: "#fff",
    borderColor: "brand.borderButtonOutline",
    color: "primary.main",
    "&:hover": {
        backgroundColor: "brand.heroGradientStart",
        borderColor: "brand.borderButtonOutline",
    },
};

export default DiagramActionButtons;
