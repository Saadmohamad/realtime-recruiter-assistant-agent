import psycopg2
import psycopg2.extras
import psycopg2.pool
import logging
import atexit
from contextlib import contextmanager
from typing import Optional, Dict, Any
from config import settings

logger = logging.getLogger(__name__)

_connection_pool: Optional[psycopg2.pool.ThreadedConnectionPool] = None


class _PooledConnection:
    def __init__(self, conn: psycopg2.extensions.connection, pool: Optional[psycopg2.pool.ThreadedConnectionPool]):
        self._conn = conn
        self._pool = pool
        self._returned = False

    def _return_to_pool(self) -> None:
        if self._returned:
            return
        self._returned = True
        if self._pool is not None:
            try:
                if not getattr(self._conn, "closed", False):
                    try:
                        self._conn.rollback()
                    except Exception:
                        pass
                self._pool.putconn(self._conn)
                return
            except Exception as e:
                logger.warning("Failed to return connection to pool: %s", e)
        try:
            self._conn.close()
        except Exception:
            pass

    def close(self) -> None:
        self._return_to_pool()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self._return_to_pool()
        return False

    def __getattr__(self, name: str):
        return getattr(self._conn, name)


def _get_dsn() -> str:
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL environment variable must be set.")
    return settings.database_url.replace("+psycopg2", "")


def _init_connection_pool() -> psycopg2.pool.ThreadedConnectionPool:
    global _connection_pool
    if _connection_pool is None:
        dsn = _get_dsn()
        _connection_pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=1,
            maxconn=10,
            dsn=dsn,
        )
        logger.info("Database connection pool initialized")
    return _connection_pool


def _close_connection_pool():
    global _connection_pool
    if _connection_pool is not None:
        _connection_pool.closeall()
        _connection_pool = None
        logger.info("Database connection pool closed")


atexit.register(_close_connection_pool)


def get_connection():
    pool = _init_connection_pool()
    try:
        return _PooledConnection(pool.getconn(), pool)
    except psycopg2.pool.PoolError as e:
        logger.warning("Connection pool exhausted, creating direct connection: %s", e)
        dsn = _get_dsn()
        return _PooledConnection(psycopg2.connect(dsn), None)


@contextmanager
def get_db_connection():
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()


def setup_database() -> None:
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                organization_name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS interview_sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
        # Add Phase 4 columns if missing (safe for existing DBs)
        cur.execute(
            """
            ALTER TABLE interview_sessions
                ADD COLUMN IF NOT EXISTS audio_gcs_path TEXT,
                ADD COLUMN IF NOT EXISTS diarized_transcript TEXT,
                ADD COLUMN IF NOT EXISTS live_transcript TEXT,
                ADD COLUMN IF NOT EXISTS final_transcript TEXT,
                ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id SERIAL PRIMARY KEY,
                session_id INTEGER NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
                doc_type TEXT NOT NULL,
                file_name TEXT NOT NULL,
                gcs_path TEXT NOT NULL,
                text_content TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS rag_chunks (
                id SERIAL PRIMARY KEY,
                session_id INTEGER NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
                source_type TEXT NOT NULL,
                chunk_text TEXT NOT NULL,
                embedding vector(1536) NOT NULL,
                metadata JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
        conn.commit()


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT id, email, password_hash, organization_name, created_at FROM users WHERE email = %s",
            (email.lower(),),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT id, email, organization_name, created_at FROM users WHERE id = %s",
            (user_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def create_user(email: str, password_hash: str, organization_name: str) -> Dict[str, Any]:
    with get_db_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            INSERT INTO users (email, password_hash, organization_name)
            VALUES (%s, %s, %s)
            RETURNING id, email, organization_name, created_at;
            """,
            (email.lower(), password_hash, organization_name),
        )
        row = cur.fetchone()
        conn.commit()
        return dict(row)


def create_session(user_id: int, title: str) -> Dict[str, Any]:
    with get_db_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            INSERT INTO interview_sessions (user_id, title)
            VALUES (%s, %s)
            RETURNING id, user_id, title, created_at;
            """,
            (user_id, title),
        )
        row = cur.fetchone()
        conn.commit()
        return dict(row)


def list_sessions_for_user(user_id: int, saved_only: bool = False) -> list:
    with get_db_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        query = """
            SELECT id, user_id, title, created_at
            FROM interview_sessions
            WHERE user_id = %s
        """
        if saved_only:
            query += " AND diarized_transcript IS NOT NULL AND diarized_transcript != ''"
        query += " ORDER BY created_at DESC;"
        cur.execute(query, (user_id,))
        return [dict(row) for row in cur.fetchall()]


def add_document(
    session_id: int,
    doc_type: str,
    file_name: str,
    gcs_path: str,
    text_content: str,
) -> Dict[str, Any]:
    with get_db_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            INSERT INTO documents (session_id, doc_type, file_name, gcs_path, text_content)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, session_id, doc_type, file_name, gcs_path, created_at;
            """,
            (session_id, doc_type, file_name, gcs_path, text_content),
        )
        row = cur.fetchone()
        conn.commit()
        return dict(row)


