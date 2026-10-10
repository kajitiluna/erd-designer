import React from "react";
import { render, act, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

import erdTheme from "~/components/ErdTheme";
import ThemePreference from "~/components/theme/ThemePreference";
import ThemePreferenceProvider from "~/components/theme/ThemePreferenceProvider";
import type { SystemThemeResolver, ThemePreferenceStore } from "~/components/theme/ThemeHost";
import ThemePreferenceContext from "~/context/ThemePreferenceContext";
import type { ThemePreferenceHolder } from "~/context/ThemePreferenceContext";

const store: ThemePreferenceStore = {
    readInitial: () => ThemePreference.DARK,
    save: () => { /* do nothing */ },
    subscribe: () => { return () => { /* do nothing */ }; }
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
            <ThemePreferenceProvider store={store} resolver={resolver}>
                <Probe holderRef={holderRef} />
            </ThemePreferenceProvider>
        </ThemeProvider>
    );
    return holderRef;
};

const currentColorTheme = (holderRef: HolderRef) => {
    return holderRef.current?.colorTheme;
};

describe("ThemePreferenceProvider.withLightMode", () => {
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
