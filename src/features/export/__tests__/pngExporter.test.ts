import html2canvas from 'html2canvas';
import { downloadPng } from '~/features/export/pngExporter';
import { calculateImageArea } from '~/features/canvas/canvasArea';

vi.mock('html2canvas', () => ({
    default: vi.fn(),
}));

vi.mock('~/features/canvas/canvasArea', () => ({
    calculateImageArea: vi.fn(),
}));

const mockedHtml2canvas = vi.mocked(html2canvas);
const mockedCalculateImageArea = vi.mocked(calculateImageArea);

describe('downloadPng', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('should keep translate and reset only scale for bounds and clone', async () => {
        const originalTransform = 'translate(120px, 48px) scale(2)';
        const expectedTransform = 'translate(120px, 48px) scale(1)';

        const erdCanvas = document.createElement('div');
        erdCanvas.style.transform = originalTransform;
        Object.defineProperty(erdCanvas, 'scrollWidth', { value: 1200 });
        Object.defineProperty(erdCanvas, 'scrollHeight', { value: 900 });
        erdCanvas.getBoundingClientRect = vi.fn(() => ({
            left: 100,
            top: 200,
            right: 600,
            bottom: 500,
            width: 500,
            height: 300,
            x: 100,
            y: 200,
            toJSON: () => ({}),
        } as DOMRect));

        let transformWhenCalculatingBounds = '';
        mockedCalculateImageArea.mockImplementation((canvasElement: HTMLElement) => {
            transformWhenCalculatingBounds = canvasElement.style.transform;
            return { leftEdge: 200, topEdge: 300, rightEdge: 400, bottomEdge: 600 };
        });

        const fakeDrawCanvas = document.createElement('canvas');
        fakeDrawCanvas.toDataURL = vi.fn(() => 'data:image/png;base64,mock');
        mockedHtml2canvas.mockResolvedValue(fakeDrawCanvas);

        const exportImage = vi.fn();
        downloadPng(erdCanvas, exportImage);

        await Promise.resolve();

        expect(transformWhenCalculatingBounds).toBe(expectedTransform);
        expect(erdCanvas.style.transform).toBe(originalTransform);

        const html2canvasArguments = mockedHtml2canvas.mock.calls[0];
        const options = html2canvasArguments[1];
        expect(options).toBeDefined();
        if (options == null) {
            throw new Error('html2canvas options were not provided');
        }
        expect(options.onclone).toBeDefined();
        if (options.onclone == null) {
            throw new Error('onclone callback was not provided');
        }
        const clonedElement = document.createElement('div');
        await options.onclone(document, clonedElement);
        expect(clonedElement.style.transform).toBe(expectedTransform);
    });

    test('should restore original transform even if bounds calculation fails', () => {
        const originalTransform = 'translate(32px, 64px) scale(1.5)';
        const erdCanvas = document.createElement('div');
        erdCanvas.style.transform = originalTransform;
        erdCanvas.getBoundingClientRect = vi.fn(() => new DOMRect());

        mockedCalculateImageArea.mockImplementation(() => {
            throw new Error('failed');
        });

        expect(() => downloadPng(erdCanvas, vi.fn())).toThrow('failed');
        expect(erdCanvas.style.transform).toBe(originalTransform);
    });
});
