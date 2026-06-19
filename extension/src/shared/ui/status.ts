export interface StatusPresenter {
  info: (message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

export function createStatusPresenter(element: HTMLElement): StatusPresenter {
  const setStatusClass = (className: string): void => {
    element.classList.remove('status-info', 'status-success', 'status-error');
    element.classList.add(className);
  };

  return {
    info(message: string): void {
      setStatusClass('status-info');
      element.textContent = message;
    },
    success(message: string): void {
      setStatusClass('status-success');
      element.textContent = message;
    },
    error(message: string): void {
      setStatusClass('status-error');
      element.textContent = message;
    },
  };
}
