import React from "react";
import { render, act, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

import erdTheme from "~/components/ErdTheme";
import ThemePreference from "~/components/theme/ThemePreference";
import type SystemThemeResolver from "~/components/theme/SystemThemeResolver";
import UserPreferenceProvider from "~/components/user-preference/UserPreferenceProvider";
import type { PanelLayoutType } from "~/components/user-preference/PanelLayout";
import type UserPreferenceStore from "~/components/user-preference/UserPreferenceStore";
import type { UserPreferenceKey } from "~/components/user-preference/UserPreferenceStore";
import PanelLayoutContext from "~/context/PanelLayoutContext";
import type { PanelLayoutHolder } from "~/context/PanelLayoutContext";
import ThemePreferenceContext from "~/context/ThemePreferenceContext";
import type { ThemePreferenceHolder } from "~/context/ThemePreferenceContext";

const store: UserPreferenceStore = {
    readInitial: () => ThemePreference.DARK.value,
    save: () => { /* do nothing */ },
    subscribe: () => { return () => { /* do nothing */ }; }
};

const initStubStore = (initialValues: Partial<Record<UserPreferenceKey, unknown>>) => {
    const save = vi.fn<UserPreferenceStore["save"]>();
    const subscribe = vi.fn<UserPreferenceStore["subscribe"]>(() => { return () => { /* do nothing */ }; });
    const stubStore: UserPreferenceStore = {
        readInitial: key => initialValues[key],
        save,
        subscribe
    };

    return { stubStore, save, subscribe };
};

const resolver: SystemThemeResolver = {
    resolve: () => "light",
    subscribe: () => { return () => { /* do nothing */ }; }
};

type HolderRef = { current: ThemePreferenceHolder | undefined };

const Probe = ({ holderRef }: { holderRef: HolderRef }) => {
    const holder = React.useContext(ThemePreferenceContext);

    React.useEffect(() => {
        holderRef.current = holder;
    }, [holderRef, holder]);

    return null;
};

const renderProvider = (): HolderRef => {
    const holderRef: HolderRef = { current: undefined };
    render(
        <ThemeProvider theme={erdTheme} defaultMode="light" storageManager={null}>
            <UserPreferenceProvider store={store} resolver={resolver}>
                <Probe holderRef={holderRef} />
            </UserPreferenceProvider>
        </ThemeProvider>
    );
    return holderRef;
};

const currentColorTheme = (holderRef: HolderRef) => {
    return holderRef.current?.colorTheme;
};

describe("UserPreferenceProvider.withLightMode", () => {
    beforeEach(() => {
        // jsdom の描画サイクルに依存しないよう、フレーム待ちをタイマーで代替する。
        // 同期で解決すると state の commit 前に task が走ってしまう。
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
            return setTimeout(() => { callback(0); }, 0) as unknown as number;
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test("task 実行中は light、終了後に dark へ戻り、戻り値が返る", async () => {
        const holderRef = renderProvider();
        await waitFor(() => { expect(currentColorTheme(holderRef)).toBe("dark"); });
        let themeInTask: string | undefined;

        const result = await holderRef.current?.withLightMode(async () => {
            themeInTask = currentColorTheme(holderRef);
            return 42;
        });

        expect(result).toBe(42);
        expect(themeInTask).toBe("light");
        await waitFor(() => { expect(currentColorTheme(holderRef)).toBe("dark"); });
    });

    test("task が reject しても dark へ戻り、エラーは伝播する", async () => {
        const holderRef = renderProvider();
        await waitFor(() => { expect(currentColorTheme(holderRef)).toBe("dark"); });

        const promise = holderRef.current?.withLightMode(async () => { throw new Error("boom"); });

        await expect(promise).rejects.toThrow("boom");
        await waitFor(() => { expect(currentColorTheme(holderRef)).toBe("dark"); });
    });

    test("重なった呼び出しは最後の終了まで light を維持する", async () => {
        const holderRef = renderProvider();
        await waitFor(() => { expect(currentColorTheme(holderRef)).toBe("dark"); });
        let releaseFirst: () => void = () => { /* replaced below */ };
        let firstStarted = false;

        const firstPromise = holderRef.current?.withLightMode(() => {
            firstStarted = true;
            return new Promise<void>(resolve => { releaseFirst = resolve; });
        });
        await waitFor(() => { expect(firstStarted).toBe(true); });

        await holderRef.current?.withLightMode(async () => { /* 後発が先に完了する */ });
        // 後発の終了後に再描画が走っても light のままであることを確認する
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
        expect(currentColorTheme(holderRef)).toBe("light");

        releaseFirst();
        await firstPromise;
        await waitFor(() => { expect(currentColorTheme(holderRef)).toBe("dark"); });
    });
});

type PanelLayoutHolderRef = { current: PanelLayoutHolder | undefined };

const PanelLayoutProbe = ({ holderRef }: { holderRef: PanelLayoutHolderRef }) => {
    const holder = React.useContext(PanelLayoutContext);

    React.useEffect(() => {
        holderRef.current = holder;
    }, [holderRef, holder]);

    return null;
};

const renderPanelLayoutProvider = (panelLayoutStore: UserPreferenceStore): PanelLayoutHolderRef => {
    const holderRef: PanelLayoutHolderRef = { current: undefined };
    render(
        <ThemeProvider theme={erdTheme} defaultMode="light" storageManager={null}>
            <UserPreferenceProvider store={panelLayoutStore} resolver={resolver}>
                <PanelLayoutProbe holderRef={holderRef} />
            </UserPreferenceProvider>
        </ThemeProvider>
    );
    return holderRef;
};

describe("UserPreferenceProvider panelLayout", () => {
    test("保存済みの compact が初期値になる", () => {
        const { stubStore } = initStubStore({ panelLayout: "compact" });

        const holderRef = renderPanelLayoutProvider(stubStore);

        expect(holderRef.current?.panelLayout).toBe("compact");
    });

    test.each([undefined, "wide", 1])("未保存または不正値 %j は normal", (storedValue) => {
        const { stubStore } = initStubStore({ panelLayout: storedValue });

        const holderRef = renderPanelLayoutProvider(stubStore);

        expect(holderRef.current?.panelLayout).toBe("normal");
    });

    test("updatePanelLayout で Context の値が変わり、保存される", async () => {
        const { stubStore, save } = initStubStore({});
        const holderRef = renderPanelLayoutProvider(stubStore);
        const nextLayout: PanelLayoutType = "compact";

        act(() => { holderRef.current?.updatePanelLayout(nextLayout); });

        await waitFor(() => { expect(holderRef.current?.panelLayout).toBe("compact"); });
        expect(save).toHaveBeenCalledWith("panelLayout", "compact");
    });

    test("購読するのは themePreference だけで、panelLayout は購読しない", () => {
        const { stubStore, subscribe } = initStubStore({});

        renderPanelLayoutProvider(stubStore);

        const subscribedKeys = subscribe.mock.calls.map(call => call[0]);
        expect(subscribedKeys).toEqual(["themePreference"]);
    });
});
