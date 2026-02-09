from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from passlib.context import CryptContext
from utils.jwt import create_access_token, get_current_user
from db import models as db_models

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def _validate_password_length(password: str) -> None:
    # bcrypt only uses first 72 bytes; enforce limit to avoid errors
    if len(password.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be 72 bytes or fewer",
        )


class UserCreate(BaseModel):
    email: str
    password: str
    organization_name: str


class UserLogin(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    organization_name: str
    created_at: Optional[datetime] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/register", response_model=UserResponse)
def register(user_data: UserCreate):
    _validate_password_length(user_data.password)
    email = user_data.email.strip().lower()
    existing = db_models.get_user_by_email(email)
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    password_hash = pwd_context.hash(user_data.password)
    user = db_models.create_user(email, password_hash, user_data.organization_name)
    return user


@router.post("/login", response_model=TokenResponse)
def login(user_data: UserLogin):
    _validate_password_length(user_data.password)
    email = user_data.email.strip().lower()
    user = db_models.get_user_by_email(email)
    if not user or not pwd_context.verify(user_data.password, user.get("password_hash", "")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token({"sub": str(user["id"]), "email": user["email"]})
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
def me(current_user=Depends(get_current_user)):
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = db_models.get_user_by_id(int(user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user
