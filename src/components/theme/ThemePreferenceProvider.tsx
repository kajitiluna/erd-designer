import React from "react";
import { useColorScheme } from "@mui/material/styles";

import ThemePreferenceContext, { ThemePreferenceHolder } from "~/context/ThemePreferenceContext";
import type { SystemThemeResolver, ThemePreferenceStore } from "~/components/theme/ThemeHost";
import ThemePreference from "~/components/theme/ThemePreference";
import type { ColorTheme } from "~/models/ColorValue";

type ThemePreferenceProviderProps = {
    store: ThemePreferenceStore,
    resolver: SystemThemeResolver,
    children: React.ReactNode
};

/**
 * Holds the theme preference and applies the resolved mode to MUI.
 * Must be rendered inside MUI's ThemeProvider because `useColorScheme` requires it.
 */
const ThemePreferenceProvider = ({ store, resolver, children }: ThemePreferenceProviderProps) => {
    const [themePreference, setThemePreference] = React.useState<ThemePreference>(() => store.readInitial());
    const [systemColorTheme, setSystemColorTheme] = React.useState<ColorTheme>(() => resolver.resolve());

    // preference / store とは独立に保持し、永続化される値には影響させない。
    // 並行呼び出しを直列化すると後続が前の撮影完了まで待たされるため、
    // 参照カウントで「最後の呼び出しが終わるまで light を維持する」方式にする。
    // 先に終わった呼び出しが他方の撮影中に dark へ戻してしまうことを防ぐ。
    const [activeLightCount, setActiveLightCount] = React.useState(0);

    const colorTheme = initColorTheme(activeLightCount > 0, themePreference, systemColorTheme);

    const updatePreference = React.useCallback((nextPreference: ThemePreference) => {
        setThemePreference(nextPreference);
        store.save(nextPreference);
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

    const holder: ThemePreferenceHolder = React.useMemo(() => {
        return { preference: themePreference, colorTheme, updatePreference, withLightMode };
    }, [themePreference, colorTheme, updatePreference, withLightMode]);

    // 外部 (他タブ、他パネル) で変更された設定を取り込む
    React.useEffect(() => {
        return store.subscribe(setThemePreference);
    }, [store]);

    React.useEffect(() => {
        // 購読開始までに環境側が変わっていた場合に備えて、現在値を取り直す
        setSystemColorTheme(resolver.resolve());
        return resolver.subscribe(setSystemColorTheme);
    }, [resolver]);

    return (
        <ThemePreferenceContext.Provider value={holder}>
            <ThemeModeBridge colorTheme={colorTheme} />
            {children}
        </ThemePreferenceContext.Provider>
    );
};

// state 更新 → commit → MUI の effect による html クラス更新が済むまで、2 フレーム待つ。
const waitForAnimationFrames = (): Promise<void> => {
    return new Promise<void>(resolve => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => { resolve(); });
        });
    });
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

export default ThemePreferenceProvider;
