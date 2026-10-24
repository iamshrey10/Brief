/**
 * Headers sent with every response. They do not replace checking who is allowed to see what, they
 * close easy ways around it: the site being framed by another page, a file being misread as another
 * kind, a private address leaking in a referrer, or a first visit going over plain HTTP.
 */
export const securityHeaders: { key: string; value: string }[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // The full policy, report only: the browser says in its console what it would block and blocks nothing, so it can
  // be tightened against the real site once deployed, and then moved to the line above. Next.js needs inline scripts
  // and styles for now, which is the part to tighten with a nonce.
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self' https://*.r2.cloudflarestorage.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://accounts.google.com",
      "frame-ancestors 'none'",
    ].join("; "),
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

export function securityHeaderRules() {
  return [{ source: "/:path*", headers: securityHeaders }];
}
