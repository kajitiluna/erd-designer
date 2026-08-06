import { Box, Grid, Typography } from "@mui/material";
import TableChartIcon from "@mui/icons-material/TableChart";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

import RegalFooter from "~/features/regal/RegalFooter";
import DiagramActionButtons from "~/features/start_up/DiagramActionButtons";
import GitHubLinkButton from "~/features/start_up/GitHubLinkButton";
import FeatureCard from "~/components/FeatureCard";
import ErdAppLogo from "~/features/regal/ErdAppLogo";
import { descriptionStyle, gradientStyle } from "~/features/start_up/start-up-styles";
import { StartUpActions } from "~/features/start_up/support";

type HeroLayoutProp = {
    actions: StartUpActions;
};

const HeroLayout = ({ actions }: HeroLayoutProp) => {
    return (
        <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
            <Box sx={{ flex: 1 }}>
                <MainPanel actions={actions} />

                <ExplanationPanel />

                <Box sx={{ display: "flex", justifyContent: "center", marginTop: "28px", marginBottom: "48px" }}>
                    <GitHubLinkButton />
                </Box>
            </Box>
            <RegalFooter />
        </Box>
    );
};

const MainPanel = ({ actions }: HeroLayoutProp) => {
    return (
        <Box sx={mainPanelStyle}>
            <Box sx={{ maxWidth: 960, margin: "0 auto" }}>
                <ErdAppLogo />
                <Typography sx={descriptionTextStyle}>
                    A browser-based tool for designing database tables and relationships
                    through a graphical interface.
                </Typography>
                <DiagramActionButtons direction="row"
                    sx={{ justifyContent: "center", maxWidth: 742, margin: "0 auto" }}
                    actions={actions} />
            </Box>
        </Box>
    );
};

const mainPanelStyle = {
    ...gradientStyle,
    padding: "52px 64px 44px",
};

const descriptionTextStyle = {
    ...descriptionStyle,
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
