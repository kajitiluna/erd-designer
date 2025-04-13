import { Link, Stack, Typography } from "@mui/material";

const RegalFooter = () => {
    return (
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
    );
};

export default RegalFooter;