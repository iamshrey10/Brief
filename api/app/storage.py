import uuid

import boto3
from botocore.config import Config

from app.config import settings

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/heic",
}
PRESIGNED_URL_EXPIRY_SECONDS = 300

_client = None


def get_client():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            endpoint_url=settings.r2_endpoint_url,
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key,
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )
    return _client


def build_storage_key(user_id: str, filename: str) -> str:
    safe_name = filename.replace("/", "_")
    return f"{user_id}/{uuid.uuid4()}-{safe_name}"


def create_presigned_upload_url(storage_key: str, content_type: str) -> str:
    return get_client().generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.r2_bucket_name,
            "Key": storage_key,
            "ContentType": content_type,
        },
        ExpiresIn=PRESIGNED_URL_EXPIRY_SECONDS,
    )
