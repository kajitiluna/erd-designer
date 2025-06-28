import { SvgIcon } from "@mui/material";

type LineWidthIconProps = {
    width?: number;
};

const LineWidthIcon = ({ width = 1 }: LineWidthIconProps) => {
    return (
        <SvgIcon viewBox="0 0 24 24">
            <path
                d="M2,16 C10,16 14,8 22,8"
                stroke="currentColor"
                strokeWidth={(width > 0) ? width : 1}
                fill="none"
                strokeLinecap="round"
            />
        </SvgIcon>
    );
};

export default LineWidthIcon;