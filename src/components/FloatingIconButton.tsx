import React from "react";
import { Box, IconButton } from "@mui/material";

type FloatingIconButtonProps = {
    ariaLabel: string,
    onClick: (event: React.MouseEvent<HTMLElement>) => void,
    children: React.ReactNode
};

// IconButton のホバー色は半透明のため、不透明な背景は外枠が持ち、ホバー時にキャンバスが透けないようにする
const FloatingIconButton = ({ ariaLabel, onClick, children }: FloatingIconButtonProps) => {
    return (
        <Box sx={FRAME_STYLE}>
            <IconButton aria-label={ariaLabel} onClick={onClick} sx={BUTTON_STYLE}>{children}</IconButton>
        </Box>
    );
};

const FRAME_STYLE = {
    borderRadius: "8px",
    boxShadow: "5px 5px 30px 0px var(--mui-palette-erd-panelShadow)",
    backgroundColor: "var(--mui-palette-erd-panelBackground)"
} as const;

const BUTTON_STYLE = { width: "48px", height: "48px", borderRadius: "8px" } as const;

export default FloatingIconButton;
