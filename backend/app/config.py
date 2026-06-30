from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Dental Manager"
    database_url: str = "sqlite:///./data/dental_manager.db"
    upload_dir: Path = Path("./uploads")
    secret_key: str = "change-me-in-production"
    app_env: str = "development"
    access_token_expire_minutes: int = 720
    admin_username: str = "admin"
    admin_password: str = "admin12345"
    cors_origins: str = "http://localhost:5173,http://localhost:8080"
    allow_database_refresh: bool = True

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_development(self) -> bool:
        return self.app_env.strip().lower() in {"dev", "development", "local", "test"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
