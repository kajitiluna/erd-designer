import React from "react";
import { Box, IconButton, Popover, Stack } from "@mui/material";
import CircleIcon from '@mui/icons-material/Circle';

import ColorValue from "~/models/ColorValue";
import ColorSelectorStyle from "./ColorSelector.module.css";

type ColorSelectorProps = {
    color?: ColorValue,
    shape?: "circle" | "rectangle",
    callback: (background: ColorValue, foreground: ColorValue) => void
};

const ColorSelector = ({ color = ColorValue.WHITE, shape = "circle", callback }: ColorSelectorProps) => {

    const [anchorElement, setAnchorElement] = React.useState<HTMLButtonElement | HTMLDivElement | null>(null);
    const innerCallback = (background: ColorValue, foreground: ColorValue) => {
        callback(background, foreground);
        setAnchorElement(null);
    };
    const handleClick = (event: React.MouseEvent<HTMLButtonElement | HTMLDivElement>) => {
        event.stopPropagation();

        setAnchorElement(event.currentTarget);
    }

    const selectorButton = (shape === "circle") ? (
        <IconButton onMouseDown={handleClick}>
            <CircleIcon sx={{
                color: color.toHex(),
                stroke: color.reverseGrayscale().toHex(), strokeWidth: "1px"
            }} />
        </IconButton>
    ) : (
        <Box onClick={handleClick} sx={{
            height: "30px",
            backgroundColor: color.toHex(),
            border: `1px solid ${color.reverseGrayscale().toHex()}`,
            borderRadius: "5px",
            margin: "10px"
        }} className={ColorSelectorStyle.colorSelector} />
    );

    return (<>
        {selectorButton}
        <Popover anchorEl={anchorElement} open={Boolean(anchorElement)}
            onClose={() => setAnchorElement(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}>
            <Stack direction="row" spacing={0.5}>
                {COLOR_PALLETS.map((pallets, rowIndex) => (
                    <Stack key={`color-select_${rowIndex}`}>
                        {pallets.map((pallet, columnIndex) => (
                            initColorPanel(
                                `color-select_${rowIndex}-${columnIndex}`,
                                color, pallet.background, pallet.foreground,
                                innerCallback, 0.95
                            )
                        ))}
                    </Stack>
                ))}
            </Stack>
        </Popover>
    </>);
};

const initColorPanel = (
    key: string, currentColor: ColorValue, backgroundColor: ColorValue, foregroundColor: ColorValue,
    callback: (background: ColorValue, foreground: ColorValue) => void, alpha: number = 1
) => {

    const selected = backgroundColor.equals(currentColor);
    const handleClicked = (event: React.MouseEvent) => {
        event.stopPropagation();
        callback(backgroundColor, foregroundColor)
    };

    const style = {
        padding: "5px",
        width: `${30 - (selected ? 4 * 2 : 0)}px`,
        height: `${20 - (selected ? 4 * 2 : 0)}px`,
        border: (selected ? "4px solid rgba(73, 76, 218, 1)" : ""),
        borderRadius: "1px",
        backgroundColor: backgroundColor.toHex(alpha)
    };

    return (
        <Box key={key} onClick={handleClicked}
            sx={style} className={ColorSelectorStyle.colorPanel}
        />
    );
};

const COLOR_PALLETS = [
    [
        { background: new ColorValue({ red: 250, green: 250, blue: 250 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 245, green: 245, blue: 245 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 238, green: 238, blue: 238 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 224, green: 224, blue: 224 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 189, green: 189, blue: 189 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 158, green: 158, blue: 158 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 117, green: 117, blue: 117 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 97, green: 97, blue: 97 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 66, green: 66, blue: 66 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 33, green: 33, blue: 33 }), foreground: ColorValue.WHITE },
    ],
    [
        { background: new ColorValue({ red: 255, green: 235, blue: 238 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 255, green: 205, blue: 210 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 239, green: 154, blue: 154 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 229, green: 115, blue: 115 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 239, green: 83, blue: 80 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 244, green: 67, blue: 54 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 229, green: 57, blue: 53 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 211, green: 47, blue: 47 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 198, green: 40, blue: 40 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 183, green: 28, blue: 28 }), foreground: ColorValue.WHITE },
    ],
    [
        { background: new ColorValue({ red: 252, green: 228, blue: 236 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 248, green: 187, blue: 208 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 244, green: 143, blue: 177 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 240, green: 98, blue: 146 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 236, green: 64, blue: 122 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 233, green: 30, blue: 99 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 216, green: 27, blue: 96 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 194, green: 24, blue: 91 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 173, green: 20, blue: 87 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 136, green: 14, blue: 79 }), foreground: ColorValue.WHITE },
    ],
    [
        { background: new ColorValue({ red: 243, green: 229, blue: 245 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 225, green: 190, blue: 231 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 206, green: 147, blue: 216 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 186, green: 104, blue: 200 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 171, green: 71, blue: 188 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 156, green: 39, blue: 176 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 142, green: 36, blue: 170 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 123, green: 31, blue: 162 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 106, green: 27, blue: 154 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 74, green: 20, blue: 140 }), foreground: ColorValue.WHITE },
    ],
    [
        { background: new ColorValue({ red: 237, green: 231, blue: 246 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 209, green: 196, blue: 233 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 179, green: 157, blue: 219 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 149, green: 117, blue: 205 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 126, green: 87, blue: 194 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 103, green: 58, blue: 183 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 94, green: 53, blue: 177 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 81, green: 45, blue: 168 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 69, green: 39, blue: 160 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 49, green: 27, blue: 146 }), foreground: ColorValue.WHITE },
    ],
    [
        { background: new ColorValue({ red: 232, green: 234, blue: 246 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 197, green: 202, blue: 233 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 159, green: 168, blue: 218 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 121, green: 134, blue: 203 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 92, green: 107, blue: 192 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 63, green: 81, blue: 181 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 57, green: 73, blue: 171 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 48, green: 63, blue: 159 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 40, green: 53, blue: 147 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 26, green: 35, blue: 126 }), foreground: ColorValue.WHITE },
    ],
    [
        { background: new ColorValue({ red: 227, green: 242, blue: 253 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 187, green: 222, blue: 251 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 144, green: 202, blue: 249 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 100, green: 181, blue: 246 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 66, green: 165, blue: 245 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 33, green: 150, blue: 243 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 30, green: 136, blue: 229 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 25, green: 118, blue: 210 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 21, green: 101, blue: 192 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 13, green: 71, blue: 161 }), foreground: ColorValue.WHITE },
    ],
    [
        { background: new ColorValue({ red: 225, green: 245, blue: 254 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 179, green: 229, blue: 252 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 129, green: 212, blue: 250 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 79, green: 195, blue: 247 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 41, green: 182, blue: 246 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 3, green: 169, blue: 244 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 3, green: 155, blue: 229 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 2, green: 136, blue: 209 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 2, green: 119, blue: 189 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 1, green: 87, blue: 155 }), foreground: ColorValue.WHITE },
    ],
    [
        { background: new ColorValue({ red: 224, green: 247, blue: 250 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 178, green: 235, blue: 242 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 128, green: 222, blue: 234 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 77, green: 208, blue: 225 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 38, green: 198, blue: 218 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 0, green: 188, blue: 212 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 0, green: 172, blue: 193 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 0, green: 151, blue: 167 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 0, green: 131, blue: 143 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 0, green: 96, blue: 100 }), foreground: ColorValue.WHITE },
    ],
    [
        { background: new ColorValue({ red: 224, green: 242, blue: 241 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 178, green: 223, blue: 219 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 128, green: 203, blue: 196 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 77, green: 182, blue: 172 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 38, green: 166, blue: 154 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 0, green: 150, blue: 136 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 0, green: 137, blue: 123 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 0, green: 121, blue: 107 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 0, green: 105, blue: 92 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 0, green: 77, blue: 64 }), foreground: ColorValue.WHITE },
    ],
    [
        { background: new ColorValue({ red: 232, green: 245, blue: 233 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 200, green: 230, blue: 201 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 165, green: 214, blue: 167 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 129, green: 199, blue: 132 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 102, green: 187, blue: 106 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 76, green: 175, blue: 80 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 67, green: 160, blue: 71 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 56, green: 142, blue: 60 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 46, green: 125, blue: 50 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 27, green: 94, blue: 32 }), foreground: ColorValue.WHITE },
    ],
    [
        { background: new ColorValue({ red: 241, green: 248, blue: 233 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 220, green: 237, blue: 200 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 197, green: 225, blue: 165 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 174, green: 213, blue: 129 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 156, green: 204, blue: 101 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 139, green: 195, blue: 74 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 124, green: 179, blue: 66 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 104, green: 159, blue: 56 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 85, green: 139, blue: 47 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 51, green: 105, blue: 30 }), foreground: ColorValue.WHITE },
    ],
    [
        { background: new ColorValue({ red: 249, green: 251, blue: 231 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 240, green: 244, blue: 195 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 230, green: 238, blue: 156 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 220, green: 231, blue: 117 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 212, green: 225, blue: 87 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 205, green: 220, blue: 57 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 192, green: 202, blue: 51 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 175, green: 180, blue: 43 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 158, green: 157, blue: 36 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 130, green: 119, blue: 23 }), foreground: ColorValue.WHITE },
    ],
    [
        { background: new ColorValue({ red: 255, green: 253, blue: 231 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 255, green: 249, blue: 196 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 255, green: 245, blue: 157 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 255, green: 241, blue: 118 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 255, green: 238, blue: 88 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 255, green: 235, blue: 59 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 253, green: 216, blue: 53 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 251, green: 192, blue: 45 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 249, green: 168, blue: 37 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 245, green: 127, blue: 23 }), foreground: ColorValue.BLACK },
    ],
    [
        { background: new ColorValue({ red: 255, green: 248, blue: 225 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 255, green: 236, blue: 179 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 255, green: 224, blue: 130 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 255, green: 213, blue: 79 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 255, green: 202, blue: 40 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 255, green: 193, blue: 7 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 255, green: 179, blue: 0 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 255, green: 160, blue: 0 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 255, green: 143, blue: 0 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 255, green: 111, blue: 0 }), foreground: ColorValue.BLACK },
    ],
    [
        { background: new ColorValue({ red: 255, green: 243, blue: 224 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 255, green: 224, blue: 178 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 255, green: 204, blue: 128 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 255, green: 183, blue: 77 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 255, green: 167, blue: 38 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 255, green: 152, blue: 0 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 251, green: 140, blue: 0 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 245, green: 124, blue: 0 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 239, green: 108, blue: 0 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 230, green: 81, blue: 0 }), foreground: ColorValue.WHITE },
    ],
    [
        { background: new ColorValue({ red: 251, green: 233, blue: 231 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 255, green: 204, blue: 188 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 255, green: 171, blue: 145 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 255, green: 138, blue: 101 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 255, green: 112, blue: 67 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 255, green: 87, blue: 34 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 244, green: 81, blue: 30 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 230, green: 74, blue: 25 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 216, green: 67, blue: 21 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 191, green: 54, blue: 12 }), foreground: ColorValue.WHITE },
    ],
    [
        { background: new ColorValue({ red: 239, green: 235, blue: 233 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 215, green: 204, blue: 200 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 188, green: 170, blue: 164 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 161, green: 136, blue: 127 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 141, green: 110, blue: 99 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 121, green: 85, blue: 72 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 109, green: 76, blue: 65 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 93, green: 64, blue: 55 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 78, green: 52, blue: 46 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 62, green: 39, blue: 35 }), foreground: ColorValue.WHITE },
    ],
    [
        { background: new ColorValue({ red: 236, green: 239, blue: 241 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 207, green: 216, blue: 220 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 176, green: 190, blue: 197 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 144, green: 164, blue: 174 }), foreground: ColorValue.BLACK },
        { background: new ColorValue({ red: 120, green: 144, blue: 156 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 96, green: 125, blue: 139 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 84, green: 110, blue: 122 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 69, green: 90, blue: 100 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 55, green: 71, blue: 79 }), foreground: ColorValue.WHITE },
        { background: new ColorValue({ red: 38, green: 50, blue: 56 }), foreground: ColorValue.WHITE },
    ]
];

export default ColorSelector;
