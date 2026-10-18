import json

from scripts.set_bucket_cors import run


class FakeClient:
    def __init__(self):
        self.calls: list[dict] = []

    def put_bucket_cors(self, **kwargs):
        self.calls.append(kwargs)


def test_it_applies_the_rules_to_the_named_bucket_and_exits_zero():
    client = FakeClient()

    code, text = run(["https://brief.example.com"], bucket="brief-documents", client=client)

    assert code == 0
    assert client.calls == [
        {
            "Bucket": "brief-documents",
            "CORSConfiguration": {
                "CORSRules": [
                    {
                        "AllowedOrigins": ["https://brief.example.com"],
                        "AllowedMethods": ["PUT"],
                        "AllowedHeaders": ["Content-Type"],
                        "MaxAgeSeconds": 3600,
                    }
                ]
            },
        }
    ]
    assert "brief-documents" in text and "https://brief.example.com" in text


def test_a_dry_run_prints_the_rules_and_changes_nothing():
    client = FakeClient()

    code, text = run(["https://brief.example.com"], bucket="brief-documents", client=client, dry_run=True)

    assert code == 0
    assert client.calls == []
    assert json.loads(text[text.index("{"):])["CORSRules"][0]["AllowedMethods"] == ["PUT"]
    assert "dry run" in text.lower()


def test_an_unacceptable_origin_is_refused_with_exit_two_and_nothing_is_changed():
    client = FakeClient()

    code, text = run(["https://*.example.com"], bucket="brief-documents", client=client)

    assert code == 2
    assert client.calls == []
    assert "https://*.example.com" in text


def test_no_origin_at_all_is_refused_with_exit_two():
    client = FakeClient()

    code, _text = run([], bucket="brief-documents", client=client)

    assert code == 2
    assert client.calls == []


def test_a_failure_from_the_storage_service_is_reported_without_its_details_and_exits_one():
    class Broken:
        def put_bucket_cors(self, **_kwargs):
            raise RuntimeError("secret access key abc123 rejected")

    code, text = run(["https://brief.example.com"], bucket="brief-documents", client=Broken())

    assert code == 1
    assert "abc123" not in text
