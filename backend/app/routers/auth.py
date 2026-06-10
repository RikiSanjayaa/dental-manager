from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlmodel import select

from app.audit import record_audit
from app.dependencies import CurrentUser, SessionDep
from app.models import Employee, UserRole, User
from app.security import create_access_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserMe(BaseModel):
    id: int
    username: str
    full_name: str
    role: UserRole
    employee_id: int | None = None
    employee_name: str | None = None


@router.post("/login", response_model=TokenResponse)
def login(session: SessionDep, form: OAuth2PasswordRequestForm = Depends()) -> TokenResponse:
    user = session.exec(select(User).where(User.username == form.username)).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Username atau password salah")
    record_audit(session, user, "login", "auth", f"Login {user.username}.", entity_id=user.id)
    session.commit()
    return TokenResponse(access_token=create_access_token(user.username, {"role": user.role.value}))


@router.get("/me", response_model=UserMe)
def me(session: SessionDep, user: CurrentUser) -> UserMe:
    employee = session.get(Employee, user.employee_id) if user.employee_id else None
    return UserMe(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        role=user.role,
        employee_id=user.employee_id,
        employee_name=employee.name if employee else None,
    )


@router.post("/logout")
def logout(session: SessionDep, user: CurrentUser) -> dict[str, str]:
    record_audit(session, user, "logout", "auth", f"Logout {user.username}.", entity_id=user.id)
    session.commit()
    return {"status": "ok"}
