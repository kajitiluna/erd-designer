import React from "react";

import ThemePreference from "~/components/theme/ThemePreference";
import type { ColorTheme } from "~/models/ColorValue";

export type ThemePreferenceHolder = {

    /** The user's choice, including "default". */
    preference: ThemePreference,

    /** The color theme actually rendered: `preference`, or the host's mode when `preference` is "default". */
    colorTheme: ColorTheme,

    updatePreference: (preference: ThemePreference) => void,

    /**
     * Runs `task` with the rendered mode forced to "light" without touching `preference`, then restores it.
     * Used for artifacts that must not depend on the on-screen theme, such as exported images.
     */
    withLightMode: <RESULT>(task: () => Promise<RESULT>) => Promise<RESULT>
};

const ThemePreferenceContext = React.createContext<ThemePreferenceHolder>({
    preference: ThemePreference.initial(),
    colorTheme: "light",
    updatePreference: () => { /* Provider 外では変更先が無いため何もしない */ },
    withLightMode: task => task()
});

export default ThemePreferenceContext;
