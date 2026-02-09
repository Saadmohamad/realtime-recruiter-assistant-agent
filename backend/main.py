from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from api.auth import router as auth_router
from api.session_setup import router as session_setup_router
from api.realtime import router as realtime_router
from api.interview import router as interview_router
from db.models import setup_database
from services.document_service import validate_gcs_access
import logging
import asyncio
import concurrent.futures

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Interview Assistant API",
    version="0.1.0",
    description="Interview intelligence assistant combining live transcription and JD/CV analysis"
)

@app.on_event("startup")
async def startup_event():
    logger.info("Starting Interview Assistant API...")
    logger.info("Environment: %s", settings.environment)
    logger.info("Database URL configured: %s", "Yes" if settings.database_url else "No")

    async def setup_db_async():
        try:
            loop = asyncio.get_event_loop()
            with concurrent.futures.ThreadPoolExecutor() as executor:
                await loop.run_in_executor(executor, setup_database)
            logger.info("Database setup completed successfully")
        except Exception as e:
            logger.error("Database setup failed: %s", e)

    asyncio.create_task(setup_db_async())

    # Fail fast if GCS is configured but ADC/bucket access is missing
    try:
        validate_gcs_access()
        logger.info("GCS access validated")
    except Exception as e:
        logger.error("GCS validation failed: %s", e)
        raise

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=[
        "Accept",
        "Accept-Language",
        "Content-Language",
        "Content-Type",
        "Authorization",
        "X-Requested-With",
    ],
    max_age=600,
)

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(session_setup_router, prefix="/api/sessions", tags=["sessions"])
app.include_router(realtime_router, prefix="/api/realtime", tags=["realtime"])
app.include_router(interview_router, prefix="/api/interview", tags=["interview"])

@app.get("/")
def root():
    """Root endpoint"""
    return {
        "message": "Interview Assistant API is running.",
        "version": "0.1.0",
        "environment": settings.environment
    }

@app.get("/health")
def health():
    """Health check endpoint"""
    return {
        "status": "ok",
        "environment": settings.environment,
        "service": "interview-assistant-api"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
