from typing import Optional, List
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


class MovieCreate(BaseModel):
    title: str
    synopsis: Optional[str] = ""
    year: Optional[int] = None
    genre: Optional[str] = None
    duration_minutes: Optional[int] = None
    director: Optional[str] = None
    cast: Optional[str] = None
    filename: str
    thumbnail_filename: Optional[str] = None
    backdrop_filename: Optional[str] = None
    is_private: bool = True
    is_featured: bool = False

    is_series: bool = False
    series_title: Optional[str] = None
    season_number: Optional[int] = None
    episode_number: Optional[int] = None
    episode_title: Optional[str] = None

    collection_name: Optional[str] = None
    trailer_youtube_id: Optional[str] = None

    video_url: Optional[str] = None
    is_external: bool = False
    source_name: Optional[str] = None


class MovieOut(BaseModel):
    id: int
    title: str
    synopsis: Optional[str] = ""
    year: Optional[int] = None
    genre: Optional[str] = None
    duration_minutes: Optional[int] = None
    director: Optional[str] = None
    cast: Optional[str] = None
    filename: str
    thumbnail_filename: Optional[str] = None
    backdrop_filename: Optional[str] = None
    is_private: bool
    is_featured: bool

    is_series: bool
    series_title: Optional[str] = None
    season_number: Optional[int] = None
    episode_number: Optional[int] = None
    episode_title: Optional[str] = None

    collection_name: Optional[str] = None
    trailer_youtube_id: Optional[str] = None

    video_url: Optional[str] = None
    is_external: bool = False
    source_name: Optional[str] = None

    created_at: datetime

    class Config:
        from_attributes = True


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
    video_url: Optional[str] = None
    is_external: bool = False
    source_name: Optional[str] = None


class MovieFromUrlCreate(BaseModel):
    video_url: str
    title: Optional[str] = None
    tmdb_id: Optional[int] = None
    synopsis: Optional[str] = None
    year: Optional[int] = None
    genre: Optional[str] = None
    director: Optional[str] = None
    cast: Optional[str] = None
    duration_minutes: Optional[int] = None
    poster_url: Optional[str] = None
    backdrop_url: Optional[str] = None
    trailer_youtube_id: Optional[str] = None
    is_private: bool = False
    source_name: Optional[str] = "Link Web"
    is_series: bool = False
    series_title: Optional[str] = None
    season_number: Optional[int] = None
    episode_number: Optional[int] = None


class BatchMovieUrlItem(BaseModel):
    video_url: str
    title: Optional[str] = None
    category: Optional[str] = None
    poster_url: Optional[str] = None


class BatchMovieImportRequest(BaseModel):
    items: List[BatchMovieUrlItem]
    source_name: Optional[str] = "Importação Web"
    fetch_tmdb: bool = True
    is_private: bool = False


class ParseMovieM3URequest(BaseModel):
    url: Optional[str] = None
    content: Optional[str] = None


class ParsedMovieItem(BaseModel):
    title: str
    video_url: str
    category: str
    poster_url: Optional[str] = None
    clean_title: str
    year: Optional[int] = None


class ParseMovieM3UResponse(BaseModel):
    total: int
    categories: List[CategoryWithCount]
    items: List[ParsedMovieItem]


class BulkDeleteMoviesRequest(BaseModel):
    movie_ids: List[int]


class DeleteMoviesBySourceRequest(BaseModel):
    source_name: str


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
    video_url: Optional[str] = None
    is_external: Optional[bool] = None
    source_name: Optional[str] = None


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


# TV Ao Vivo & IPTV
class PlaylistOut(BaseModel):
    id: int
    name: str
    url: Optional[str] = None
    type: str = "m3u"
    channel_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class PlaylistCreate(BaseModel):
    name: str
    url: Optional[str] = None
    type: str = "m3u"


class ChannelCreate(BaseModel):
    name: str
    stream_url: str
    category: str = "Geral"
    logo_url: Optional[str] = None
    epg_id: Optional[str] = None
    is_custom: bool = True
    playlist_id: Optional[int] = None
    order: int = 0


class ChannelUpdate(BaseModel):
    name: Optional[str] = None
    stream_url: Optional[str] = None
    category: Optional[str] = None
    logo_url: Optional[str] = None
    epg_id: Optional[str] = None
    is_active: Optional[bool] = None
    playlist_id: Optional[int] = None
    order: Optional[int] = None


class ChannelOut(BaseModel):
    id: int
    name: str
    stream_url: str
    category: str
    logo_url: Optional[str] = None
    epg_id: Optional[str] = None
    is_custom: bool
    playlist_id: Optional[int] = None
    user_id: Optional[int] = None
    is_active: bool
    order: int
    created_at: datetime

    class Config:
        from_attributes = True


class PaginatedChannels(BaseModel):
    items: List[ChannelOut]
    total: int
    page: int
    limit: int
    total_pages: int


class CategoryWithCount(BaseModel):
    category: str
    count: int


class M3UImportRequest(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    content: Optional[str] = None
    category_override: Optional[str] = None
    selected_categories: Optional[List[str]] = None


class ParsedChannel(BaseModel):
    name: str
    stream_url: str
    category: str = "Geral"
    logo_url: Optional[str] = None
    epg_id: Optional[str] = None


class XtreamLoginRequest(BaseModel):
    server_url: str
    username: str
    password: str


class BulkDeleteChannelsRequest(BaseModel):
    channel_ids: List[int]


class DeleteByCategoryRequest(BaseModel):
    category: str
    playlist_id: Optional[int] = None
