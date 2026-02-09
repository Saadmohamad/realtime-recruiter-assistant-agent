from datetime import datetime
from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional, List
from utils.jwt import get_current_user
from db import models as db_models
from services import document_service
from services import rag_service

router = APIRouter()


class SessionCreateRequest(BaseModel):
    title: str


class DocumentResponse(BaseModel):
    id: int
    session_id: int
    doc_type: str
    file_name: str
    gcs_path: str


class SessionResponse(BaseModel):
    id: int
    user_id: int
    title: str
    live_transcript: Optional[str] = None
    final_transcript: Optional[str] = None
    diarized_transcript: Optional[str] = None
    documents: Optional[List[DocumentResponse]] = None


class SessionListItem(BaseModel):
    id: int
    user_id: int
    title: str
    created_at: Optional[datetime] = None


@router.get("", response_model=List[SessionListItem])
def list_sessions(saved_only: bool = True, current_user=Depends(get_current_user)):
    user_id = int(current_user.get("sub"))
    return db_models.list_sessions_for_user(user_id, saved_only=saved_only)


@router.post("", response_model=SessionResponse)
def create_session(payload: SessionCreateRequest, current_user=Depends(get_current_user)):
    user_id = int(current_user.get("sub"))
    if not payload.title.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title is required")
    session = db_models.create_session(user_id=user_id, title=payload.title.strip())
    return {**session, "documents": []}


@router.post("/{session_id}/documents", response_model=DocumentResponse)
def upload_document(
    session_id: int,
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    if doc_type not in {"JD", "CV"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="doc_type must be JD or CV")
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File name is required")

    _ = current_user  # Ensure auth
    data = file.file.read()
    gcs_path, text_content = document_service.process_and_store(session_id, file.filename, data)
    doc = db_models.add_document(
        session_id=session_id,
        doc_type=doc_type,
        file_name=file.filename,
        gcs_path=gcs_path,
        text_content=text_content,
    )
    try:
        rag_service.index_text(session_id, doc_type, text_content or "")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"RAG indexing failed: {exc}")
    return doc


@router.get("/{session_id}", response_model=SessionResponse)
def get_session(session_id: int, current_user=Depends(get_current_user)):
    _ = current_user
    session = db_models.get_session_with_docs(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session
