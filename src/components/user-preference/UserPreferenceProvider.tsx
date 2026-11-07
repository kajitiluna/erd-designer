import React from "react";
import { useColorScheme } from "@mui/material/styles";

import PanelLayoutContext, { PanelLayoutHolder } from "~/context/PanelLayoutContext";
import ThemePreferenceContext, { ThemePreferenceHolder } from "~/context/ThemePreferenceContext";
import type SystemThemeResolver from "~/components/theme/SystemThemeResolver";
import ThemePreference from "~/components/theme/ThemePreference";
import PanelLayout from "~/components/user-preference/PanelLayout";
import type { PanelLayoutType } from "~/components/user-preference/PanelLayout";
import type UserPreferenceStore from "~/components/user-preference/UserPreferenceStore";
import type { ColorTheme } from "~/models/ColorValue";

type UserPreferenceProviderProps = {
    store: UserPreferenceStore,
    resolver: SystemThemeResolver,
    children: React.ReactNode
};

/**
 * Holds the stored theme preference and panel layout, and applies the resolved theme mode to MUI.
 * Must be rendered inside MUI's ThemeProvider because `useColorScheme` requires it.
 */
const UserPreferenceProvider = ({ store, resolver, children }: UserPreferenceProviderProps) => {
    const themePreferenceHolder = useThemePreference(store, resolver);
    const panelLayoutHolder = usePanelLayout(store);

    return (
        <ThemePreferenceContext.Provider value={themePreferenceHolder}>
            <PanelLayoutContext.Provider value={panelLayoutHolder}>
                <ThemeModeBridge colorTheme={themePreferenceHolder.colorTheme} />
                {children}
            </PanelLayoutContext.Provider>
        </ThemePreferenceContext.Provider>
    );
};

const useThemePreference = (store: UserPreferenceStore, resolver: SystemThemeResolver): ThemePreferenceHolder => {
    const [themePreference, setThemePreference] = React.useState<ThemePreference>(() => {
        return ThemePreference.toObject(store.readInitial("themePreference"));
    });
    const [systemColorTheme, setSystemColorTheme] = React.useState<ColorTheme>(() => resolver.resolve());

    // preference / store とは独立に保持し、永続化される値には影響させない。
    // 並行呼び出しを直列化すると後続が前の撮影完了まで待たされるため、
    // 参照カウントで「最後の呼び出しが終わるまで light を維持する」方式にする。
    // 先に終わった呼び出しが他方の撮影中に dark へ戻してしまうことを防ぐ。
    const [activeLightCount, setActiveLightCount] = React.useState(0);

    const colorTheme = initColorTheme(activeLightCount > 0, themePreference, systemColorTheme);

    const updatePreference = React.useCallback((nextPreference: ThemePreference) => {
        setThemePreference(nextPreference);
        store.save("themePreference", nextPreference.value);
    }, [store]);

    const withLightMode = React.useCallback(async <RESULT,>(task: () => Promise<RESULT>): Promise<RESULT> => {
        setActiveLightCount(count => count + 1);

        try {
            await waitForAnimationFrames();

            return await task();
        } finally {
            setActiveLightCount(count => count - 1);
        }
    }, []);

    const themePreferenceHolder: ThemePreferenceHolder = React.useMemo(() => {
        return { preference: themePreference, colorTheme, updatePreference, withLightMode };
    }, [themePreference, colorTheme, updatePreference, withLightMode]);

    // 外部 (他タブ、他パネル) で変更された設定を取り込む
    React.useEffect(() => {
        return store.subscribe("themePreference", value => {
            const nextPreference = ThemePreference.toObject(value);
            setThemePreference(nextPreference);
        });
    }, [store]);

    React.useEffect(() => {
        // 購読開始までに環境側が変わっていた場合に備えて、現在値を取り直す
        // oxlint-disable-next-line react/set-state-in-effect -- 外部 (OS 設定) の現在値との同期
        setSystemColorTheme(resolver.resolve());
        return resolver.subscribe(setSystemColorTheme);
    }, [resolver]);

    return themePreferenceHolder;
};

const initColorTheme = (
    forcedLightMode: boolean, preference: ThemePreference, systemColorTheme: ColorTheme
): ColorTheme => {
    if (forcedLightMode) {
        return "light";
    }

    if (preference === ThemePreference.DEFAULT) {
        return systemColorTheme;
    }

    return (preference === ThemePreference.DARK) ? "dark" : "light";
};

// state 更新 → commit → MUI の effect による html クラス更新が済むまで、2 フレーム待つ。
const waitForAnimationFrames = (): Promise<void> => {
    return new Promise<void>(resolve => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => { resolve(); });
        });
    });
};

const usePanelLayout = (store: UserPreferenceStore): PanelLayoutHolder => {
    const [panelLayout, setPanelLayout] = React.useState<PanelLayoutType>(() => {
        return PanelLayout.toObject(store.readInitial("panelLayout"));
    });

    // 他のタブやパネルでの変更は購読しない。表示中のパネルの形が勝手に変わらないよう、次に開いたときに反映する。
    const updatePanelLayout = React.useCallback((nextLayout: PanelLayoutType) => {
        setPanelLayout(nextLayout);
        store.save("panelLayout", nextLayout);
    }, [store]);

    const panelLayoutHolder: PanelLayoutHolder = React.useMemo(() => {
        return { panelLayout, updatePanelLayout };
    }, [panelLayout, updatePanelLayout]);

    return panelLayoutHolder;
};

type ThemeModeBridgeProps = {
    colorTheme: ColorTheme
};

// MUI の "system" は使わず、解決済みの light / dark だけを渡して mode の決定元を 1 か所にする。
const ThemeModeBridge = ({ colorTheme }: ThemeModeBridgeProps) => {
    const { setMode } = useColorScheme();

    React.useEffect(() => {
        setMode(colorTheme);
    }, [colorTheme, setMode]);

    return null;
};

export default UserPreferenceProvider;