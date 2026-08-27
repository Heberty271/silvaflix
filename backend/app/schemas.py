from typing import Optional
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field

from .models import RoleEnum


class UserOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: RoleEnum

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: RoleEnum = RoleEnum.viewer


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class MovieOut(BaseModel):
    id: int
    title: str
    synopsis: str
    year: Optional[int] = None
    genre: Optional[str] = None
    duration_minutes: Optional[int] = None
    director: Optional[str] = None
    cast: Optional[str] = None
    thumbnail_filename: Optional[str] = None
    backdrop_filename: Optional[str] = None
    is_private: bool
    is_featured: bool

    # Séries
    is_series: bool = False
    series_title: Optional[str] = None
    season_number: Optional[int] = None
    episode_number: Optional[int] = None
    episode_title: Optional[str] = None

    # Coleções / Franquias & Trailers
    collection_name: Optional[str] = None
    trailer_youtube_id: Optional[str] = None

    created_at: datetime

    class Config:
        from_attributes = True


class MovieCreate(BaseModel):
    title: str
    synopsis: str = ""
    year: Optional[int] = None
    genre: Optional[str] = None
    duration_minutes: Optional[int] = None
    director: Optional[str] = None
    cast: Optional[str] = None
    filename: str
    is_private: bool = True

    is_series: bool = False
    series_title: Optional[str] = None
    season_number: Optional[int] = None
    episode_number: Optional[int] = None
    episode_title: Optional[str] = None

    collection_name: Optional[str] = None
    trailer_youtube_id: Optional[str] = None


class TMDBSearchResult(BaseModel):
    tmdb_id: int
    title: str
    year: Optional[str] = None
    poster_url: Optional[str] = None
    overview: str = ""


class MovieFromTMDB(BaseModel):
    tmdb_id: int
    filename: str
    is_private: bool = True


class MovieUpdate(BaseModel):
    title: Optional[str] = None
    synopsis: Optional[str] = None
    year: Optional[int] = None
    genre: Optional[str] = None
    duration_minutes: Optional[int] = None
    director: Optional[str] = None
    cast: Optional[str] = None
    is_private: Optional[bool] = None
    is_featured: Optional[bool] = None
    is_series: Optional[bool] = None
    series_title: Optional[str] = None
    season_number: Optional[int] = None
    episode_number: Optional[int] = None
    episode_title: Optional[str] = None
    collection_name: Optional[str] = None
    trailer_youtube_id: Optional[str] = None


# Resenhas Familiares
class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str
    profile_name: Optional[str] = None
    has_spoiler: bool = False


class ReviewOut(BaseModel):
    id: int
    movie_id: int
    user_id: int
    user_name: str
    profile_name: Optional[str] = None
    rating: int
    comment: str
    has_spoiler: bool
    created_at: datetime

    class Config:
        from_attributes = True
