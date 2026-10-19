import os
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

SECRET_KEY = os.getenv("SECRET_KEY", "chave-insegura-troque-isso")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

MEDIA_MOVIES_DIR = os.getenv("MEDIA_MOVIES_DIR", os.path.join(BASE_DIR, "media", "movies"))
MEDIA_THUMBS_DIR = os.getenv("MEDIA_THUMBS_DIR", os.path.join(BASE_DIR, "media", "thumbnails"))

if not MEDIA_MOVIES_DIR.upper().startswith("D:") and not MEDIA_MOVIES_DIR.upper().startswith("E:"):
    try:
        os.makedirs(MEDIA_MOVIES_DIR, exist_ok=True)
    except OSError:
        pass

os.makedirs(MEDIA_THUMBS_DIR, exist_ok=True)

DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'streaming.db')}"

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")]

TMDB_API_KEY = os.getenv("TMDB_API_KEY", "")
TMDB_LANGUAGE = os.getenv("TMDB_LANGUAGE", "pt-BR")
TMDB_API_BASE = "https://api.themoviedb.org/3"
TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500"
