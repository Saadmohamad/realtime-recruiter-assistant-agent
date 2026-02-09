import logging
import re
from typing import List, Dict, Any
from openai import OpenAI
from config import settings
from db import models as db_models

logger = logging.getLogger(__name__)

CHUNK_SIZE = 200
CHUNK_OVERLAP = 50
SENTENCE_SPLIT_PATTERN = re.compile(r"(?<=[.!?])\s+")


def _split_sentences(text: str) -> List[str]:
    cleaned = (text or "").strip()
    if not cleaned:
        return []
    sentences = [s.strip() for s in SENTENCE_SPLIT_PATTERN.split(cleaned) if s.strip()]
    return sentences or [cleaned]


def _chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    sentences = _split_sentences(text)
    if not sentences:
        return []
    chunks = []
    current = []
    current_len = 0
    for sentence in sentences:
        if current_len + len(sentence) + 1 > chunk_size and current:
            chunk = " ".join(current).strip()
            if chunk:
                chunks.append(chunk)
            # build overlap by retaining trailing sentences up to overlap chars
            if overlap > 0:
                overlap_sentences = []
                overlap_len = 0
                for s in reversed(current):
                    if overlap_len + len(s) + 1 > overlap and overlap_sentences:
                        break
                    overlap_sentences.insert(0, s)
                    overlap_len += len(s) + 1
                current = overlap_sentences
                current_len = sum(len(s) + 1 for s in current)
            else:
                current = []
                current_len = 0
        current.append(sentence)
        current_len += len(sentence) + 1
    if current:
        chunk = " ".join(current).strip()
        if chunk:
            chunks.append(chunk)
    return chunks


def _embed_texts(texts: List[str]) -> List[List[float]]:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    client = OpenAI(api_key=settings.openai_api_key)
    response = client.embeddings.create(
        model=settings.embedding_model,
        input=texts,
    )
    return [item.embedding for item in response.data]


def index_text(session_id: int, source_type: str, text: str) -> None:
    chunks = _chunk_text(text)
    if not chunks:
        return
    embeddings = _embed_texts(chunks)
    metadata_list = [{"chunk_index": idx} for idx in range(len(chunks))]
    db_models.insert_rag_chunks(session_id, source_type, chunks, embeddings, metadata_list)


def retrieve_top_k(session_id: int, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    embeddings = _embed_texts([query])
    return db_models.get_top_k_chunks(session_id, embeddings[0], top_k=top_k)
