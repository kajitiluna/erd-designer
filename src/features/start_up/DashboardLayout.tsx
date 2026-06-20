import { AppBar, Box, Stack, Toolbar, Typography } from "@mui/material";

import Logo from "~/logo.svg";
import ErdDocumentListPanel from "~/features/start_up/ErdDocumentListPanel";
import CreatePanel from "~/features/start_up/CreatePanel";
import RegalFooter from "~/features/regal/RegalFooter";
import GitHubLinkButton from "~/features/start_up/GitHubLinkButton";
import ErdDocumentStorage from "~/features/storage/ErdDocumentStorage";
import ErdDocument from "~/models/ErdDocument";
import ErdDocumentSummary from "~/features/storage/ErdDocumentSummary";

type DashboardLayoutProp = {
    documentStorage: ErdDocumentStorage;
    erdSummaries: ErdDocumentSummary[];
    onOpenDocument: (openDocument: ErdDocument, onSave: (document: ErdDocument, message: string) => void) => void;
    onSummariesUpdated: (summaries: ErdDocumentSummary[]) => void;
    onOpenCreateDialog: () => void;
    onOpenImportDialog: () => void;
};

const DashboardLayout = ({
    documentStorage, erdSummaries, onOpenDocument, onSummariesUpdated, onOpenCreateDialog, onOpenImportDialog,
}: DashboardLayoutProp) => {

    return (
        <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
            {appHeader()}
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 360px", flex: 1 }}>
                <ErdDocumentListPanel documentStorage={documentStorage} erdSummaries={erdSummaries}
                    onOpenDocument={onOpenDocument} onSummariesUpdated={onSummariesUpdated} />

                <CreatePanel onOpenCreateDialog={onOpenCreateDialog} onOpenImportDialog={onOpenImportDialog} />
            </Box>
            <RegalFooter />
        </Box>
    );
};

const appHeader = () => {
    return (
        <AppBar position="static" elevation={0} sx={{ backgroundColor: "primary.main" }}>
            <Toolbar sx={{ minHeight: "64px !important", justifyContent: "space-between" }}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                    <img src={Logo} alt="ERD Designer" width={36} height={36} style={{ borderRadius: 9 }} />
                    <Typography variant="h6" sx={{ fontWeight: 600, color: "#fff", letterSpacing: "-0.01em" }}>
                        ERD Designer
                    </Typography>
                </Stack>
                <GitHubLinkButton colorVariant="dark" />
            </Toolbar>
        </AppBar>
    );
};

export default DashboardLayout;
