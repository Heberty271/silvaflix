from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from . import models, party
from .database import engine
from .config import CORS_ORIGINS
from .routers import auth_routes, movies_routes

# 1. Cria tabelas caso nao existam
models.Base.metadata.create_all(bind=engine)

# 2. Migracao automatica de colunas novas no SQLite
def run_sqlite_migrations():
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(movies)")).fetchall()
        existing_cols = {row[1] for row in result}
        
        new_cols = [
            ("director", "VARCHAR"),
            ("cast", "VARCHAR"),
            ("backdrop_filename", "VARCHAR"),
            ("is_featured", "BOOLEAN NOT NULL DEFAULT 0"),
            ("is_series", "BOOLEAN NOT NULL DEFAULT 0"),
            ("series_title", "VARCHAR"),
            ("season_number", "INTEGER"),
            ("episode_number", "INTEGER"),
            ("episode_title", "VARCHAR"),
            ("collection_name", "VARCHAR"),
            ("trailer_youtube_id", "VARCHAR"),
        ]
        for col_name, col_type in new_cols:
            if col_name not in existing_cols:
                try:
                    conn.execute(text(f"ALTER TABLE movies ADD COLUMN {col_name} {col_type}"))
                    conn.commit()
                except Exception:
                    pass

run_sqlite_migrations()

app = FastAPI(title="SilvaFlix API — Streaming Familiar")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router)
app.include_router(movies_routes.router)
app.include_router(movies_routes.admin_router)
app.include_router(party.router)


@app.get("/health")
def health():
    return {"status": "ok"}
