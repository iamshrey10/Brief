import type { MetadataRoute } from "next";

/** Search engines may read the landing page and nothing behind sign in, and no part of the API routes. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/api/"] } };
}
