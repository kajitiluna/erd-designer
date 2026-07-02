import { resolveHighlightApi } from '~/features/canvas/highlightApi';

describe('resolveHighlightApi', () => {
    const originalHighlight = globalThis.Highlight;
    const originalCSS = globalThis.CSS;

    afterEach(() => {
        Object.defineProperty(globalThis, 'Highlight', {
            configurable: true,
            writable: true,
            value: originalHighlight,
        });
        Object.defineProperty(globalThis, 'CSS', {
            configurable: true,
            writable: true,
            value: originalCSS,
        });
    });

    test('should return null when Highlight is not supported', () => {
        Object.defineProperty(globalThis, 'Highlight', {
            configurable: true,
            writable: true,
            value: undefined,
        });

        expect(resolveHighlightApi()).toBeNull();
    });

    test('should return null when CSS.highlights is not supported', () => {
        Object.defineProperty(globalThis, 'CSS', {
            configurable: true,
            writable: true,
            value: {},
        });

        expect(resolveHighlightApi()).toBeNull();
    });

    test('should resolve api when Highlight and CSS.highlights are supported', () => {
        class FakeHighlight {
            constructor(...ranges: Range[]) {
                void ranges;
            }
        }

        const set = vi.fn();
        const deleteHighlight = vi.fn();
        const fakeHighlights = { set, delete: deleteHighlight } as unknown as HighlightRegistry;
        const fakeCss = { highlights: fakeHighlights } as unknown as typeof CSS;

        Object.defineProperty(globalThis, 'Highlight', {
            configurable: true,
            writable: true,
            value: FakeHighlight,
        });
        Object.defineProperty(globalThis, 'CSS', {
            configurable: true,
            writable: true,
            value: fakeCss,
        });

        const api = resolveHighlightApi();

        expect(api).not.toBeNull();
        expect(api?.Highlight).toBe(FakeHighlight);
        expect(api?.highlights).toBe(fakeHighlights);
    });
});
