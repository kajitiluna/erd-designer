import { Box, Stack, Typography } from "@mui/material";

import Logo from "~/logo.svg";
import ExplanationPanel from "~/features/regal/ExplanationPanel";
import RegalFooter from "~/features/regal/RegalFooter";
import DiagramActionButtons from "~/features/start_up/DiagramActionButtons";
import GitHubLinkButton from "~/features/start_up/GitHubLinkButton";

type HeroLayoutProp = {
    onOpenCreateDialog: () => void;
    onOpenImportDialog: () => void;
};

const HeroLayout = ({ onOpenCreateDialog, onOpenImportDialog }: HeroLayoutProp) => {
    return (
        <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
            <Box sx={{ flex: 1 }}>
                {mainPanel({ onOpenCreateDialog, onOpenImportDialog })}

                <ExplanationPanel />

                <Box sx={{ display: "flex", justifyContent: "center", marginTop: "28px", marginBottom: "48px" }}>
                    <GitHubLinkButton />
                </Box>
            </Box>
            <RegalFooter />
        </Box>
    );
};

const mainPanel = ({ onOpenCreateDialog, onOpenImportDialog }: HeroLayoutProp) => {
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
                <DiagramActionButtons direction="row" sx={{ justifyContent: "center", maxWidth: 480, margin: "0 auto" }}
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

export default HeroLayout;
