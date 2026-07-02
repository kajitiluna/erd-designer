type HighlightApi = {
    Highlight: typeof Highlight;
    highlights: HighlightRegistry;
};

export const resolveHighlightApi = (): HighlightApi | null => {
    if (globalThis.Highlight == null) {
        return null;
    }

    if (globalThis.CSS == null) {
        return null;
    }

    if (globalThis.CSS.highlights == null) {
        return null;
    }

    return {
        Highlight: globalThis.Highlight,
        highlights: globalThis.CSS.highlights,
    };
};
