import React from "react";
import ColorValue from "~/models/ColorValue";

export type LocalSetting = {
    defaultColor: { background: ColorValue, foreground: ColorValue },
    stickySize: { width: number, height: number },
    stickyFontSize: number
};

export type LocalSettingAction =
    { type: "defaultColor", color: { background: ColorValue, foreground: ColorValue } }
    | { type: "stickySize", size: { width: number, height: number } }
    | { type: "stickyFontSize", fontSize: number };

export const reduceLocalSetting = (current: LocalSetting, action: LocalSettingAction) => {
    if (action.type === "defaultColor") {
        if (current.defaultColor.background.isEqual(action.color.background)
            && current.defaultColor.foreground.isEqual(action.color.foreground)) {
            return current;
        }

        return { ...current, defaultColor: action.color };
    }

    if (action.type === "stickySize") {
        if ((current.stickySize.width === action.size.width)
            && (current.stickySize.height === action.size.height)) {
            return current;
        }

        return { ...current, stickySize: action.size };
    }

    if (action.type === "stickyFontSize") {
        if (current.stickyFontSize === action.fontSize) {
            return current;
        }

        return { ...current, stickyFontSize: action.fontSize };
    }

    return current;
};

export const DEFAULT_LOCAL_SETTING = {
    defaultColor: {
        background: new ColorValue({ red: 227, green: 242, blue: 253 }),
        foreground: ColorValue.BLACK
    },
    stickySize: { width: 100, height: 100 },
    stickyFontSize: 9
};

type LocalSettingReducer = {
    localSetting: LocalSetting,
    dispatchLocalSetting: (action: LocalSettingAction) => void
};


export const LocalSettingContext = React.createContext<LocalSettingReducer>({} as LocalSettingReducer);
