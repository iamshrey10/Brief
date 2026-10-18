import pytest

from app.bucket_cors import build_cors_configuration


def test_it_allows_only_a_put_with_a_content_type_from_the_given_site():
    configuration = build_cors_configuration(["https://brief.example.com"])

    assert configuration == {
        "CORSRules": [
            {
                "AllowedOrigins": ["https://brief.example.com"],
                "AllowedMethods": ["PUT"],
                "AllowedHeaders": ["Content-Type"],
                "MaxAgeSeconds": 3600,
            }
        ]
    }


def test_it_allows_more_than_one_site_in_a_single_rule():
    rule = build_cors_configuration(["https://brief.example.com", "http://localhost:3000"])["CORSRules"][0]

    assert rule["AllowedOrigins"] == ["https://brief.example.com", "http://localhost:3000"]


def test_it_drops_a_repeated_site_and_keeps_the_order():
    rule = build_cors_configuration(
        ["https://a.example.com", "https://b.example.com", "https://a.example.com"]
    )["CORSRules"][0]

    assert rule["AllowedOrigins"] == ["https://a.example.com", "https://b.example.com"]


@pytest.mark.parametrize(
    "bad",
    [
        "*",
        "https://*.example.com",
        "brief.example.com",
        "https://brief.example.com/",
        "https://brief.example.com/upload",
        "http://brief.example.com",
        "ftp://brief.example.com",
        "https://",
        "",
        " https://brief.example.com",
        "https://brief.example.com?x=1",
    ],
)
def test_it_refuses_an_origin_that_is_a_wildcard_has_a_path_or_is_not_https(bad):
    with pytest.raises(ValueError):
        build_cors_configuration([bad])


@pytest.mark.parametrize("local", ["http://localhost:3000", "http://localhost:3100", "http://127.0.0.1:3000"])
def test_plain_http_is_allowed_only_for_the_local_machine(local):
    assert build_cors_configuration([local])["CORSRules"][0]["AllowedOrigins"] == [local]


def test_it_refuses_to_build_a_rule_with_no_site():
    with pytest.raises(ValueError):
        build_cors_configuration([])
