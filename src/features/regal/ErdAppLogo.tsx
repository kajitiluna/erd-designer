
import { Stack, Typography } from "@mui/material";
import Logo from "~/logo.svg";

const ErdAppLogo = () => {
    return (<>
        <Stack direction="row" spacing={3.5}
            sx={{ alignItems: "center", justifyContent: "center", marginBottom: "24px" }}>
            <img src={Logo} alt="ERD Designer" width={160} height={160} style={{ flexShrink: 0 }} />
            <Typography variant="h3" sx={{ fontWeight: 700, lineHeight: 1.15, letterSpacing: "-0.02em" }}>
                Entity Relationship<br />Diagram Designer
            </Typography>
        </Stack>
    </>);
};

export default ErdAppLogo;