def get_session_with_docs(session_id: int) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT
                id,
                user_id,
                title,
                created_at,
                audio_gcs_path,
                diarized_transcript,
                live_transcript,
                final_transcript,
                updated_at
            FROM interview_sessions
            WHERE id = %s;
            """,
            (session_id,),
        )
        session = cur.fetchone()
        if not session:
            return None
        cur.execute(
            """
            SELECT id, session_id, doc_type, file_name, gcs_path, created_at
            FROM documents
            WHERE session_id = %s
            ORDER BY created_at ASC;
            """,
            (session_id,),
        )
        docs = cur.fetchall() or []
        session_dict = dict(session)
        session_dict["documents"] = [dict(d) for d in docs]
        return session_dict


def save_audio_path(session_id: int, gcs_path: str) -> None:
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE interview_sessions
            SET audio_gcs_path = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s;
            """,
            (gcs_path, session_id),
        )
        conn.commit()


def save_diarized_transcript(session_id: int, transcript: str) -> None:
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE interview_sessions
            SET diarized_transcript = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s;
            """,
            (transcript, session_id),
        )
        conn.commit()


def append_live_transcript(session_id: int, utterance: str) -> None:
    if not utterance.strip():
        return
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE interview_sessions
            SET live_transcript = CASE
                WHEN live_transcript IS NULL OR live_transcript = '' THEN %s
                ELSE live_transcript || %s || %s
            END,
            updated_at = CURRENT_TIMESTAMP
            WHERE id = %s;
            """,
            (utterance.strip(), "\n", utterance.strip(), session_id),
        )
        conn.commit()


def save_final_transcript(session_id: int, transcript: str) -> None:
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE interview_sessions
            SET final_transcript = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s;
            """,
            (transcript, session_id),
        )
        conn.commit()


def get_session_transcript_settings(session_id: int) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT
                id,
                live_transcript,
                final_transcript
            FROM interview_sessions
            WHERE id = %s;
            """,
            (session_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None

def get_report(session_id: int) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT id, audio_gcs_path, diarized_transcript, updated_at
            FROM interview_sessions
            WHERE id = %s;
            """,
            (session_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def get_documents_text(session_id: int) -> Dict[str, str]:
    """
    Return a dict of doc_type -> text_content for a session.
    """
    with get_db_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT doc_type, text_content
            FROM documents
            WHERE session_id = %s;
            """,
            (session_id,),
        )
        rows = cur.fetchall() or []
        result: Dict[str, str] = {}
        for row in rows:
            result[row["doc_type"]] = row.get("text_content") or ""
        return result


def insert_rag_chunks(
    session_id: int,
    source_type: str,
    chunks: list[str],
    embeddings: list[list[float]],
    metadata_list: Optional[list[Dict[str, Any]]] = None,
) -> None:
    if not chunks:
        return
    if len(chunks) != len(embeddings):
        raise ValueError("chunks and embeddings length mismatch")
    metadata_list = metadata_list or [None] * len(chunks)
    with get_db_connection() as conn:
        cur = conn.cursor()
        values = []
        for chunk_text, embedding, metadata in zip(chunks, embeddings, metadata_list):
            vector_literal = "[" + ",".join(f"{x:.6f}" for x in embedding) + "]"
            json_metadata = psycopg2.extras.Json(metadata) if metadata is not None else None
            values.append((session_id, source_type, chunk_text, vector_literal, json_metadata))
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO rag_chunks (session_id, source_type, chunk_text, embedding, metadata)
            VALUES %s;
            """,
            values,
            template="(%s, %s, %s, %s::vector, %s)",
        )
        conn.commit()


def get_top_k_chunks(
    session_id: int,
    query_embedding: list[float],
    top_k: int = 5,
) -> list[Dict[str, Any]]:
    vector_literal = "[" + ",".join(f"{x:.6f}" for x in query_embedding) + "]"
    with get_db_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT id, source_type, chunk_text, metadata,
                   embedding <=> %s::vector AS distance
            FROM rag_chunks
            WHERE session_id = %s
            ORDER BY distance ASC
            LIMIT %s;
            """,
            (vector_literal, session_id, top_k),
        )
        rows = cur.fetchall() or []
        return [dict(r) for r in rows]
