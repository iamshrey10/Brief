/** Where the tour has got to, kept for the life of the tab so a refresh or a move to another page does not lose the place. */
const KEY = "brief-tour-step";

const listeners = new Set<() => void>();
function announce() {
  for (const listener of listeners) listener();
}

/** For React to follow the saved step: called again whenever it is written or cleared in this tab. */
export function subscribeToTour(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The step the tour is on, or null when it is not open. Storage can be blocked, and then the tour simply is not remembered. */
export function readTourStep(total: number): number | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw === null) return null;
    const step = Number(raw);
    return Number.isInteger(step) && step >= 0 && step < total ? step : null;
  } catch {
    return null;
  }
}

export function writeTourStep(step: number): void {
  try {
    window.sessionStorage.setItem(KEY, String(step));
  } catch {
    // Not remembered, which only means a refresh closes the tour.
  }
  announce();
}

export function clearTourStep(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
  announce();
}
