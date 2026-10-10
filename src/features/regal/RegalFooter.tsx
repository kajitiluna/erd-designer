import { Box, Link, Stack, Typography } from "@mui/material";

import appVersionSetting from "~/config/AppVersionSetting";

const RegalFooter = () => {
    const { appVersion } = appVersionSetting();
    const versionLabel = (appVersion ?? "").startsWith("v") ? appVersion : `v${appVersion}`;

    return (
        <Box sx={footerStyle}>
            <Stack direction="row" spacing={2.5}>
                <Link href="/erd-designer/terms_of_service" target="_blank" rel="noopener noreferrer" underline="none">
                    <Typography sx={{ fontSize: 13, color: TEXT_MUTED_COLOR, "&:hover": { color: PRIMARY_COLOR } }}>
                        Terms of Service
                    </Typography>
                </Link>
                <Link href="/erd-designer/privacy_policy" target="_blank" rel="noopener noreferrer" underline="none">
                    <Typography sx={{ fontSize: 13, color: TEXT_MUTED_COLOR, "&:hover": { color: PRIMARY_COLOR } }}>
                        Privacy Policy
                    </Typography>
                </Link>
            </Stack>
            <Typography sx={{ fontSize: 12, fontFamily: "Roboto Mono, monospace", color: TEXT_FAINT_COLOR }}>
                {versionLabel}
            </Typography>
        </Box>
    );
};

// StartUp 配下では brand 系の CSS 変数が、Google Drive 通知画面など外側テーマのみの配下では標準トークンが使われるよう、
// 前者を優先し後者へフォールバックする。
const TEXT_MUTED_COLOR = "var(--startup-palette-brand-textMuted, var(--mui-palette-text-secondary))";
const TEXT_FAINT_COLOR = "var(--startup-palette-brand-textFaint, var(--mui-palette-text-disabled))";
const PRIMARY_COLOR = "var(--startup-palette-primary-main, var(--mui-palette-primary-main))";
const DIVIDER_COLOR = "var(--startup-palette-divider, var(--mui-palette-divider))";
const SURFACE_COLOR = "var(--startup-palette-brand-surfaceTinted, var(--mui-palette-background-default))";

const footerStyle = {
    borderTop: `1px solid ${DIVIDER_COLOR}`,
    padding: "20px 64px",
    backgroundColor: SURFACE_COLOR,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
};

export default RegalFooter;
