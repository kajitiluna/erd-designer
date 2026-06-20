import { Button } from "@mui/material";
import CodeIcon from "@mui/icons-material/Code";

const GITHUB_URL = "https://github.com/kajitiluna/erd-designer";

type GitHubLinkButtonProp = {
    colorVariant?: "light" | "dark";
};

const GitHubLinkButton = ({ colorVariant = "light" }: GitHubLinkButtonProp) => {
    const buttonStyle = colorVariant === "dark" ? darkButtonStyle : lightButtonStyle;

    return (
        <Button variant="outlined" sx={buttonStyle}
            startIcon={<CodeIcon sx={{ width: 17, height: 17 }} />}
            rel="noopener noreferrer" component="a" target="_blank" href={GITHUB_URL}>
            GitHub
        </Button>
    );
};

const lightButtonStyle = {
    fontSize: 14,
    fontWeight: 500,
    padding: "11px 22px",
    borderRadius: "8px",
    borderColor: "brand.borderButtonOutline",
    color: "primary.main",
    "&:hover": {
        backgroundColor: "brand.heroGradientStart",
        borderColor: "brand.borderButtonOutline",
    },
};

const darkButtonStyle = {
    fontSize: 14,
    fontWeight: 500,
    padding: "5px 15px",
    borderRadius: "8px",
    borderColor: "rgba(255,255,255,.25)",
    color: "#fff",
    "&:hover": {
        backgroundColor: "rgba(255,255,255,.1)",
        borderColor: "rgba(255,255,255,.25)",
    },
};

export default GitHubLinkButton;
