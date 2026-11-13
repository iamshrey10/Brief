"use client";

import { useSyncExternalStore } from "react";

const NAME = "revankarshreyas10";
const HOST = "gmail.com";

const noSubscription = () => () => {};

/**
 * The contact address as a tap-to-email link. The address is put together in the browser, so it is not sitting in
 * the page's text for the bots that collect addresses from web pages. Someone using the site sees an ordinary link.
 */
export function ContactEmail({ className }: { className?: string }) {
  // False while the server builds the page, true once it is running in the browser.
  const inBrowser = useSyncExternalStore(noSubscription, () => true, () => false);

  if (!inBrowser) return <span className={className}>Email</span>;
  const address = `${NAME}@${HOST}`;
  return (
    <a href={`mailto:${address}`} className={className}>
      {address}
    </a>
  );
}
