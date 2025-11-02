import React from 'react';
import { IconButton, Stack, Typography } from '@mui/material';

import TopLeftTooltip from '~/components/TopLeftTooltip';

type EdgedIconButtonProps = {
    disabled?: boolean,
    tooltip?: string,
    withText?: boolean,
    onClick: (event: React.MouseEvent) => void,
    children: React.ReactNode
};

const EdgedIconButton = ({
    disabled = false, tooltip = "", withText = false,
    onClick, children
}: EdgedIconButtonProps) => {

    const iconButton = (
        <IconButton disabled={disabled} onClick={onClick} size="small"
            sx={{
                borderRadius: '25%',
                backgroundColor: 'rgba(50, 50, 50, 0.1)',
            }}>
            {children}
        </IconButton>
    );

    if (!tooltip) {
        return (
            <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}>
                {iconButton}
            </Stack>
        );
    }

    if (disabled) {
        return (
            <Stack direction="row" alignItems="center" spacing={1}>
                {iconButton}
                {withText && <Typography variant="body2">{tooltip}</Typography>}
            </Stack>
        );
    }

    return (
        <Stack direction="row" alignItems="center" spacing={1}>
            <TopLeftTooltip title={tooltip}>{iconButton}</TopLeftTooltip>
            {withText && <Typography variant="body2">{tooltip}</Typography>}
        </Stack>
    );
};

export default EdgedIconButton;
