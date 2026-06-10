from typing import Any

from sqlmodel import Session

from app.models import AuditLog, User


def record_audit(
    session: Session,
    user: User,
    action: str,
    entity_type: str,
    description: str,
    *,
    entity_id: int | str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    session.add(
        AuditLog(
            actor_id=user.id,
            actor_username=user.username,
            actor_name=user.full_name,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            description=description,
            metadata_json=metadata or {},
        )
    )
