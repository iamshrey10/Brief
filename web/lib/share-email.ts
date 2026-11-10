/** A plain check that something typed looks like one email address: no spaces, one @, and a dot after it. */
export function looksLikeEmail(text: string): boolean {
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(text.trim());
}

export type ShareEmail = {
  subject: string;
  body: string;
  /** Opens a new message in the person's own mail program. */
  mailtoHref: string;
  /** Opens a new message in Gmail in the browser. */
  gmailHref: string;
};

/**
 * A short, friendly email that holds the invitation link and code, so the person who shares does not copy and paste them.
 * Brief sends nothing: these are links that open a message in the sender's own email, which they read and send themselves.
 * `to` is optional; when it is left out the sender types who it is for in their email.
 */
export function buildShareEmail({ ownerName, link, code, to }: { ownerName: string; link: string; code: string; to?: string }): ShareEmail {
  const name = ownerName.trim();
  const subject = name ? `${name} shared a Brief dashboard with you` : "A Brief dashboard shared with you";
  const body =
    "Hi,\n\n" +
    "I would like to share my Brief dashboard with you, so you can look at my documents and what was found in them. " +
    "You can only look. You cannot change anything.\n\n" +
    "To open it:\n" +
    `1. Open this link: ${link}\n` +
    `2. Sign in with Google and type this code: ${code}\n\n` +
    "I will then approve your request. The link and the code work for 7 days.\n\n" +
    `Thanks${name ? `,\n${name}` : ""}`;

  const recipient = to && looksLikeEmail(to) ? to.trim() : "";
  const mailtoHref = `mailto:${encodeURIComponent(recipient).replace("%40", "@")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body).replaceAll("%0A", "%0D%0A")}`;
  const gmailHref = `https://mail.google.com/mail/?${new URLSearchParams({ view: "cm", fs: "1", to: recipient, su: subject, body }).toString()}`;
  return { subject, body, mailtoHref, gmailHref };
}
