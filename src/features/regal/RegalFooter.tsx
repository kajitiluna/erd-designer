import { Box, Link, Stack, Typography } from "@mui/material";

import appVersionSetting from "~/config/AppVersionSetting";

const RegalFooter = () => {
    return (
        <Box sx={{ position: "relative", width: "100%" }}>
            <Stack direction="row" spacing={4} sx={{ p: 4 }} justifyContent="center">
                <Link href="/erd-designer/terms_of_service" target="_blank" rel="noopener noreferrer">
                    <Typography variant="body2">
                        Terms of Service
                    </Typography>
                </Link>
                <Link href="/erd-designer/privacy_policy" target="_blank" rel="noopener noreferrer">
                    <Typography variant="body2">
                        Privacy Policy
                    </Typography>
                </Link>
            </Stack>
            <Box sx={{position: "absolute", right: 16,bottom: 30}}>
                <Typography variant="caption" color="text.secondary">
                    Version: {appVersionSetting().appVersion}
                </Typography>
            </Box>
        </Box>
    );
};

export default RegalFooter;