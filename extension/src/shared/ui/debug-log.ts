export type DebugLogger = {
  writeLine: (message: string) => void;
};

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export function createDebugLogger(element?: HTMLElement | null): DebugLogger {
  if (!element) {
    return {
      writeLine: () => {
        // Intentionally a no-op when debug element is not present on this page.
      },
    };
  }

  return {
    writeLine(message: string): void {
      const prefix = `[${timestamp()}] `;
      const line = `${prefix}${message}`;
      if (element.textContent === 'No debug output yet.') {
        element.textContent = line;
      } else {
        element.textContent = `${element.textContent || ''}\n${line}`;
      }
      element.scrollTop = element.scrollHeight;
    },
  };
}
