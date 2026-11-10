import { describe, expect, it } from "vitest";

import { buildShareEmail, looksLikeEmail } from "./share-email";

const LINK = "https://brief.example/shared/join/abc_DEF-123";

describe("looksLikeEmail", () => {
  it.each(["mum@example.com", " mum@example.com ", "a.b+c@mail.co.uk"])("accepts %s", (text) => expect(looksLikeEmail(text)).toBe(true));
  it.each(["", "mum", "mum@", "mum@example", "mum @example.com", "a@b.com, c@d.com", "a@b.com;c@d.com"])("refuses %j", (text) => expect(looksLikeEmail(text)).toBe(false));
});

describe("the share email", () => {
  it("holds the link and the code in a short message that says it is view only", () => {
    const email = buildShareEmail({ ownerName: "Alex Morgan", link: LINK, code: "482913", to: "mum@example.com" });

    expect(email.subject).toBe("Alex Morgan shared a Brief dashboard with you");
    expect(email.body).toContain(`Open this link: ${LINK}`);
    expect(email.body).toContain("type this code: 482913");
    expect(email.body).toContain("You can only look. You cannot change anything.");
    expect(email.body).toContain("I will then approve your request");
    expect(email.body).toContain("work for 7 days");
    expect(email.body.endsWith("Thanks,\nAlex Morgan")).toBe(true);
  });

  it("opens a message in the person's mail program with the address, subject and body filled in, with proper line breaks", () => {
    const { mailtoHref } = buildShareEmail({ ownerName: "Alex", link: LINK, code: "482913", to: "mum@example.com" });

    expect(mailtoHref.startsWith("mailto:mum@example.com?subject=")).toBe(true);
    expect(mailtoHref).toContain(encodeURIComponent(LINK));
    expect(mailtoHref).toContain("482913");
    expect(mailtoHref).toContain("%0D%0A");
    expect(mailtoHref).not.toMatch(/%0A(?<!%0D%0A)/);
  });

  it("opens a message in Gmail with the same words", () => {
    const { gmailHref } = buildShareEmail({ ownerName: "Alex", link: LINK, code: "482913", to: "mum@example.com" });
    const url = new URL(gmailHref);

    expect(url.origin + url.pathname).toBe("https://mail.google.com/mail/");
    expect(url.searchParams.get("view")).toBe("cm");
    expect(url.searchParams.get("to")).toBe("mum@example.com");
    expect(url.searchParams.get("su")).toBe("Alex shared a Brief dashboard with you");
    expect(url.searchParams.get("body")).toContain(LINK);
    expect(url.searchParams.get("body")).toContain("482913");
  });

  it("leaves the address empty when none was given or it does not look like one, and works without a name", () => {
    for (const to of [undefined, "", "not an email"]) {
      const email = buildShareEmail({ ownerName: "  ", link: LINK, code: "111111", to });
      expect(email.mailtoHref.startsWith("mailto:?subject=")).toBe(true);
      expect(new URL(email.gmailHref).searchParams.get("to")).toBe("");
      expect(email.subject).toBe("A Brief dashboard shared with you");
      expect(email.body.endsWith("Thanks")).toBe(true);
    }
  });
});
