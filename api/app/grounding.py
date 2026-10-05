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


def numbers_in(text: str) -> set[str]:
    """Every figure in the text, with thousands separators removed so $2,054.00 matches
    $2054.00."""
    return {match.replace(",", "") for match in re.findall(r"\d+(?:[.,]\d+)*", text)}


def numbers_supported(value: str, quotes: list[str]) -> bool:
    """True when every figure in `value` appears in at least one of the quotes.

    A summary written by the model can't be checked as text, but its numbers can: this blocks
    an invented or misread figure, the most damaging mistake, even when the quote is real."""
    supported: set[str] = set()
    for quote in quotes:
        supported |= numbers_in(quote)
    return numbers_in(value) <= supported
