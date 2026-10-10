import React from 'react';
import { Box, ButtonBase, IconButton, Stack, Typography } from '@mui/material';

import TopLeftTooltip from '~/components/TopLeftTooltip';

type EdgedIconButtonProps = {
    disabled?: boolean,
    tooltip?: string,
    withText?: boolean,
    onClick: (event: React.MouseEvent) => void,
    children: React.ReactNode
};

const EdgedIconButton = ({
    disabled = false, tooltip = "", withText = false, onClick, children
}: EdgedIconButtonProps) => {

    if (withText && (tooltip !== "")) {
        return (
            <TopLeftTooltip title={tooltip}>
                <ButtonBase disabled={disabled} onClick={onClick} sx={WITH_TEXT_EDGE_STYLE}>
                    <Box sx={WITH_TEXT_LAYOUT_STYLE}>{children}</Box>
                    <Typography variant="body2">{tooltip}</Typography>
                </ButtonBase>
            </TopLeftTooltip>
        );
    }

    const iconButton = (
        <IconButton disabled={disabled} onClick={onClick} size="small" sx={ONLY_ICON_STYLE}>
            {children}
        </IconButton>
    );

    if (tooltip === "") {
        return (
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "center" }}>
                {iconButton}
            </Stack>
        );
    }

    if (disabled) {
        return (
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>{iconButton}</Stack>
        );
    }

    return (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <TopLeftTooltip title={tooltip}>{iconButton}</TopLeftTooltip>
        </Stack>
    );
};

const WITH_TEXT_EDGE_STYLE = {
    borderRadius: '8px', gap: 1, px: 0.5, "&.Mui-disabled": { opacity: 0.4 },
    "&:hover": { backgroundColor: 'var(--mui-palette-erd-edgedButtonHover)' }
} as const;

const WITH_TEXT_LAYOUT_STYLE = {
    display: 'flex', borderRadius: '25%', p: '5px',
    backgroundColor: 'var(--mui-palette-erd-edgedButtonBackground)',
    "& svg": { fontSize: '1.25rem' }
} as const;

const ONLY_ICON_STYLE = {
    borderRadius: '25%', backgroundColor: 'var(--mui-palette-erd-edgedButtonBackground)',
    "&.Mui-disabled": { opacity: 0.4 },
} as const;

export default EdgedIconButton;
