import React from "react";

import PanelLayout from "~/components/user-preference/PanelLayout";
import type { PanelLayoutType } from "~/components/user-preference/PanelLayout";

export type PanelLayoutHolder = {

    /** The display form of the control panel. */
    panelLayout: PanelLayoutType,

    updatePanelLayout: (layout: PanelLayoutType) => void
};

const PanelLayoutContext = React.createContext<PanelLayoutHolder>({
    panelLayout: PanelLayout.initial(),
    updatePanelLayout: () => { /* Provider 外では変更先が無いため何もしない */ }
});

export default PanelLayoutContext;
