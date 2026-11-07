import React from "react";
import { Tooltip, TooltipProps } from "@mui/material";

const DescriptionTooltip = (props: TooltipProps) => {
    const title = ((props.title) && (typeof props.title === "string"))
        ? props.title.trim().split("\n").map(
            (line, index) => (<React.Fragment key={index}>{line}<br /></React.Fragment>)
        ) : props.title;

    return (
        <Tooltip {...props} title={title}>
            {props.children}
        </Tooltip>
    );
};

export default DescriptionTooltip;
