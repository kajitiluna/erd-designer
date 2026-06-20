import { Box, Divider, Stack, Typography } from "@mui/material";
import TableChartIcon from "@mui/icons-material/TableChart";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

import DiagramActionButtons from "~/features/start_up/DiagramActionButtons";

type CreatePanelProp = {
    onOpenCreateDialog: () => void;
    onOpenImportDialog: () => void;
};

const CreatePanel = ({ onOpenCreateDialog, onOpenImportDialog }: CreatePanelProp) => {
    return (
        <Box sx={createPanelStyle}>
            <Typography variant="h6" sx={{ fontWeight: 600, marginBottom: "8px" }}>
                Start designing
            </Typography>
            <Typography variant="body2" sx={{ lineHeight: 1.55, color: "text.secondary", marginBottom: "22px" }}>
                Create a new diagram or import an existing schema file.
            </Typography>
            <DiagramActionButtons direction="column" sx={{ marginBottom: "30px" }}
                onOpenCreateDialog={onOpenCreateDialog} onOpenImportDialog={onOpenImportDialog} />
            <Divider sx={{ borderColor: "brand.borderDivider" }} />
            {explainPanel()}
        </Box>
    );
};

const createPanelStyle = {
    backgroundColor: "brand.surfaceTinted",
    borderLeft: "1px solid",
    borderColor: "divider",
    padding: "36px 32px",
};

const explainPanel = () => {
    return (
        <Stack spacing={2} sx={{ paddingTop: "22px" }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
                <TableChartIcon sx={itemIconStyle} />
                <Typography sx={itemTextStyle}>
                    Graphical table & relationship design
                </Typography>
            </Stack>

            <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
                <FileDownloadIcon sx={itemIconStyle} />
                <Typography sx={itemTextStyle}>
                    Export PNG & generate DDL files
                </Typography>
            </Stack>

            <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
                <ContentCopyIcon sx={itemIconStyle} />
                <Typography sx={itemTextStyle}>
                    Reusable, shareable column models
                </Typography>
            </Stack>
        </Stack>
    );
};

const itemIconStyle = { fontSize: 18, flexShrink: 0 };
const itemTextStyle = { fontSize: "0.85rem", lineHeight: 1.5, color: "text.secondary" };

export default CreatePanel;
