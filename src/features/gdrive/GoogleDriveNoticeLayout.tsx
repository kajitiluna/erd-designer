
import React from "react";
import { Box } from "@mui/material";

import ErdAppLogo from "~/features/regal/ErdAppLogo";
import RegalFooter from "~/features/regal/RegalFooter";
import { gradientStyle } from "~/features/start_up/start-up-styles";

type GdriveNoticeLayoutProp = {
    children: React.ReactNode
};

const GoogleDriveNoticeLayout = ({ children }: GdriveNoticeLayoutProp) => {
    return (
        <Box sx={PAGE_STYLE}>
            <Box sx={CONTENT_STYLE} style={{ flex: 1 }}>
                <ErdAppLogo />
                {children}
            </Box>

            <RegalFooter />
        </Box>
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
