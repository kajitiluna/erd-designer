import { MouseEvent, ReactNode } from 'react';
import { IconButton, Stack, Tooltip, Typography } from '@mui/material';

type EdgedIconButtonProps = {
    disabled?: boolean,
    tooltip?: string,
    withText?: boolean,
    onClick: (event: MouseEvent) => void,
    children: ReactNode
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

    if (!tooltip || disabled) {
        return (
            <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}>
                {iconButton}
            </Stack>
        );
    }

    if (withText === false) {
        return (
            <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}>
                <Tooltip title={tooltip} placement="top">{iconButton}</Tooltip>
            </Stack>
        );
    }

    return (
        <Stack direction="row" alignItems="center" spacing={1}>
            <Tooltip title={tooltip} placement="top">{iconButton}</Tooltip>
            {withText && <Typography variant="body2">{tooltip}</Typography>}
        </Stack>
    );
};

export default EdgedIconButton;
