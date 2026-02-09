from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from utils.jwt import get_current_user
from services import document_service
from services import rag_service
from db import models as db_models
from openai import OpenAI
from config import settings
import io
import os
import subprocess
import tempfile
import time

router = APIRouter()

DIARIZE_MODEL = "gpt-4o-transcribe-diarize"

_JD_CV_CACHE: Dict[int, Dict[str, Any]] = {}
_JD_CV_CACHE_TTL_SECONDS = 900
_JD_CV_CACHE_MAX_SIZE = 200


class AudioUploadResponse(BaseModel):
    session_id: int
    audio_gcs_path: str


class FinalizeResponse(BaseModel):
    session_id: int
    diarized_transcript: str

class ReportResponse(BaseModel):
    session_id: int
    audio_gcs_path: Optional[str] = None
    diarized_transcript: Optional[str] = None


class TranscriptUpdateRequest(BaseModel):
    final_utterance: Optional[str] = None
    final_transcript: Optional[str] = None


class TranscriptUpdateResponse(BaseModel):
    session_id: int
    live_transcript: Optional[str] = None
    final_transcript: Optional[str] = None


class ActionButtonRequest(BaseModel):
    id: Optional[str] = None
    label: str
    prompt: str


class ActionExecuteRequest(BaseModel):
    action_button: ActionButtonRequest
    client_transcript: str
    metadata: Optional[Dict[str, Any]] = None


class ActionExecuteResponse(BaseModel):
    session_id: int
    output: str


class ChatRequest(BaseModel):
    question: str
    top_k: int = 5


class ChatCitation(BaseModel):
    source_type: str
    chunk_text: str
    distance: float


class ChatResponse(BaseModel):
    session_id: int
    answer: str
    citations: List[ChatCitation]


def _format_diarized_transcript(transcript_text: str, segments: Optional[List]) -> str:
    if segments:
        lines = []
        for seg in segments:
            if hasattr(seg, "model_dump"):
                seg_data = seg.model_dump()
            elif isinstance(seg, dict):
                seg_data = seg
            else:
                seg_data = {}
            speaker = seg_data.get("speaker") or "Speaker"
            text = seg_data.get("text") or seg_data.get("transcript") or ""
            if text.strip():
                lines.append(f"{speaker}: {text.strip()}")
        if lines:
            return "\n".join(lines)
    return transcript_text


def _build_action_prompt(
    jd_text: str,
    cv_text: str,
    transcript: str,
    action_prompt: str,
) -> List[Dict[str, str]]:
    system_text = (
        "You are a recruiter assistant. Use the provided Job Description, Candidate CV, "
        "and interview transcript to answer the action request. Be concise and actionable. "
        "Format the response as 3-6 short bullet points."
    )
    user_text = (
        "Job Description:\n"
        f"{jd_text or '[Not provided]'}\n\n"
        "Candidate CV:\n"
        f"{cv_text or '[Not provided]'}\n\n"
        "Interview Transcript:\n"
        f"{transcript or '[Not provided]'}\n\n"
        "Action Request:\n"
        f"{action_prompt}\n\n"
        "Keep the full response under 1200 characters."
    )
    return [
        {"role": "system", "content": system_text},
        {"role": "user", "content": user_text},
    ]


def _get_cached_documents_text(session_id: int) -> Dict[str, str]:
    now = time.time()
    cached = _JD_CV_CACHE.get(session_id)
    if cached and cached["expires_at"] > now:
        return cached["documents"]

    documents = db_models.get_documents_text(session_id)
    if len(_JD_CV_CACHE) >= _JD_CV_CACHE_MAX_SIZE:
        oldest_key = min(_JD_CV_CACHE.items(), key=lambda item: item[1]["expires_at"])[0]
        _JD_CV_CACHE.pop(oldest_key, None)
    _JD_CV_CACHE[session_id] = {
        "documents": documents,
        "expires_at": now + _JD_CV_CACHE_TTL_SECONDS,
    }
    return documents


def _convert_audio_to_wav(audio_bytes: bytes, source_name: str) -> bytes:
    ext = os.path.splitext(source_name)[1].lower()
    if not ext:
        ext = ".webm"
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as input_file:
        input_file.write(audio_bytes)
        input_path = input_file.name
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as output_file:
        output_path = output_file.name
    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                input_path,
                "-ac",
                "1",
                "-ar",
                "16000",
                output_path,
            ],
            capture_output=True,
            check=False,
        )
        if result.returncode != 0:
            stderr = result.stderr.decode("utf-8", errors="ignore").strip()
            raise HTTPException(
                status_code=500,
                detail=f"Audio conversion failed. ffmpeg error: {stderr or 'unknown error'}",
            )
        with open(output_path, "rb") as converted:
            return converted.read()
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=500,
            detail="ffmpeg is required for diarized transcription. Install ffmpeg in the backend runtime.",
        ) from exc
    finally:
        for path in (input_path, output_path):
            try:
                os.remove(path)
            except OSError:
                pass


