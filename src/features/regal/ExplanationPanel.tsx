import { Box, Grid } from "@mui/material";
import TableChartIcon from "@mui/icons-material/TableChart";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

import FeatureCard from "~/components/FeatureCard";

const ExplanationPanel = () => {
    return (
        <Box sx={{ padding: "48px 64px", maxWidth: 960, margin: "0 auto", width: "100%" }}>
            <Grid container spacing={2.5}>
                <Grid size={4}>
                    <FeatureCard title="Visual table design"
                        icon={<TableChartIcon sx={{ fontSize: 22, color: "primary.main" }} />}
                        description="Design database tables and relationships via a drag-and-drop graphical interface." />
                </Grid>
                <Grid size={4}>
                    <FeatureCard title="Export & generate"
                        icon={<FileDownloadIcon sx={{ fontSize: 22, color: "primary.main" }} />}
                        description="Export PNG images of your diagrams and generate ready-to-run DDL files." />
                </Grid>
                <Grid size={4}>
                    <FeatureCard title="Reusable models"
                        icon={<ContentCopyIcon sx={{ fontSize: 22, color: "primary.main" }} />}
                        description="Reuse and share column models across tables for consistent schema design." />
                </Grid>
            </Grid>
        </Box>
    );
};

export default ExplanationPanel;
