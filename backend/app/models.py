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


class Playlist(Base):
    __tablename__ = "playlists"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    url = Column(String, nullable=True)
    type = Column(String, default="m3u")  # m3u, file, xtream, manual
    channel_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    channels = relationship("Channel", back_populates="playlist", cascade="all, delete-orphan")


class Channel(Base):
    __tablename__ = "channels"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    stream_url = Column(String, nullable=False)
    category = Column(String, default="Geral", index=True)
    logo_url = Column(String, nullable=True)
    epg_id = Column(String, nullable=True)
    is_custom = Column(Boolean, default=False, nullable=False)
    playlist_id = Column(Integer, ForeignKey("playlists.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    playlist = relationship("Playlist", back_populates="channels")
