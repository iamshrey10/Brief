"""The folders a person's files are kept in, inside their own part of storage.

A folder is only ever one of these five names. Nothing a person types becomes part of a storage path except the
cleaned file name, so no one can reach into another person's files by choosing a folder."""

FOLDERS = ("Lease", "Education_Loan", "Job_Offers", "Personal_Documents", "Other")

# Where a document of each kind goes when no folder is chosen. Personal_Documents is never picked automatically: it is
# for what a person decides belongs there, so a document of kind "other" lands in Other until they say otherwise.
FOLDER_FOR_KIND = {"lease": "Lease", "loan": "Education_Loan", "offer": "Job_Offers", "other": "Other"}


def folder_for(kind: str, chosen: str | None = None) -> str:
    """The folder a document goes in: the one chosen, if it is one of the five, else the one for its kind."""
    if chosen in FOLDERS:
        return chosen
    return FOLDER_FOR_KIND.get(kind, "Other")
