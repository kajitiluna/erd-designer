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
                <ButtonBase disabled={disabled} onClick={onClick} sx={{
                    borderRadius: '8px', gap: 1, px: 0.5, "&.Mui-disabled": { opacity: 0.4 },
                    "&:hover": { backgroundColor: 'rgba(50, 50, 50, 0.06)' }
                }}>
                    <Box sx={{
                        display: 'flex', borderRadius: '25%', backgroundColor: 'rgba(50, 50, 50, 0.1)', p: '5px',
                        "& svg": { fontSize: '1.25rem' }
                    }}>
                        {children}
                    </Box>
                    <Typography variant="body2">{tooltip}</Typography>
                </ButtonBase>
            </TopLeftTooltip>
        );
    }

    const iconButton = (
        <IconButton disabled={disabled} onClick={onClick} size="small"
            sx={{
                borderRadius: '25%', backgroundColor: 'rgba(50, 50, 50, 0.1)',
                "&.Mui-disabled": { opacity: 0.4 },
            }}>
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

export default EdgedIconButton;
