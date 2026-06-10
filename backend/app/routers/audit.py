from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel
from sqlmodel import select

from app.dependencies import AdminUser, CurrentUser, SessionDep
from app.models import AuditLog

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


class AuditLogRead(BaseModel):
    id: int
    actor_id: int | None
    actor_username: str | None
    actor_name: str | None
    action: str
    entity_type: str
    entity_id: str | None
    description: str
    metadata_json: dict
    created_at: datetime


def audit_log_statement(
    action: str | None = None,
    entity_type: str | None = None,
    actor_id: int | None = None,
    limit: int = 200,
):
    statement = select(AuditLog)
    if actor_id is not None:
        statement = statement.where(AuditLog.actor_id == actor_id)
    if action:
        statement = statement.where(AuditLog.action == action)
    if entity_type:
        statement = statement.where(AuditLog.entity_type == entity_type)
    return statement.order_by(AuditLog.created_at.desc()).limit(max(1, min(limit, 500)))


@router.get("", response_model=list[AuditLogRead])
def list_audit_logs(
    session: SessionDep,
    _: AdminUser,
    action: str | None = None,
    entity_type: str | None = None,
    limit: int = 200,
) -> list[AuditLog]:
    return session.exec(audit_log_statement(action, entity_type, limit=limit)).all()


@router.get("/me", response_model=list[AuditLogRead])
def list_my_audit_logs(
    session: SessionDep,
    user: CurrentUser,
    action: str | None = None,
    entity_type: str | None = None,
    limit: int = 200,
) -> list[AuditLog]:
    return session.exec(audit_log_statement(action, entity_type, user.id, limit)).all()
