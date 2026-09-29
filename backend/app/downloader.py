"""
Gerenciador de Downloads em Segundo Plano para o SilvaFlix (yt-dlp & Direct Downloader)
- Baixa vídeos de links diretos (MP4, MKV, m3u8) e de 1000+ plataformas (YouTube, Dailymotion, Vimeo, etc.).
- Salva os arquivos na pasta local de filmes (movies/) e cadastra no catálogo com metadados do TMDB.
- Monitora progresso em tempo real (velocidade, porcentagem, tempo restante).
"""
import asyncio
import os
import re
import time
import uuid
from typing import Dict, Optional, Any, List
from datetime import datetime

import yt_dlp
from sqlalchemy.orm import Session

from .config import MOVIES_DIR, TMDB_API_KEY
from .database import SessionLocal
from .models import Movie
from .ai_finder import search_canonical_tmdb


class DownloadTask:
    def __init__(self, task_id: str, url: str, title: str, tmdb_id: Optional[int] = None, is_private: bool = False):
        self.id = task_id
        self.url = url
        self.title = title
        self.tmdb_id = tmdb_id
        self.is_private = is_private
        self.filename = ""
        self.status = "queued"  # queued, downloading, finished, error, cancelled
        self.progress_percent = 0.0
        self.speed_str = "0 KB/s"
        self.eta_str = "Calculando..."
        self.downloaded_bytes = 0
        self.total_bytes = 0
        self.error_message: Optional[str] = None
        self.movie_id: Optional[int] = None
        self.created_at = datetime.utcnow().isoformat()
        self.cancelled = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "url": self.url,
            "title": self.title,
            "filename": self.filename,
            "status": self.status,
            "progress_percent": round(self.progress_percent, 1),
            "speed_str": self.speed_str,
            "eta_str": self.eta_str,
            "downloaded_bytes": self.downloaded_bytes,
            "total_bytes": self.total_bytes,
            "error_message": self.error_message,
            "movie_id": self.movie_id,
            "created_at": self.created_at,
        }


# Gerenciador global de tarefas em memória
DOWNLOAD_TASKS: Dict[str, DownloadTask] = {}


def sanitize_filename(name: str) -> str:
    """Remove caracteres inválidos para nomes de arquivos no Windows/Linux."""
    clean = re.sub(r'[\\/*?:"<>|]', "", name)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean or "filme_baixado"


def format_bytes(b: int) -> str:
    if not b:
        return "0 MB"
    for unit in ["B", "KB", "MB", "GB"]:
        if b < 1024.0:
            return f"{b:.1f} {unit}"
        b /= 1024.0
    return f"{b:.1f} TB"


def format_seconds(s: int) -> str:
    if not s or s <= 0:
        return "0s"
    m, sec = divmod(s, 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h}h {m}m {sec}s"
    if m > 0:
        return f"{m}m {sec}s"
    return f"{sec}s"


def run_ytdlp_download(task: DownloadTask):
    """Executa o download via yt-dlp em thread isolada."""
    task.status = "downloading"

    def progress_hook(d):
        if task.cancelled:
            raise Exception("Download cancelado pelo usuário.")

        status = d.get("status")
        if status == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes", 0)
            task.downloaded_bytes = downloaded
            task.total_bytes = total

            if total > 0:
                task.progress_percent = (downloaded / total) * 100

            speed = d.get("speed")
            if speed:
                task.speed_str = f"{format_bytes(int(speed))}/s"

            eta = d.get("eta")
            if eta:
                task.eta_str = format_seconds(int(eta))

        elif status == "finished":
            task.progress_percent = 100.0
            task.eta_str = "Finalizado"

    os.makedirs(MOVIES_DIR, exist_ok=True)
    clean_base = sanitize_filename(task.title)
    out_template = os.path.join(MOVIES_DIR, f"{clean_base}_%(id)s.%(ext)s")

    ydl_opts = {
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "outtmpl": out_template,
        "progress_hooks": [progress_hook],
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "merge_output_format": "mp4",
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(task.url, download=True)
            saved_filename = ydl.prepare_filename(info)
            if not saved_filename.endswith(".mp4") and os.path.exists(saved_filename.rsplit(".", 1)[0] + ".mp4"):
                saved_filename = saved_filename.rsplit(".", 1)[0] + ".mp4"

            base_name = os.path.basename(saved_filename)
            task.filename = base_name
            task.status = "finished"

            # Registra no catálogo do SilvaFlix com metadados do TMDB
            register_downloaded_movie(task, base_name)

    except Exception as e:
        if task.cancelled:
            task.status = "cancelled"
            task.error_message = "Download cancelado."
        else:
            task.status = "error"
            task.error_message = str(e)


def register_downloaded_movie(task: DownloadTask, filename: str):
    """Cadastra o filme baixado no banco de dados SQLite com informações oficiais."""
    db: Session = SessionLocal()
    try:
        # Busca metadados TMDB
        metadata = None
        try:
            loop = asyncio.new_event_loop()
            metadata = loop.run_until_complete(search_canonical_tmdb(task.title))
            loop.close()
        except Exception:
            pass

        movie = Movie(
            title=metadata["title"] if metadata else task.title,
            synopsis=metadata["synopsis"] if metadata else "Filme baixado pelo gerenciador do SilvaFlix.",
            year=metadata.get("year") if metadata else None,
            genre=metadata.get("genre") if metadata else "Geral",
            duration_minutes=metadata.get("duration_minutes") if metadata else None,
            director=metadata.get("director") if metadata else None,
            cast=metadata.get("cast") if metadata else None,
            filename=filename,
            is_private=task.is_private,
            is_featured=False,
            collection_name=metadata.get("collection_name") if metadata else None,
            trailer_youtube_id=metadata.get("trailer_youtube_id") if metadata else None,
            is_external=False,
            source_name="Download Local",
        )

        db.add(movie)
        db.commit()
        db.refresh(movie)
        task.movie_id = movie.id

    except Exception as e:
        task.error_message = f"Download concluído, mas falhou ao registrar no banco: {e}"
    finally:
        db.close()


async def start_background_download(
    url: str,
    title: Optional[str] = None,
    tmdb_id: Optional[int] = None,
    is_private: bool = False,
) -> DownloadTask:
    """Inicia um novo download de vídeo em segundo plano."""
    task_id = str(uuid.uuid4())[:8]
    movie_title = title or f"video_{task_id}"

    # Se não passou título descritivo, tenta resolver pelo TMDB se tmdb_id existir
    if tmdb_id and not title:
        try:
            meta = await search_canonical_tmdb(str(tmdb_id))
            movie_title = meta["title"]
        except Exception:
            pass

    task = DownloadTask(
        task_id=task_id,
        url=url,
        title=movie_title,
        tmdb_id=tmdb_id,
        is_private=is_private,
    )
    DOWNLOAD_TASKS[task_id] = task

    # Executa a thread de download em segundo plano
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, run_ytdlp_download, task)

    return task


def list_active_downloads() -> List[Dict[str, Any]]:
    """Retorna o status de todos os downloads recentes."""
    return [task.to_dict() for task in DOWNLOAD_TASKS.values()]


def cancel_download(task_id: str) -> bool:
    """Cancela um download em andamento."""
    task = DOWNLOAD_TASKS.get(task_id)
    if task:
        task.cancelled = True
        task.status = "cancelled"
        return True
    return False
