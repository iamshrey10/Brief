/**
 * Headers sent with every response. They do not replace checking who is allowed to see what, they
 * close easy ways around it: the site being framed by another page, a file being misread as another
 * kind, a private address leaking in a referrer, or a first visit going over plain HTTP.
 */
export const securityHeaders: { key: string; value: string }[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

export function securityHeaderRules() {
  return [{ source: "/:path*", headers: securityHeaders }];
}
