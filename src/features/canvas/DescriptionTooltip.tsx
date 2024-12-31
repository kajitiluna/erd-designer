import { Tooltip, TooltipProps } from "@mui/material";
import React from "react";

const DescriptionTooltip = (props: TooltipProps) => {
    // const WrapperTooltip = styled(({ className, ...props }: TooltipProps) => (
    //     <Tooltip {...props} classes={{ popper: className }} />
    // ))(({ theme }) => ({
    //     [`& .${tooltipClasses.tooltip}`]: {
    //         color: "#FFFFFF",
    //         boxShadow: theme.shadows[1],
    //         fontSize: 14,
    //         padding: 10
    //     },
    // }));

    const title = ((props.title) && (typeof props.title === "string"))
        ? props.title.trim().split("\n").map(
            (line, index) => (<React.Fragment key={index}>{line}<br /></React.Fragment>)
        ) : props.title;

    // TODO WrapperTooltip を指定すると何故か親の onDoubleClick が動作しなくなるので、いったん通常の Tooltip を指定
    return (
        <Tooltip placement="top-end" title={title}>
            {props.children}
        </Tooltip>
    );
};

export default DescriptionTooltip;
