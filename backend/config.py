from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from typing import List, Optional
import json
import logging
import os

class Settings(BaseSettings):
    """Application settings"""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",  # Ignore extra env vars (important for Cloud Run)
    )
    
    # Environment
    environment: str = Field("development", env="ENVIRONMENT")
    
    # Logging
    log_level: str = Field("INFO", env="LOG_LEVEL")
    
    # Database
    database_url: str = Field(..., env="DATABASE_URL")

    # Auth
    secret_key: str = Field(..., env="SECRET_KEY")
    access_token_expire_minutes: int = Field(120, env="ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_days: int = Field(30, env="REFRESH_TOKEN_DAYS")

    # OpenAI
    openai_api_key: Optional[str] = Field(None, env="OPENAI_API_KEY")
    realtime_model: str = Field("gpt-4o-transcribe", env="REALTIME_MODEL")
    action_model: str = Field("gpt-4o-mini", env="ACTION_MODEL")
    embedding_model: str = Field("text-embedding-3-small", env="EMBEDDING_MODEL")

    # GCP / GCS
    gcs_bucket: Optional[str] = Field(None, env="GCS_BUCKET")
    gcp_project: Optional[str] = Field(None, env="GCP_PROJECT")
    google_application_credentials: Optional[str] = Field(None, env="GOOGLE_APPLICATION_CREDENTIALS")

    # CORS (stored as raw string to avoid JSON parsing issues)
    allowed_origins: Optional[str] = Field(None, env="ALLOWED_ORIGINS")
    
    def model_post_init(self, __context) -> None:
        """Configure logging and validate settings after load."""
        logging.basicConfig(
            level=getattr(logging, self.log_level.upper(), logging.INFO),
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        self._validate_configuration()

    def _validate_configuration(self) -> None:
        errors = []
        if not self.secret_key or len(self.secret_key) < 32:
            errors.append("SECRET_KEY must be at least 32 characters long")
        if not self.database_url.startswith(("postgresql://", "postgres://")):
            errors.append("DATABASE_URL must be a PostgreSQL connection string")
        if self.environment.lower() != "development" and not self.gcs_bucket:
            errors.append("GCS_BUCKET must be set in non-development environments")
        if self.google_application_credentials and not os.path.exists(self.google_application_credentials):
            errors.append("GOOGLE_APPLICATION_CREDENTIALS path does not exist")
        if errors:
            raise ValueError("; ".join(errors))

    @property
    def allowed_origins_list(self) -> List[str]:
        """Parse ALLOWED_ORIGINS from string or JSON and return list."""
        raw = (self.allowed_origins or "").strip()
        if not raw:
            defaults = [
                "http://localhost:3000",
                "http://localhost:5173",
                "http://127.0.0.1:3000",
                "http://127.0.0.1:5173",
            ]
            if self.environment.lower() == "production":
                return [
                    origin for origin in defaults
                    if not ("localhost" in origin or "127.0.0.1" in origin)
                ]
            return defaults

        parsed: List[str] = []
        if raw.startswith("["):
            try:
                data = json.loads(raw)
                if isinstance(data, list):
                    parsed = [str(o).strip() for o in data if str(o).strip()]
                elif isinstance(data, str) and data.strip():
                    parsed = [data.strip()]
            except Exception:
                parsed = [o.strip() for o in raw.split(",") if o.strip()]
        else:
            parsed = [o.strip() for o in raw.split(",") if o.strip()]

        parsed = [origin for origin in parsed if origin and origin != "null"]
        return parsed

# Global settings instance
settings = Settings()
