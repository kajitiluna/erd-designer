import { Box, Card, CardContent, SxProps, Theme, Typography } from "@mui/material";
import { ReactNode } from "react";

type FeatureCardProp = {
    icon: ReactNode;
    title: string;
    description: string;
    sx?: SxProps<Theme>;
};

const FeatureCard = ({ icon, title, description, sx }: FeatureCardProp) => {
    return (
        <Card variant="outlined" sx={{ borderRadius: "12px", borderColor: "#ece7f2", height: "100%", ...sx }}>
            <CardContent sx={{ padding: "26px 24px", "&:last-child": { paddingBottom: "26px" } }}>
                <Box sx={cardStyle}>{icon}</Box>
                <Typography sx={{ fontSize: 16, fontWeight: 600, color: "#1d1526", marginBottom: "8px" }}>
                    {title}
                </Typography>
                <Typography sx={{ fontSize: 14, lineHeight: 1.55, color: "#6b6478" }}>
                    {description}
                </Typography>
            </CardContent>
        </Card>
    );
};

const cardStyle = {
    width: 40,
    height: 40,
    borderRadius: "9px",
    backgroundColor: "#f1ecf7",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "14px",
};

export default FeatureCard;
