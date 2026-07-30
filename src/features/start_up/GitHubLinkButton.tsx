import { useEffect, useState } from "react";
import { Box, Button } from "@mui/material";
import StarBorderIcon from "@mui/icons-material/StarBorder";

const GITHUB_URL = "https://github.com/kajitiluna/erd-designer";
const GITHUB_REPOSITORY_API_URL = "https://api.github.com/repos/kajitiluna/erd-designer";

type GitHubLinkButtonProp = {
    colorVariant?: "light" | "dark";
};

const GitHubLinkButton = ({ colorVariant = "light" }: GitHubLinkButtonProp) => {
    const [starCount, setStarCount] = useState<number | null>(null);

    useEffect(() => {
        const abortController = new AbortController();
        loadStarCount(abortController.signal).then(count => setStarCount(count));
        return () => abortController.abort();
    }, []);

    const buttonStyle = colorVariant === "dark" ? darkButtonStyle : lightButtonStyle;
    const countStyle = colorVariant === "dark" ? darkCountStyle : lightCountStyle;

    return (
        <Button variant="outlined" sx={buttonStyle}
            startIcon={<StarBorderIcon sx={{ width: 17, height: 17 }} />}
            rel="noopener noreferrer" component="a" target="_blank" href={GITHUB_URL}>
            Star on GitHub
            {(starCount != null) && (
                <Box component="span" sx={countStyle}>{formatStarCount(starCount)}</Box>
            )}
        </Button>
    );
};

/**
 * The star count is decoration, never a precondition for rendering the link: the unauthenticated
 * GitHub API is rate limited per client IP, so an absent count is an expected outcome rather than
 * a failure worth surfacing.
 */
const loadStarCount = async (signal: AbortSignal): Promise<number | null> => {
    try {
        const response = await fetch(GITHUB_REPOSITORY_API_URL, { signal });
        if (response.ok === false) {
            return null;
        }
        const repository = await response.json() as { stargazers_count?: number };
        const starCount = repository.stargazers_count;
        return (starCount == null) ? null : starCount;
    } catch {
        return null;
    }
};

const formatStarCount = (starCount: number): string => {
    if (starCount < 1000) {
        return String(starCount);
    }
    const thousands = starCount / 1000;
    return `${thousands.toFixed(1)}k`;
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

const countBaseStyle = {
    marginLeft: "9px",
    paddingLeft: "9px",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
};

const lightCountStyle = {
    ...countBaseStyle,
    borderLeft: "1px solid",
    borderColor: "brand.borderButtonOutline",
};

const darkCountStyle = {
    ...countBaseStyle,
    borderLeft: "1px solid rgba(255,255,255,.25)",
};

export default GitHubLinkButton;
