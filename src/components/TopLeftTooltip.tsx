import { Tooltip } from "@mui/material";
import { JSX } from "react";

type TopLeftTooltipProps = {
    title: string,
    children: JSX.Element
}

const TopLeftTooltip = ({ title, children }: TopLeftTooltipProps) => {
    const slotProps = {
        popper: {
            modifiers: [
                {
                    name: "offset",
                    options: { offset: [Math.sqrt(title.length) * (-20), -10] }
                }
            ]
        }
    }

    return (
        <Tooltip title={title} placement="top" slotProps={slotProps}>
            {children}
        </Tooltip>
    );
}

export default TopLeftTooltip;