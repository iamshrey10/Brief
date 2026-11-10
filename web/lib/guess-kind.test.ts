import { describe, expect, it } from "vitest";

import { guessDocKind } from "./guess-kind";

describe("guessing the kind of a document from its file name", () => {
  it.each([
    ["1-education-loan-agreement.pdf", "loan"],
    ["Student_Loan_Promissory_Note.PDF", "loan"],
    ["tuition-financing.pdf", "loan"],
    ["Maple Street Lease.pdf", "lease"],
    ["apartment-RENTAL-agreement.docx.pdf", "lease"],
    ["TenancyAgreement2026.pdf", "lease"],
    ["sublease_final.pdf", "lease"],
    ["2-job-offer-letter.pdf", "offer"],
    ["OfferLetter_Priya.pdf", "offer"],
    ["employment contract.pdf", "offer"],
    ["salary-details.png", "offer"],
  ])("%s is a %s", (name, kind) => expect(guessDocKind(name)).toBe(kind));

  it.each([
    "3-gym-membership-agreement.pdf",
    "IMG_2041.jpg",
    "scan0001.png",
    "document.pdf",
    "current-account.pdf",
    "Untitled",
    "",
    "4-photo-lease-page-and-job-offer.jpg",
    "lease-or-loan.pdf",
  ])("%s says nothing, or points two ways, so there is no guess", (name) => expect(guessDocKind(name)).toBeNull());

  it("does not take part of a longer word for a kind", () => {
    expect(guessDocKind("transparent-offered-items.pdf")).toBeNull();
    expect(guessDocKind("parental-leave.pdf")).toBeNull();
  });

  it("does not read the file extension as part of the name", () => {
    expect(guessDocKind("scan.lease")).toBe(null);
    expect(guessDocKind("lease.pdf")).toBe("lease");
  });
});
