import { Box, Grid, Stack, Typography } from "@mui/material";
import TableChartIcon from "@mui/icons-material/TableChart";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

import Logo from "~/logo.svg";
import RegalFooter from "~/features/regal/RegalFooter";
import DiagramActionButtons from "~/features/start_up/DiagramActionButtons";
import GitHubLinkButton from "~/features/start_up/GitHubLinkButton";
import FeatureCard from "~/components/FeatureCard";

type HeroLayoutProp = {
    onOpenCreateDialog: () => void;
    onOpenImportDialog: () => void;
};

const HeroLayout = ({ onOpenCreateDialog, onOpenImportDialog }: HeroLayoutProp) => {
    return (
        <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
            <Box sx={{ flex: 1 }}>
                <MainPanel onOpenCreateDialog={onOpenCreateDialog} onOpenImportDialog={onOpenImportDialog} />

                <ExplanationPanel />

                <Box sx={{ display: "flex", justifyContent: "center", marginTop: "28px", marginBottom: "48px" }}>
                    <GitHubLinkButton />
                </Box>
            </Box>
            <RegalFooter />
        </Box>
    );
};

const MainPanel = ({ onOpenCreateDialog, onOpenImportDialog }: HeroLayoutProp) => {
    return (
        <Box sx={mainPanelStyle}>
            <Box sx={{ maxWidth: 960, margin: "0 auto" }}>
                <Stack direction="row" spacing={3.5}
                    sx={{ alignItems: "center", justifyContent: "center", marginBottom: "24px" }}>
                    <img src={Logo} alt="ERD Designer" width={160} height={160} style={{ flexShrink: 0 }} />
                    <Typography variant="h3" sx={{ fontWeight: 700, lineHeight: 1.15, letterSpacing: "-0.02em" }}>
                        Entity Relationship<br />Diagram Designer
                    </Typography>
                </Stack>
                <Typography sx={descriptionStyle}>
                    A browser-based tool for designing database tables and relationships
                    through a graphical interface.
                </Typography>
                <DiagramActionButtons direction="row" sx={{ justifyContent: "center", maxWidth: 490, margin: "0 auto" }}
                    onOpenCreateDialog={onOpenCreateDialog} onOpenImportDialog={onOpenImportDialog} />
            </Box>
        </Box>
    );
};

const mainPanelStyle = {
    background: "linear-gradient(180deg, #f6f3fa 0%, #ffffff 100%)",
    borderBottom: "1px solid #efeaf4",
    padding: "52px 64px 44px",
};

const descriptionStyle = {
    fontSize: 17,
    lineHeight: 1.55,
    color: "text.secondary",
    textAlign: "center",
    maxWidth: 540,
    margin: "0 auto 28px",
};

const ExplanationPanel = () => {
    const cardStyle = { fontSize: 22, color: "primary.main" };

    return (
        <Box sx={{ padding: "48px 64px", maxWidth: 960, margin: "0 auto", width: "100%" }}>
            <Grid container spacing={2.5}>
                <Grid size={4}>
                    <FeatureCard title="Visual table design" icon={<TableChartIcon sx={cardStyle} />}
                        description="Design database tables and relationships via a drag-and-drop graphical interface." />
                </Grid>
                <Grid size={4}>
                    <FeatureCard title="Export & generate" icon={<FileDownloadIcon sx={cardStyle} />}
                        description="Export PNG images of your diagrams and generate ready-to-run DDL files." />
                </Grid>
                <Grid size={4}>
                    <FeatureCard title="Reusable models" icon={<ContentCopyIcon sx={cardStyle} />}
                        description="Reuse and share column models across tables for consistent schema design." />
                </Grid>
            </Grid>
        </Box>
    );
};

export default HeroLayout;
