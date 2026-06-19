export type BadgeState = 'loading' | 'online' | 'offline' | 'degraded';

const stateLabel: Record<BadgeState, string> = {
  loading: 'Checking...',
  online: 'Online',
  offline: 'Offline',
  degraded: 'Degraded',
};

export function setBadgeState(element: HTMLElement, state: BadgeState, label?: string): void {
  element.classList.remove('loading', 'online', 'offline', 'degraded');
  element.classList.add(state);
  element.textContent = label || stateLabel[state];
}
