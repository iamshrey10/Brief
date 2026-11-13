"use client";

import { useEffect } from "react";

/** How often the signal is sent while Brief is open and in use. */
export const SIGNAL_EVERY_MS = 30_000;
/** A tab nobody has touched for this long is not being used, however long it stays open. */
export const IDLE_AFTER_MS = 120_000;

const TOUCHES = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

/**
 * Sends a small signal about every half minute while Brief is open, in front, and has been touched lately, so the admin page can
 * show how long people stay. It sends nothing about what is on the screen, and nothing from a tab left open in the background.
 */
export function ActivityPing() {
  useEffect(() => {
    let lastTouch = Date.now();
    const touched = () => {
      lastTouch = Date.now();
    };
    const send = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastTouch > IDLE_AFTER_MS) return;
      fetch("/api/backend/me/activity", { method: "POST", keepalive: true }).catch(() => {});
    };

    for (const name of TOUCHES) window.addEventListener(name, touched, { passive: true });
    document.addEventListener("visibilitychange", send);
    send();
    const timer = setInterval(send, SIGNAL_EVERY_MS);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", send);
      for (const name of TOUCHES) window.removeEventListener(name, touched);
    };
  }, []);

  return null;
}
