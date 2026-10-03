import re

import pytest

from app.key_term_fields import FIELDS_BY_DOC_TYPE, fields_for
from app.main import DOC_TYPES


def test_every_upload_type_has_fields():
    # A document type the upload form allows must never come back with nothing to extract.
    for doc_type in DOC_TYPES:
        assert fields_for(doc_type), doc_type


@pytest.mark.parametrize("doc_type", sorted(FIELDS_BY_DOC_TYPE))
def test_field_names_are_unique_stable_keys(doc_type):
    names = [field.name for field in FIELDS_BY_DOC_TYPE[doc_type]]
    assert len(names) == len(set(names))
    # These end up as database keys and JSON keys, so keep them boring.
    assert all(re.fullmatch(r"[a-z][a-z0-9_]*", name) for name in names)


@pytest.mark.parametrize("doc_type", sorted(FIELDS_BY_DOC_TYPE))
def test_every_field_has_a_label_and_a_description(doc_type):
    for field in FIELDS_BY_DOC_TYPE[doc_type]:
        assert field.label.strip(), field.name
        assert len(field.description.strip()) > 10, field.name


def test_an_unknown_document_type_falls_back_to_the_generic_list():
    assert fields_for("something-new") == FIELDS_BY_DOC_TYPE["other"]


def test_the_lists_stay_short_enough_for_one_model_call():
    assert all(len(fields) <= 15 for fields in FIELDS_BY_DOC_TYPE.values())


def test_no_em_dashes_in_text_the_reader_sees():
    for fields in FIELDS_BY_DOC_TYPE.values():
        for field in fields:
            assert "—" not in field.label + field.description
