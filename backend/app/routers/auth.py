from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlmodel import select

from app.dependencies import CurrentUser, SessionDep
from app.models import UserRole, User
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


@router.post("/login", response_model=TokenResponse)
def login(session: SessionDep, form: OAuth2PasswordRequestForm = Depends()) -> TokenResponse:
    user = session.exec(select(User).where(User.username == form.username)).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Username atau password salah")
    return TokenResponse(access_token=create_access_token(user.username, {"role": user.role.value}))


@router.get("/me", response_model=UserMe)
def me(user: CurrentUser) -> UserMe:
    return UserMe(id=user.id, username=user.username, full_name=user.full_name, role=user.role)
