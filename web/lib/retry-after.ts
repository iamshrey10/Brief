/** The length of the rate limit window, in seconds. Kept here so the limiter and this agree. */
export const WINDOW_SECONDS = 60;

/** How long until the current fixed window ends and the person's count starts again, rounded up, from 1 to 60. */
export function secondsUntilNextWindow(nowMs: number = Date.now()): number {
  const intoWindow = (nowMs / 1000) % WINDOW_SECONDS;
  return Math.ceil(WINDOW_SECONDS - intoWindow);
}
