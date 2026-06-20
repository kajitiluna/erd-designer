import { Box, Link, Stack, Typography } from "@mui/material";

import appVersionSetting from "~/config/AppVersionSetting";

const RegalFooter = () => {
    const { appVersion } = appVersionSetting();
    const versionLabel = (appVersion ?? "").startsWith("v") ? appVersion : `v${appVersion}`;

    return (
        <Box sx={footerStyle}>
            <Stack direction="row" spacing={2.5}>
                <Link href="/erd-designer/terms_of_service" target="_blank" rel="noopener noreferrer" underline="none">
                    <Typography sx={{ fontSize: 13, color: "#9a93a6", "&:hover": { color: "#3a215a" } }}>
                        Terms of Service
                    </Typography>
                </Link>
                <Link href="/erd-designer/privacy_policy" target="_blank" rel="noopener noreferrer" underline="none">
                    <Typography sx={{ fontSize: 13, color: "#9a93a6", "&:hover": { color: "#3a215a" } }}>
                        Privacy Policy
                    </Typography>
                </Link>
            </Stack>
            <Typography sx={{ fontSize: 12, fontFamily: "Roboto Mono, monospace", color: "#bcb4c8" }}>
                {versionLabel}
            </Typography>
        </Box>
    );
};

const footerStyle = {
    borderTop: "1px solid #efeaf4",
    padding: "20px 64px",
    backgroundColor: "#faf9fc",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
};

export default RegalFooter;
