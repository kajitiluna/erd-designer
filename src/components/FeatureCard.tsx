import { ReactNode } from "react";
import { Box, Card, CardContent, SxProps, Theme, Typography } from "@mui/material";

type FeatureCardProp = {
    icon: ReactNode;
    title: string;
    description: string;
    sx?: SxProps<Theme>;
};

const FeatureCard = ({ icon, title, description, sx }: FeatureCardProp) => {
    return (
        <Card variant="outlined" sx={{ borderRadius: "12px", borderColor: "brand.borderCard", height: "100%", ...sx }}>
            <CardContent sx={{ padding: "26px 24px", "&:last-child": { paddingBottom: "26px" } }}>
                <Box sx={CARD_STYLE}>{icon}</Box>
                <Typography sx={{ fontSize: 16, fontWeight: 600, color: "text.primary", marginBottom: "8px" }}>
                    {title}
                </Typography>
                <Typography sx={{ fontSize: 14, lineHeight: 1.55, color: "text.secondary" }}>
                    {description}
                </Typography>
            </CardContent>
        </Card>
    );
};

const CARD_STYLE = {
    width: 40,
    height: 40,
    borderRadius: "9px",
    backgroundColor: "brand.surfaceIconBg",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "14px",
} as const;

export default FeatureCard;
