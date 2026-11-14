/**
 * Visit counting with Google Analytics, for the public first page only and only after a visitor says yes.
 * It is never started inside the app, where documents are, and it is switched off again the moment the visitor leaves the first page.
 */
const ID_PATTERN = /^G-[A-Z0-9]{6,14}$/;
const SCRIPT_ID = "google-analytics-script";
const CHOICE_KEY = "brief-analytics-choice";

/** The measurement id from the settings, or null when none is set or it is not shaped like one, so nothing loads by mistake. */
export function analyticsId(raw: string | undefined = process.env.NEXT_PUBLIC_GA_ID): string | null {
  const id = raw?.trim() ?? "";
  return ID_PATTERN.test(id) ? id : null;
}

export type AnalyticsChoice = "accepted" | "declined" | null;

const listeners = new Set<() => void>();
function announce() {
  for (const listener of listeners) listener();
}

export function subscribeToChoice(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === CHOICE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** What the visitor chose, kept in this browser. Storage can be blocked, and then they are simply asked again next time. */
export function readChoice(): AnalyticsChoice {
  try {
    const value = window.localStorage.getItem(CHOICE_KEY);
    return value === "accepted" || value === "declined" ? value : null;
  } catch {
    return null;
  }
}

export function writeChoice(choice: Exclude<AnalyticsChoice, null>): void {
  try {
    window.localStorage.setItem(CHOICE_KEY, choice);
  } catch {
    // Not remembered, which only means the notice comes back next visit.
  }
  announce();
}

type AnalyticsWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void } & Record<string, unknown>;

/** Starts counting this visit: addresses are shortened, and advertising features are off. */
export function startAnalytics(id: string): void {
  const w = window as unknown as AnalyticsWindow;
  w[`ga-disable-${id}`] = false;
  if (document.getElementById(SCRIPT_ID)) return;
  w.dataLayer = w.dataLayer ?? [];
  // Google's loader reads the arguments object itself, so this has to push arguments and not an array.
  w.gtag = function () {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments);
  };
  w.gtag("js", new Date());
  w.gtag("config", id, { anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false });
  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
}

/** Stops sending anything, which Google's own switch does for the rest of this page session. */
export function stopAnalytics(id: string): void {
  (window as unknown as AnalyticsWindow)[`ga-disable-${id}`] = true;
}
