import type { Metadata } from "next";

export const SITE_NAME = "Brief";
export const TAGLINE = "Every clause, explained.";
export const DESCRIPTION =
  "Upload a loan, lease or job offer. Brief explains it clause by clause and shows you the exact words behind every answer, or says the document does not say.";

/** What a search result, a browser tab or a shared link shows. A page sets only its own title, which gets " | Brief" added. */
export const siteMetadata: Metadata = {
  title: { default: `${SITE_NAME}: ${TAGLINE}`, template: `%s | ${SITE_NAME}` },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME}: ${TAGLINE}`,
    description: DESCRIPTION,
  },
  twitter: { card: "summary", title: `${SITE_NAME}: ${TAGLINE}`, description: DESCRIPTION },
};