@router.post("/sessions/{session_id}/audio", response_model=AudioUploadResponse)
def upload_audio(
    session_id: int,
    file: UploadFile = File(...),
    _user=Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File name is required")
    data = file.file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty audio file")
    gcs_path = document_service.upload_audio_to_gcs(session_id, file.filename, data)
    db_models.save_audio_path(session_id, gcs_path)
    return AudioUploadResponse(session_id=session_id, audio_gcs_path=gcs_path)


@router.post("/sessions/{session_id}/finalize", response_model=FinalizeResponse)
def finalize_interview(session_id: int, _user=Depends(get_current_user)):
    if not settings.openai_api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")

    session = db_models.get_session_with_docs(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    audio_gcs_path = session.get("audio_gcs_path")
    if not audio_gcs_path:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Audio not uploaded yet")

    audio_bytes = document_service.download_from_gcs(audio_gcs_path)
    source_name = os.path.basename(audio_gcs_path)
    wav_bytes = _convert_audio_to_wav(audio_bytes, source_name)
    audio_file = io.BytesIO(wav_bytes)
    audio_file.name = "interview_audio.wav"

    client = OpenAI(api_key=settings.openai_api_key)
    transcription = client.audio.transcriptions.create(
        model=DIARIZE_MODEL,
        file=audio_file,
        response_format="diarized_json",
        chunking_strategy="auto",
    )

    transcript_text = getattr(transcription, "text", "") or ""
    segments = getattr(transcription, "segments", None)
    diarized_transcript = _format_diarized_transcript(transcript_text, segments)
    db_models.save_diarized_transcript(session_id, diarized_transcript)
    try:
        rag_service.index_text(session_id, "TRANSCRIPT", diarized_transcript)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"RAG indexing failed: {exc}")

    return FinalizeResponse(
        session_id=session_id,
        diarized_transcript=diarized_transcript,
    )


@router.put("/sessions/{session_id}/transcript", response_model=TranscriptUpdateResponse)
def update_transcript(
    session_id: int,
    payload: TranscriptUpdateRequest,
    _user=Depends(get_current_user),
):
    if not payload.final_utterance and not payload.final_transcript:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No transcript update provided")

    session = db_models.get_session_transcript_settings(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    if payload.final_utterance:
        db_models.append_live_transcript(session_id, payload.final_utterance)

    if payload.final_transcript is not None:
        db_models.save_final_transcript(session_id, payload.final_transcript)

    updated = db_models.get_session_transcript_settings(session_id)
    return TranscriptUpdateResponse(
        session_id=session_id,
        live_transcript=updated.get("live_transcript") if updated else None,
        final_transcript=updated.get("final_transcript") if updated else None,
    )


@router.get("/sessions/{session_id}/report", response_model=ReportResponse)
def get_report(session_id: int, _user=Depends(get_current_user)):
    report = db_models.get_report(session_id)
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return ReportResponse(
        session_id=session_id,
        audio_gcs_path=report.get("audio_gcs_path"),
        diarized_transcript=report.get("diarized_transcript"),
    )


@router.post("/sessions/{session_id}/action", response_model=ActionExecuteResponse)
def execute_action(
    session_id: int,
    payload: ActionExecuteRequest,
    _user=Depends(get_current_user),
):
    if not settings.openai_api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")
    if not payload.client_transcript.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="client_transcript is required")

    documents = db_models.get_documents_text(session_id)
    jd_text = documents.get("JD", "")
    cv_text = documents.get("CV", "")

    messages = _build_action_prompt(
        jd_text=jd_text,
        cv_text=cv_text,
        transcript=payload.client_transcript,
        action_prompt=payload.action_button.prompt,
    )

    client = OpenAI(api_key=settings.openai_api_key)
    try:
        completion = client.chat.completions.create(
            model=settings.action_model,
            messages=messages,
            temperature=0.2,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Action execution failed: {exc}")

    output = ""
    if completion.choices:
        output = completion.choices[0].message.content or ""
    output = output.strip()
    if len(output) > 1200:
        output = output[:1197].rstrip() + "..."

    return ActionExecuteResponse(session_id=session_id, output=output)


@router.post("/sessions/{session_id}/chat", response_model=ChatResponse)
def chat_with_session(
    session_id: int,
    payload: ChatRequest,
    _user=Depends(get_current_user),
):
    question = (payload.question or "").strip()
    if not question:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="question is required")

    top_k = min(max(1, payload.top_k), 8)
    citations = rag_service.retrieve_top_k(session_id, question, top_k=top_k)
    if not settings.openai_api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")

    context_blocks = []
    for idx, c in enumerate(citations, start=1):
        context_blocks.append(
            f"[{idx}] ({c['source_type']}) {c['chunk_text']}"
        )
    context_text = "\n\n".join(context_blocks) if context_blocks else "[No context found]"

    max_citation = len(citations)
    messages = [
        {
            "role": "system",
            "content": (
                "Answer the user's question using only the provided context. "
                f"Cite sources by bracket number like [1], [2]. Use only [1]..[{max_citation}] "
                "and do not invent citations. Be concise."
            ),
        },
        {
            "role": "user",
            "content": f"Context:\n{context_text}\n\nQuestion:\n{question}",
        },
    ]

    client = OpenAI(api_key=settings.openai_api_key)
    try:
        completion = client.chat.completions.create(
            model=settings.action_model,
            messages=messages,
            temperature=0.2,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Chat failed: {exc}")

    answer = ""
    if completion.choices:
        answer = completion.choices[0].message.content or ""
    answer = answer.strip()
    if max_citation > 0:
        # Remove any citations outside the allowed range.
        import re
        def _sanitize(match: re.Match) -> str:
            num = int(match.group(1))
            return f"[{num}]" if 1 <= num <= max_citation else ""
        answer = re.sub(r"\[(\d+)\]", _sanitize, answer)

    formatted_citations = [
        ChatCitation(
            source_type=c["source_type"],
            chunk_text=c["chunk_text"],
            distance=float(c["distance"]),
        )
        for c in citations
    ]
    return ChatResponse(session_id=session_id, answer=answer, citations=formatted_citations)
