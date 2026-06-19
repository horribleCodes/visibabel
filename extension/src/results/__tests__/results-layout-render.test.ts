const mockedGetLastResult = jest.fn();

jest.mock('../../shared/runtime-api', () => ({
  getLastResult: (...args: unknown[]) => mockedGetLastResult(...args),
}));

describe('results overlay rendering', () => {
  beforeEach(() => {
    jest.resetModules();
    mockedGetLastResult.mockReset();
    mockedGetLastResult.mockResolvedValue({});
    (globalThis as any).chrome = {
      runtime: {
        onMessage: {
          addListener: jest.fn(),
        },
      },
    };

    document.body.innerHTML = `
      <div id="root"></div>
      <div id="status"></div>
      <div id="result-original"></div>
      <div id="result-translated"></div>
      <button id="toolbar-toggle-image"></button>
      <div id="result-image-panel"></div>
      <div id="result-image-stage"></div>
      <img id="result-image" />
      <div id="overlay-container"></div>
    `;
  });

  afterEach(() => {
    delete (globalThis as any).chrome;
  });

  it('renders overlay boxes for layout', async () => {
    const { renderOverlay } = await import('../results');

    const overlayContainer = document.getElementById('overlay-container') as HTMLDivElement | null;
    const resultImage = document.getElementById('result-image') as HTMLImageElement | null;
    expect(overlayContainer).not.toBeNull();
    expect(resultImage).not.toBeNull();
    if (!overlayContainer || !resultImage) {
      return;
    }

    resultImage.width = 200;
    resultImage.height = 100;
    Object.defineProperty(resultImage, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(resultImage, 'naturalHeight', { value: 100, configurable: true });
    // Mock getBoundingClientRect to return nonzero size
    resultImage.getBoundingClientRect = () => ({
      width: 200,
      height: 100,
      top: 0,
      left: 0,
      bottom: 100,
      right: 200,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    const boxes = [
      { id: 'r1', x: 10, y: 10, width: 50, height: 20, label: 'A', groupId: 'g1', zIndex: 21 },
    ];

    renderOverlay(boxes);
    expect(overlayContainer.children.length).toBe(1);
    expect(overlayContainer.children[0].className).toBe('overlay-box');
  });
});
