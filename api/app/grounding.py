import re


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def quote_appears_in(quote: str, clause_text: str) -> bool:
    """A quote counts only if it really is in the clause, ignoring case and spacing, so
    the model can't attach an invented or reworded 'quote' to a real clause.

    Shared by question answering and key-term extraction: anything the model claims to
    have read from the document has to pass this before a reader ever sees it."""
    normalized_quote = normalize(quote).strip("\"'")
    return bool(normalized_quote) and normalized_quote in normalize(clause_text)
