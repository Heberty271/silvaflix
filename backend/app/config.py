import os
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SECRET_KEY = os.getenv("SECRET_KEY", "chave-insegura-troque-isso")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

MEDIA_MOVIES_DIR = os.getenv("MEDIA_MOVIES_DIR", os.path.join(BASE_DIR, "media", "movies"))
MEDIA_THUMBS_DIR = os.getenv("MEDIA_THUMBS_DIR", os.path.join(BASE_DIR, "media", "thumbnails"))

# MEDIA_MOVIES_DIR pode apontar para um HD externo, que pode nao estar
# conectado no momento em que o backend sobe - nesse caso, so avisa no
# console em vez de travar a aplicacao inteira.
try:
    os.makedirs(MEDIA_MOVIES_DIR, exist_ok=True)
except OSError:
    print(
        f"[AVISO] Nao foi possivel acessar a pasta de filmes '{MEDIA_MOVIES_DIR}'. "
        "Se ela fica em um HD externo, confira se ele esta conectado."
    )

os.makedirs(MEDIA_THUMBS_DIR, exist_ok=True)

DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'streaming.db')}"

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")]

TMDB_API_KEY = os.getenv("TMDB_API_KEY", "")
TMDB_LANGUAGE = os.getenv("TMDB_LANGUAGE", "pt-BR")
TMDB_API_BASE = "https://api.themoviedb.org/3"
TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500"
