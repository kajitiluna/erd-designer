
import React from "react";
import { Box } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";

import ErdAppLogo from "~/features/regal/ErdAppLogo";
import RegalFooter from "~/features/regal/RegalFooter";
import { gradientStyle } from "~/features/start_up/start-up-styles";
import startUpTheme from "~/features/start_up/StartUpTheme";

type GdriveNoticeLayoutProp = {
    children: React.ReactNode
};

const GoogleDriveNoticeLayout = ({ children }: GdriveNoticeLayoutProp) => {
    // 共通スタイル (start-up-styles) が StartUp 側の CSS 変数を参照するため、StartUp と同じテーマで包む。
    // mode は外側 (App) の ThemeProvider から継承するため、ここでは保存を持たない。
    return (
        <ThemeProvider theme={startUpTheme} storageManager={null}>
            <Box sx={PAGE_STYLE}>
                <Box sx={CONTENT_STYLE} style={{ flex: 1 }}>
                    <ErdAppLogo />
                    {children}
                </Box>

                <RegalFooter />
            </Box>
        </ThemeProvider>
    );
};

const PAGE_STYLE = {
    ...gradientStyle,
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh"
} as const;

const CONTENT_STYLE = {
    marginTop: 8,
    display: "flex",
    flexDirection: "column",
    alignItems: "center"
} as const;

export default GoogleDriveNoticeLayout;
