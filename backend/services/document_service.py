from typing import Tuple
from google.cloud import storage
from google.auth.exceptions import DefaultCredentialsError
from pypdf import PdfReader
from docx import Document
from config import settings
import io
import os
import uuid


def _get_storage_client() -> storage.Client:
    if settings.gcp_project:
        return storage.Client(project=settings.gcp_project)
    return storage.Client()


def validate_gcs_access() -> None:
    """
    Fail fast if ADC is not configured or bucket access is missing.
    """
    if not settings.gcs_bucket:
        raise RuntimeError("GCS_BUCKET is not configured.")
    try:
        client = _get_storage_client()
        # This will trigger ADC resolution and verify bucket access
        client.get_bucket(settings.gcs_bucket)
    except DefaultCredentialsError as exc:
        raise RuntimeError(
            "GCS ADC is not configured. Run: gcloud auth application-default login "
            "or set GOOGLE_APPLICATION_CREDENTIALS."
        ) from exc


def _extract_text_from_pdf(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    texts = []
    for page in reader.pages:
        texts.append(page.extract_text() or "")
    return "\n".join(texts).strip()


def _extract_text_from_docx(data: bytes) -> str:
    doc = Document(io.BytesIO(data))
    return "\n".join([p.text for p in doc.paragraphs]).strip()


def extract_text(file_name: str, data: bytes) -> str:
    lower = file_name.lower()
    if lower.endswith(".pdf"):
        return _extract_text_from_pdf(data)
    if lower.endswith(".docx"):
        return _extract_text_from_docx(data)
    # Fallback: treat as plain text
    try:
        return data.decode("utf-8", errors="ignore").strip()
    except Exception:
        return ""


def upload_to_gcs(session_id: int, file_name: str, data: bytes) -> str:
    if not settings.gcs_bucket:
        raise RuntimeError("GCS_BUCKET is not configured.")

    client = _get_storage_client()
    bucket = client.bucket(settings.gcs_bucket)

    safe_name = os.path.basename(file_name)
    key = f"sessions/{session_id}/{uuid.uuid4().hex}_{safe_name}"
    blob = bucket.blob(key)
    blob.upload_from_string(data)
    return f"gs://{settings.gcs_bucket}/{key}"


def upload_audio_to_gcs(session_id: int, file_name: str, data: bytes) -> str:
    if not settings.gcs_bucket:
        raise RuntimeError("GCS_BUCKET is not configured.")
    client = _get_storage_client()
    bucket = client.bucket(settings.gcs_bucket)
    safe_name = os.path.basename(file_name)
    key = f"sessions/{session_id}/audio/{uuid.uuid4().hex}_{safe_name}"
    blob = bucket.blob(key)
    blob.upload_from_string(data)
    return f"gs://{settings.gcs_bucket}/{key}"


def download_from_gcs(gcs_path: str) -> bytes:
    if not gcs_path.startswith("gs://"):
        raise RuntimeError("Invalid GCS path")
    _, path = gcs_path.split("gs://", 1)
    bucket_name, key = path.split("/", 1)
    client = _get_storage_client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(key)
    return blob.download_as_bytes()


def process_and_store(session_id: int, file_name: str, data: bytes) -> Tuple[str, str]:
    gcs_path = upload_to_gcs(session_id, file_name, data)
    text_content = extract_text(file_name, data)
    return gcs_path, text_content
