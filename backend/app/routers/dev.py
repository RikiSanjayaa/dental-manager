from fastapi import APIRouter, HTTPException

from app.config import get_settings
from app.database import refresh_database
from app.dependencies import AdminUser

router = APIRouter(prefix="/dev", tags=["dev"])


@router.post("/refresh-database")
def refresh_database_endpoint(_: AdminUser) -> dict[str, str]:
    settings = get_settings()
    if not settings.is_development or not settings.allow_database_refresh:
        raise HTTPException(
            status_code=403,
            detail="Database refresh hanya tersedia di development.",
        )
    refresh_database()
    return {"status": "ok", "message": "Database refreshed and default admin/rules seeded."}
