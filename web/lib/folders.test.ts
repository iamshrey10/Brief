import { describe, expect, it } from "vitest";

import { defaultFolderFor, FOLDERS, folderLabel, folderOf, isFiledElsewhere } from "./folders";

describe("folders", () => {
  it("has the five folders the API accepts, in order", () => {
    expect(FOLDERS.map((folder) => folder.value)).toEqual(["Lease", "Education_Loan", "Job_Offers", "Personal_Documents", "Other"]);
  });

  it.each([
    ["lease", "Lease"],
    ["loan", "Education_Loan"],
    ["offer", "Job_Offers"],
    ["other", "Other"],
    ["mystery", "Other"],
  ])("a %s goes in %s by itself", (kind, folder) => expect(defaultFolderFor(kind)).toBe(folder));

  it("says the folder in words, and shows an unknown one as it came", () => {
    expect(folderLabel("Education_Loan")).toBe("Education loan");
    expect(folderLabel("Personal_Documents")).toBe("Personal documents");
    expect(folderLabel("Archive")).toBe("Archive");
  });

  it("uses the folder named, else the one for the kind", () => {
    expect(folderOf({ doc_type: "lease", folder: "Personal_Documents" })).toBe("Personal_Documents");
    expect(folderOf({ doc_type: "lease" })).toBe("Lease");
    expect(folderOf({ doc_type: "loan", folder: null })).toBe("Education_Loan");
  });

  it("says a document is filed elsewhere only when it is not in the folder for its kind", () => {
    expect(isFiledElsewhere({ doc_type: "lease", folder: "Lease" })).toBe(false);
    expect(isFiledElsewhere({ doc_type: "lease" })).toBe(false);
    expect(isFiledElsewhere({ doc_type: "lease", folder: "Personal_Documents" })).toBe(true);
    expect(isFiledElsewhere({ doc_type: "other", folder: "Job_Offers" })).toBe(true);
  });
});
