from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Dental Manager"
    database_url: str = "sqlite:///./data/dental_manager.db"
    upload_dir: Path = Path("./uploads")
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 720
    admin_username: str = "admin"
    admin_password: str = "admin12345"
    cors_origins: str = "http://localhost:5173,http://localhost:8080"
    allow_database_refresh: bool = True

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
