import type { Page } from "@playwright/test";

/**
 * Waits until the page has stopped moving: every animation that has an end (a page rising into place, a fade) has finished, and
 * the ones that never end (a spinner, a pulse) are left alone. A scan of colours taken part way through a fade reads washed out
 * text, so the accessibility scans call this first. It gives up after three seconds, so an animation that never reports
 * finishing cannot hang a test.
 */
export async function settled(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => undefined)),
      ),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]),
  );
}
