from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, Tuple
from config import settings
from utils.jwt import get_current_user
from openai import OpenAI
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

_TOKEN_CACHE: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
_TOKEN_BUFFER_SECONDS = 10


class RealtimeSessionRequest(BaseModel):
    sessionId: str
    language: str = "en"
    model: Optional[str] = None


class RealtimeSessionResponse(BaseModel):
    session_id: str
    client_token: str
    expires_in: int
    webrtc_sdp_url: Optional[str] = None


def _get_cached_token(session_id: str, language: str, model: str) -> Optional[RealtimeSessionResponse]:
    key = (session_id, language, model)
    cached = _TOKEN_CACHE.get(key)
    if not cached:
        return None
    now = datetime.now(timezone.utc)
    expires_at = cached["expires_at"]
    if expires_at - timedelta(seconds=_TOKEN_BUFFER_SECONDS) > now:
        remaining = int((expires_at - now).total_seconds())
        return RealtimeSessionResponse(
            session_id=cached["openai_session_id"],
            client_token=cached["client_token"],
            expires_in=max(1, remaining),
            webrtc_sdp_url=cached.get("webrtc_sdp_url"),
        )
    _TOKEN_CACHE.pop(key, None)
    return None


def _store_cached_token(
    internal_session_id: str,
    language: str,
    model: str,
    *,
    openai_session_id: str,
    client_token: str,
    expires_at: datetime,
    webrtc_sdp_url: Optional[str] = None,
) -> None:
    key = (internal_session_id, language, model)
    _TOKEN_CACHE[key] = {
        "openai_session_id": openai_session_id,
        "client_token": client_token,
        "expires_at": expires_at,
        "webrtc_sdp_url": webrtc_sdp_url,
    }


def _create_realtime_session(client: OpenAI, model: str, language: str) -> Tuple[str, str, datetime, str]:
    """
    Try GA client_secrets flow first; fallback to legacy realtime session.
    Returns: (openai_session_id, client_token, expires_at, webrtc_sdp_url)
    """
    transcription_prompt = "Transcribe in English only."

    # GA client_secrets (preferred)
    try:
        client_secret = client.realtime.client_secrets.create(
            expires_after={"anchor": "created_at", "seconds": 60},
            session={
                "type": "transcription",
                "audio": {
                    "input": {
                        "transcription": {
                            "model": model,
                            "language": language,
                            "prompt": transcription_prompt,
                        }
                    }
                },
            },
        )
        expires_dt = datetime.fromtimestamp(int(client_secret.expires_at), tz=timezone.utc)
        return (
            client_secret.session.id,
            client_secret.value,
            expires_dt,
            "https://api.openai.com/v1/realtime/calls",
        )
    except Exception as exc:
        logger.warning("GA client_secrets failed; falling back to sessions.create: %s", exc)

    # Legacy realtime session
    session = client.realtime.sessions.create(
        model="gpt-4o-realtime-preview-2025-06-03",
        modalities=["audio"],
        instructions="Transcribe only in English. Do not respond.",
        input_audio_transcription={
            "model": model,
            "language": language,
            "prompt": transcription_prompt,
        },
    )
    expires_at = session.client_secret.expires_at
    if isinstance(expires_at, (int, float)):
        expires_dt = datetime.fromtimestamp(expires_at, tz=timezone.utc)
    elif isinstance(expires_at, str):
        expires_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    elif isinstance(expires_at, datetime):
        expires_dt = expires_at if expires_at.tzinfo else expires_at.replace(tzinfo=timezone.utc)
    else:
        expires_dt = datetime.now(timezone.utc) + timedelta(seconds=55)

    return (
        session.id,
        session.client_secret.value,
        expires_dt,
        "https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2025-06-03",
    )


@router.post("/session", response_model=RealtimeSessionResponse)
def create_realtime_session(request: RealtimeSessionRequest, _user=Depends(get_current_user)):
    if not settings.openai_api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")

    language = (request.language or "en").strip().lower()
    model = request.model or settings.realtime_model

    cached = _get_cached_token(request.sessionId, language, model)
    if cached:
        return cached

    client = OpenAI(api_key=settings.openai_api_key)
    try:
        session_id, token, expires_dt, webrtc_sdp_url = _create_realtime_session(client, model, language)
        expires_in = max(1, int((expires_dt - datetime.now(timezone.utc)).total_seconds()))
        _store_cached_token(
            request.sessionId,
            language,
            model,
            openai_session_id=session_id,
            client_token=token,
            expires_at=expires_dt,
            webrtc_sdp_url=webrtc_sdp_url,
        )
        return RealtimeSessionResponse(
            session_id=session_id,
            client_token=token,
            expires_in=expires_in,
            webrtc_sdp_url=webrtc_sdp_url,
        )
    except Exception as exc:
        logger.error("Failed to create realtime session: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to create realtime session: {exc}")
