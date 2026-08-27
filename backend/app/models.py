import enum
from datetime import datetime

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, Text, ForeignKey
from sqlalchemy.orm import relationship

from .database import Base


class RoleEnum(str, enum.Enum):
    admin = "admin"
    viewer = "viewer"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(RoleEnum), default=RoleEnum.viewer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Movie(Base):
    __tablename__ = "movies"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    synopsis = Column(Text, default="")
    year = Column(Integer, nullable=True)
    genre = Column(String, nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    director = Column(String, nullable=True)
    cast = Column(String, nullable=True)
    filename = Column(String, nullable=False)
    thumbnail_filename = Column(String, nullable=True)
    backdrop_filename = Column(String, nullable=True)
    is_private = Column(Boolean, default=True, nullable=False)
    is_featured = Column(Boolean, default=False, nullable=False)

    # Séries / Episódios
    is_series = Column(Boolean, default=False, nullable=False)
    series_title = Column(String, nullable=True)
    season_number = Column(Integer, nullable=True)
    episode_number = Column(Integer, nullable=True)
    episode_title = Column(String, nullable=True)

    # Coleções / Franquias & Trailers
    collection_name = Column(String, nullable=True)
    trailer_youtube_id = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)


class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)
    movie_id = Column(Integer, ForeignKey("movies.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    user_name = Column(String, nullable=False)
    profile_name = Column(String, nullable=True)
    rating = Column(Integer, nullable=False)  # 1 a 5
    comment = Column(Text, nullable=False)
    has_spoiler = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
