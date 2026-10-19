import os
import re
import shutil
import subprocess
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request, Response
from fastapi.responses import StreamingResponse, FileResponse, RedirectResponse
import httpx
from sqlalchemy.orm import Session

from .. import models, schemas, tmdb
from ..ai_finder import ai_find_movie, clean_messy_title, inspect_google_drive_url, extract_drive_id_and_type
from ..torrent_engine import search_torrents_for_media, resolve_debrid_link
from ..downloader import start_background_download, list_active_downloads, cancel_download
from ..vod_scanner import scan_and_import_smart_vod
from ..auth import get_current_user, require_admin
from ..config import MEDIA_MOVIES_DIR, MEDIA_THUMBS_DIR, TMDB_API_KEY
from ..database import get_db
from ..audio_utils import probe_audio_tracks, probe_media_info, get_ffmpeg_binary

router = APIRouter(tags=["movies"])

CHUNK_SIZE = 1024 * 1024  # 1 MB por pedaco
VIDEO_EXTENSIONS = {".mp4", ".mkv", ".webm", ".mov", ".avi", ".m4v"}


import threading

_DRIVE_STATUS_CACHE: dict[str, tuple[bool, float]] = {}


def _is_drive_online(path: str, timeout: float = 0.6) -> bool:
    """Verifica rapidamente se a unidade de disco (ex: D:\\) está respondendo sem travar a thread em caso de falha de I/O do Windows."""
    drive = os.path.splitdrive(os.path.abspath(path))[0].upper()
    if not drive or drive == "C:":
        return True
    now = time.time()
    cached = _DRIVE_STATUS_CACHE.get(drive)
    if cached and (now - cached[1] < 15.0):
        return cached[0]

    result = [False]

    def _check():
        try:
            result[0] = os.path.isdir(drive + "\\")
        except Exception:
            result[0] = False

    t = threading.Thread(target=_check, daemon=True)
    t.start()
    t.join(timeout)
    online = result[0] if not t.is_alive() else False
    _DRIVE_STATUS_CACHE[drive] = (online, now)
    return online


def _safe_isfile(path: str) -> bool:
    if not path or not _is_drive_online(path):
        return False
    try:
        return os.path.isfile(path)
    except Exception:
        return False


def _resolve_media_path(filename: str) -> str:
    """Resolve o caminho do arquivo de vídeo no PC sem travar em discos desconectados."""
    if not filename:
        raise HTTPException(status_code=400, detail="Caminho de arquivo vazio")

    norm_name = os.path.normpath(filename)
    ext = os.path.splitext(norm_name)[1].lower()

    if os.path.isabs(norm_name) and _safe_isfile(norm_name):
        if ext in VIDEO_EXTENSIONS or ext in (".ts", ".wmv", ".flv", ".vob"):
            return norm_name

    search_roots = [
        os.path.abspath(MEDIA_MOVIES_DIR),
        "D:\\",
        "E:\\",
        "H:\\",
        "F:\\",
        "G:\\",
        os.path.abspath(os.path.join(os.path.dirname(os.path.dirname(__file__)), "media", "movies")),
    ]
    for root_dir in search_roots:
        if not root_dir or not _is_drive_online(root_dir):
            continue
        try:
            candidate = os.path.abspath(os.path.join(root_dir, filename))
            if os.path.commonpath([root_dir, candidate]) == root_dir and _safe_isfile(candidate):
                return candidate
        except Exception:
            continue

    fallback_base = os.path.abspath(os.path.join(os.path.dirname(os.path.dirname(__file__)), "media", "movies"))
    return os.path.abspath(os.path.join(fallback_base, filename))



def _visible_query(db: Session, user: Optional[models.User]):
    query = db.query(models.Movie)
    if user is None or user.role != models.RoleEnum.admin:
        query = query.filter(models.Movie.is_private == False)  # noqa: E712
    return query.order_by(models.Movie.created_at.desc())


def srt_to_vtt(srt_content: str) -> str:
    """Converte arquivo de legenda .srt para formato padrão .vtt suportado pelo HTML5."""
    content = srt_content.lstrip("\ufeff")
    vtt_content = re.sub(r"(\d{2}:\d{2}:\d{2}),(\d{3})", r"\1.\2", content)
    return "WEBVTT\n\n" + vtt_content


def parse_series_info(filename: str) -> dict:
    """Detecta se o arquivo e um episodio de serie (ex: S01E02 ou 1x05)."""
    basename = os.path.splitext(os.path.basename(filename))[0]

    match_s_e = re.search(r"\bS(\d{1,2})E(\d{1,3})\b", basename, re.IGNORECASE)
    if match_s_e:
        season = int(match_s_e.group(1))
        episode = int(match_s_e.group(2))
        series_name = basename[: match_s_e.start()]
        series_clean, _ = clean_messy_title(series_name)
        return {
            "is_series": True,
            "series_title": series_clean or basename,
            "season_number": season,
            "episode_number": episode,
        }

    match_nxn = re.search(r"\b(\d{1,2})x(\d{1,3})\b", basename, re.IGNORECASE)
    if match_nxn:
        season = int(match_nxn.group(1))
        episode = int(match_nxn.group(2))
        series_name = basename[: match_nxn.start()]
        series_clean, _ = clean_messy_title(series_name)
        return {
            "is_series": True,
            "series_title": series_clean or basename,
            "season_number": season,
            "episode_number": episode,
        }

    return {"is_series": False}


def clean_filename_for_search(filename: str) -> tuple[str, Optional[int]]:
    """Extrai título limpo e ano de um arquivo de vídeo (e da pasta pai se necessário) para consulta no TMDB."""
    basename = os.path.splitext(os.path.basename(filename))[0]
    title, year = clean_messy_title(basename)

    parent_dir = os.path.basename(os.path.dirname(filename))
    if parent_dir and parent_dir not in ("", ".", "/", "\\") and not parent_dir.endswith(":"):
        parent_title, parent_year = clean_messy_title(parent_dir)
        if not year and parent_year:
            year = parent_year
        if (not title or len(title) < 3 or title.lower() in ("filme", "movie", "video", "dublado", "playback")) and parent_title:
            title = parent_title

    return title, year


@router.get("/movies", response_model=list[schemas.MovieOut])
def list_movies(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Lista o catalogo. Admin ve tudo, Viewer so ve o catalogo publico."""
    return _visible_query(db, current_user).all()


@router.get("/movies/collections")
def list_collections(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Agrupa filmes por coleção ou franquia em ordem cronológica de lançamento."""
    query = _visible_query(db, current_user).filter(models.Movie.collection_name.isnot(None))
    movies = query.all()

    collections_map = {}
    for m in movies:
        col = m.collection_name
        if not col:
            continue
        if col not in collections_map:
            collections_map[col] = []
        collections_map[col].append(schemas.MovieOut.model_validate(m))

    result = []
    for name, items in collections_map.items():
        # Ordena por ano de lançamento
        items.sort(key=lambda x: x.year or 0)
        result.append({
            "name": name,
            "count": len(items),
            "movies": items,
        })

    result.sort(key=lambda x: x["name"])
    return result


@router.get("/movies/{movie_id}", response_model=schemas.MovieOut)
def get_movie(movie_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Filme nao encontrado")
    if movie.is_private and current_user.role != models.RoleEnum.admin:
        raise HTTPException(status_code=403, detail="Este conteudo e privado")

    out = schemas.MovieOut.model_validate(movie)
    if not movie.is_external and movie.filename and not movie.filename.startswith("http"):
        file_path = _resolve_media_path(movie.filename)
        if _safe_isfile(file_path):
            # Disco local está conectado e o arquivo existe: usa reprodução direta do PC
            out.video_url = None
            out.is_external = False
            info = probe_media_info(file_path)
            if info.get("duration_seconds"):
                out.duration_seconds = info["duration_seconds"]
        elif movie.video_url:
            # Disco local desconectado/ausente: ativa automaticamente os servidores em nuvem PT-BR
            out.is_external = True
    if not out.duration_seconds and movie.duration_minutes:
        out.duration_seconds = float(movie.duration_minutes * 60)
    return out


@router.get("/movies/{movie_id}/audio-tracks")
def get_movie_audio_tracks(
    movie_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Lista todas as faixas de áudio detectadas no arquivo de vídeo via FFmpeg."""
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Filme nao encontrado")
    if not movie.is_external and movie.filename and not movie.filename.startswith("http"):
        try:
            file_path = _resolve_media_path(movie.filename)
            if _safe_isfile(file_path):
                return probe_audio_tracks(file_path)
        except Exception:
            pass
    return [{
        "index": 0,
        "title": "🇧🇷 Português (Dublado PT-BR)",
        "language": "por",
        "language_name": "Português",
        "flag": "🇧🇷",
        "codec": "aac",
        "is_default": True
    }]


@router.get("/movies/{movie_id}/thumbnail")
def get_thumbnail(movie_id: int, db: Session = Depends(get_db)):
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie or not movie.thumbnail_filename:
        raise HTTPException(status_code=404, detail="Capa nao encontrada")
    if movie.thumbnail_filename.startswith("http://") or movie.thumbnail_filename.startswith("https://"):
        return RedirectResponse(url=movie.thumbnail_filename)
    path = os.path.join(MEDIA_THUMBS_DIR, movie.thumbnail_filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Arquivo de capa ausente no disco")
    return FileResponse(path)


@router.get("/movies/{movie_id}/backdrop")
def get_backdrop(movie_id: int, db: Session = Depends(get_db)):
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie or not movie.backdrop_filename:
        raise HTTPException(status_code=404, detail="Imagem de fundo nao encontrada")
    if movie.backdrop_filename.startswith("http://") or movie.backdrop_filename.startswith("https://"):
        return RedirectResponse(url=movie.backdrop_filename)
    path = os.path.join(MEDIA_THUMBS_DIR, movie.backdrop_filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Arquivo de imagem ausente no disco")
    return FileResponse(path)


@router.get("/movies/{movie_id}/reviews", response_model=list[schemas.ReviewOut])
def get_movie_reviews(
    movie_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Lista as resenhas e notas da família para este filme."""
    return db.query(models.Review).filter(models.Review.movie_id == movie_id).order_by(models.Review.created_at.desc()).all()


@router.post("/movies/{movie_id}/reviews", response_model=schemas.ReviewOut)
def create_movie_review(
    movie_id: int,
    payload: schemas.ReviewCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Adiciona uma resenha familiar com nota de 1 a 5 estrelas."""
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Filme nao encontrado")
    review = models.Review(
        movie_id=movie_id,
        user_id=current_user.id,
        user_name=current_user.name,
        profile_name=payload.profile_name or current_user.name,
        rating=payload.rating,
        comment=payload.comment,
        has_spoiler=payload.has_spoiler,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return review


@router.delete("/movies/{movie_id}/reviews/{review_id}")
def delete_movie_review(
    movie_id: int,
    review_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    review = db.query(models.Review).filter(models.Review.id == review_id, models.Review.movie_id == movie_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Resenha nao encontrada")
    if review.user_id != current_user.id and current_user.role != models.RoleEnum.admin:
        raise HTTPException(status_code=403, detail="Permissao negada")
    db.delete(review)
    db.commit()
    return {"ok": True}


@router.get("/movies/{movie_id}/trailer")
async def get_or_fetch_movie_trailer(
    movie_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Retorna o YouTube ID do trailer do filme, buscando e salvando no banco sob demanda se não houver."""
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Filme nao encontrado")

    if movie.trailer_youtube_id:
        return {"trailer_youtube_id": movie.trailer_youtube_id}

    # Se não tiver, busca no TMDB
    trailer_id = await tmdb.find_trailer_for_movie(movie.title, movie.year)
    if trailer_id:
        movie.trailer_youtube_id = trailer_id
        db.commit()
        return {"trailer_youtube_id": trailer_id}

    return {"trailer_youtube_id": None}


@router.get("/movies/{movie_id}/subtitles")
def get_movie_subtitles(movie_id: int, db: Session = Depends(get_db)):
    """Localiza arquivo de legenda (.vtt ou .srt) na mesma pasta do video e entrega em formato WebVTT."""
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Filme nao encontrado")
    if movie.is_external or (movie.filename and movie.filename.startswith("http")):
        return Response(content="WEBVTT\n\n", media_type="text/vtt")

    file_path = _resolve_media_path(movie.filename)
    if not _safe_isfile(file_path):
        return Response(content="WEBVTT\n\n", media_type="text/vtt")
    base_no_ext = os.path.splitext(file_path)[0]

    candidates = [
        base_no_ext + ".vtt",
        base_no_ext + ".srt",
        base_no_ext + ".pt-BR.vtt",
        base_no_ext + ".pt-BR.srt",
        base_no_ext + ".pt.vtt",
        base_no_ext + ".pt.srt",
    ]

    for sub_path in candidates:
        if _safe_isfile(sub_path):
            ext = os.path.splitext(sub_path)[1].lower()
            try:
                with open(sub_path, "r", encoding="utf-8-sig", errors="replace") as f:
                    text = f.read()
                if ext == ".srt":
                    text = srt_to_vtt(text)
                return Response(content=text, media_type="text/vtt")
            except Exception:
                pass

    return Response(content="WEBVTT\n\n", media_type="text/vtt")


RANGE_RE = re.compile(r"bytes=(\d+)-(\d*)")


@router.get("/movies/{movie_id}/stream")
def stream_movie(
    movie_id: int,
    request: Request,
    audio_track: Optional[int] = None,
    start: Optional[float] = None,
    db: Session = Depends(get_db),
):
    """Envia o video em pedacos (HTTP Range Requests), remuxa/transcodifica em tempo real ou redireciona stream externo."""
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Filme nao encontrado")
    if movie.is_private:
        current_user = get_current_user(request=request, token=None, db=db)
        if current_user.role != models.RoleEnum.admin:
            raise HTTPException(status_code=403, detail="Este conteudo e privado")

    target_url = movie.video_url or (movie.filename if movie.filename and movie.filename.startswith("http") else None)
    if movie.is_external or (movie.filename and movie.filename.startswith("http")):
        if target_url:
            return RedirectResponse(url=target_url, status_code=307)
        raise HTTPException(status_code=400, detail="URL de streaming externo não encontrada")

    file_path = _resolve_media_path(movie.filename)
    if not _safe_isfile(file_path):
        if target_url:
            return RedirectResponse(url=target_url, status_code=307)
        raise HTTPException(status_code=404, detail="Arquivo de video ausente no disco")

    ext = os.path.splitext(file_path)[1].lower()
    media_info = probe_media_info(file_path)
    video_codec = media_info.get("video_codec")
    pix_fmt = media_info.get("pix_fmt")
    tracks = media_info.get("audio_tracks", [])

    track_to_use = audio_track if (audio_track is not None and audio_track >= 0) else 0
    selected_audio = tracks[track_to_use] if track_to_use < len(tracks) else (tracks[0] if tracks else {})
    audio_codec = selected_audio.get("codec", "aac")
    is_surround = selected_audio.get("is_surround", False)

    needs_video_transcode = (
        ext in (".avi", ".wmv", ".flv", ".vob", ".mpg", ".mpeg")
        or (video_codec not in ("h264", "avc1", None))
        or (pix_fmt == "yuv420p10le")
    )

    needs_remux = (
        needs_video_transcode
        or ext in (".mkv", ".ts", ".mov")
        or (audio_track is not None and audio_track > 0)
        or (start is not None and start > 0)
        or (audio_codec not in ("aac",))
        or is_surround
    )

    if needs_remux:
        ffmpeg_bin = get_ffmpeg_binary()
        cmd = [
            ffmpeg_bin,
            "-hide_banner",
            "-fflags", "+genpts+discardcorrupt",
        ]
        if start is not None and start > 0:
            cmd.extend(["-ss", str(float(start))])
        cmd.extend([
            "-i", file_path,
            "-map", "0:v:0",
            "-map", f"0:a:{track_to_use}?",
            "-sn",
            "-dn",
            "-map_chapters", "-1",
            "-map_metadata", "-1",
        ])
        if needs_video_transcode:
            cmd.extend([
                "-vf", "scale='min(1920,trunc(iw/2)*2)':-2,format=yuv420p",
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-crf", "23",
            ])
        else:
            cmd.extend(["-c:v", "copy"])

        cmd.extend([
            "-c:a", "aac",
            "-ac", "2",
            "-ar", "48000",
            "-b:a", "192k",
            "-avoid_negative_ts", "make_zero",
            "-f", "mp4",
            "-movflags", "frag_keyframe+empty_moov+default_base_moof",
            "pipe:1",
        ])

        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=65536)

        def iter_ffmpeg():
            try:
                while True:
                    chunk = process.stdout.read(65536)
                    if not chunk:
                        break
                    yield chunk
            finally:
                try:
                    process.terminate()
                    process.kill()
                except Exception:
                    pass

        stream_headers = {
            "Accept-Ranges": "none",
            "Cache-Control": "no-store",
            "Access-Control-Expose-Headers": "X-Content-Duration",
        }
        exact_duration = media_info.get("duration_seconds") or (float(movie.duration_minutes * 60) if movie.duration_minutes else None)
        if exact_duration:
            stream_headers["X-Content-Duration"] = str(exact_duration)

        return StreamingResponse(
            iter_ffmpeg(),
            status_code=200,
            media_type="video/mp4",
            headers=stream_headers,
        )

    # Streaming padrão por Range Requests
    file_size = os.path.getsize(file_path)
    range_header = request.headers.get("range")

    if range_header is None:
        def full_iter():
            with open(file_path, "rb") as f:
                while chunk := f.read(CHUNK_SIZE):
                    yield chunk

        headers = {
            "Content-Length": str(file_size),
            "Accept-Ranges": "bytes",
            "Content-Type": "video/mp4",
        }
        return StreamingResponse(full_iter(), status_code=200, headers=headers, media_type="video/mp4")

    match = RANGE_RE.match(range_header)
    if not match:
        raise HTTPException(status_code=416, detail="Cabecalho Range invalido")

    start = int(match.group(1))
    end = int(match.group(2)) if match.group(2) else file_size - 1
    end = min(end, file_size - 1)
    if start > end or start >= file_size:
        raise HTTPException(status_code=416, detail="Range fora dos limites do arquivo")

    length = end - start + 1

    def range_iter():
        with open(file_path, "rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(CHUNK_SIZE, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(length),
        "Content-Type": "video/mp4",
    }
    return StreamingResponse(range_iter(), status_code=206, headers=headers, media_type="video/mp4")


@router.get("/movies/{movie_id}/proxy-stream")
async def proxy_stream_movie(
    movie_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Proxy reverso para streams externos caso o navegador bloqueie por CORS ou Mixed Content."""
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Filme nao encontrado")
    if movie.is_private and current_user.role != models.RoleEnum.admin:
        raise HTTPException(status_code=403, detail="Este conteudo e privado")

    target_url = movie.video_url or (movie.filename if movie.filename and movie.filename.startswith("http") else None)
    if not target_url:
        raise HTTPException(status_code=400, detail="Este filme nao possui URL externa")

    client = httpx.AsyncClient(timeout=30.0, follow_redirects=True)
    try:
        req = client.build_request("GET", target_url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        })
        resp = await client.send(req, stream=True)
        return StreamingResponse(
            resp.aiter_bytes(),
            status_code=resp.status_code,
            headers={k: v for k, v in resp.headers.items() if k.lower() in ("content-type", "content-length", "accept-ranges")},
            media_type=resp.headers.get("content-type", "video/mp4"),
            background=client.aclose,
        )
    except Exception as e:
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"Erro ao conectar ao stream externo: {str(e)}")


# ---------------------- Rotas administrativas (CMS) ----------------------

admin_router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


@admin_router.get("/stats")
def get_admin_stats(db: Session = Depends(get_db)):
    """Retorna estatísticas gerais do catálogo e horas da família."""
    movies = db.query(models.Movie).all()
    total_movies = sum(1 for m in movies if not m.is_series)
    total_episodes = sum(1 for m in movies if m.is_series)
    total_minutes = sum(m.duration_minutes or 0 for m in movies)
    
    genres_count = {}
    for m in movies:
        if m.genre:
            for g in m.genre.split(","):
                g = g.strip()
                genres_count[g] = genres_count.get(g, 0) + 1

    top_genre = max(genres_count.items(), key=lambda x: x[1])[0] if genres_count else "Geral"

    return {
        "total_movies": total_movies,
        "total_episodes": total_episodes,
        "total_duration_hours": round(total_minutes / 60, 1),
        "genres_count": genres_count,
        "top_genre": top_genre,
        "total_titles": len(movies),
    }


@admin_router.get("/movies/available-files")
def list_available_files(db: Session = Depends(get_db)):
    """Varre a pasta de midia (e drives locais D:\\ / E:\\) e lista os arquivos de video que ainda nao foram cadastrados."""
    already_registered = set()
    for (fname,) in db.query(models.Movie.filename).all():
        if fname:
            already_registered.add(fname)
            already_registered.add(fname.replace("\\", "/"))
            already_registered.add(os.path.normpath(fname))

    found = []
    seen_abs = set()

    scan_roots = [MEDIA_MOVIES_DIR]
    for extra_drv in ("D:\\", "E:\\", os.path.join(os.path.dirname(os.path.dirname(__file__)), "media", "movies")):
        if os.path.isdir(extra_drv) and os.path.abspath(extra_drv) not in [os.path.abspath(r) for r in scan_roots if os.path.isdir(r)]:
            scan_roots.append(extra_drv)

    primary_abs = os.path.abspath(MEDIA_MOVIES_DIR) if os.path.isdir(MEDIA_MOVIES_DIR) else None

    for base_dir in scan_roots:
        if not os.path.isdir(base_dir):
            continue
        base_abs = os.path.abspath(base_dir)
        for root, dirs, filenames in os.walk(base_abs):
            dirs[:] = [
                d for d in dirs
                if not d.startswith(".")
                and d not in ("$RECYCLE.BIN", "System Volume Information", "Windows", "Program Files", "Program Files (x86)", "AppData", "node_modules", "venv")
            ]
            for name in filenames:
                if os.path.splitext(name)[1].lower() not in VIDEO_EXTENSIONS:
                    continue
                full_path = os.path.abspath(os.path.join(root, name))
                if full_path in seen_abs:
                    continue
                seen_abs.add(full_path)

                if primary_abs and os.path.commonpath([primary_abs, full_path]) == primary_abs:
                    rel_path = os.path.relpath(full_path, primary_abs).replace(os.sep, "/")
                else:
                    rel_path = full_path.replace(os.sep, "/")

                if (
                    rel_path not in already_registered
                    and full_path not in already_registered
                    and full_path.replace(os.sep, "/") not in already_registered
                ):
                    found.append(rel_path)

    return sorted(found)


async def _register_local_video_file(
    rel_or_abs_path: str,
    db: Session,
    source_name: str = "Servidor Local (Disco)",
    is_private: bool = False,
) -> dict:
    """Registra um arquivo de vídeo local consultando automaticamente o TMDB para pôster, fundo e sinopse."""
    clean_title, file_year = clean_filename_for_search(rel_or_abs_path)
    series_info = parse_series_info(rel_or_abs_path)

    candidates = []
    if TMDB_API_KEY and clean_title:
        try:
            candidates = await tmdb.search_movies(clean_title)
        except Exception:
            pass

    if candidates:
        chosen = candidates[0]
        if file_year:
            for c in candidates:
                if c.year and int(c.year) == file_year:
                    chosen = c
                    break

        details = await tmdb.get_movie_details(chosen.tmdb_id)
        title_final = details["title"]
        if series_info.get("is_series"):
            title_final = f"{details['title']} - T{series_info['season_number']}E{series_info['episode_number']}"

        movie = models.Movie(
            title=title_final,
            synopsis=details["synopsis"],
            year=details["year"],
            genre=details["genre"],
            duration_minutes=details["duration_minutes"],
            director=details.get("director"),
            cast=details.get("cast"),
            filename=rel_or_abs_path,
            is_external=False,
            source_name=source_name,
            is_private=is_private,
            is_series=series_info.get("is_series", False),
            series_title=series_info.get("series_title") or (details["title"] if series_info.get("is_series") else None),
            season_number=series_info.get("season_number"),
            episode_number=series_info.get("episode_number"),
            collection_name=details.get("collection_name"),
            trailer_youtube_id=details.get("trailer_youtube_id"),
        )
        db.add(movie)
        db.commit()
        db.refresh(movie)

        if details.get("poster_url"):
            try:
                img = await tmdb.download_poster(details["poster_url"])
                thumb_name = f"movie_{movie.id}.jpg"
                with open(os.path.join(MEDIA_THUMBS_DIR, thumb_name), "wb") as f:
                    f.write(img)
                movie.thumbnail_filename = thumb_name
            except Exception:
                pass

        if details.get("backdrop_url"):
            try:
                img = await tmdb.download_poster(details["backdrop_url"])
                bg_name = f"movie_{movie.id}_bg.jpg"
                with open(os.path.join(MEDIA_THUMBS_DIR, bg_name), "wb") as f:
                    f.write(img)
                movie.backdrop_filename = bg_name
            except Exception:
                pass

        db.commit()
        db.refresh(movie)
        return {"filename": rel_or_abs_path, "title": movie.title, "status": "added", "movie_id": movie.id}
    else:
        title_final = clean_title.title() if clean_title else os.path.splitext(os.path.basename(rel_or_abs_path))[0]
        if series_info.get("is_series"):
            title_final = f"{series_info['series_title']} - T{series_info['season_number']}E{series_info['episode_number']}"

        movie = models.Movie(
            title=title_final,
            filename=rel_or_abs_path,
            year=file_year,
            is_external=False,
            source_name=source_name,
            is_private=is_private,
            is_series=series_info.get("is_series", False),
            series_title=series_info.get("series_title"),
            season_number=series_info.get("season_number"),
            episode_number=series_info.get("episode_number"),
        )
        db.add(movie)
        db.commit()
        db.refresh(movie)
        return {"filename": rel_or_abs_path, "title": movie.title, "status": "added_without_tmdb", "movie_id": movie.id}


@admin_router.post("/movies/auto-scan")
async def auto_scan_movies(db: Session = Depends(get_db)):
    """Varre a pasta de midia, detecta séries ou filmes, consulta o TMDB e cadastra tudo."""
    available = list_available_files(db)
    if not available:
        return {"scanned": 0, "added": 0, "skipped": 0, "results": []}

    results = []
    added_count = 0
    skipped_count = 0

    for rel_path in available:
        try:
            res_item = await _register_local_video_file(rel_path, db=db)
            added_count += 1
            results.append(res_item)
        except Exception as e:
            skipped_count += 1
            results.append({"filename": rel_path, "status": "error", "error": str(e)})

    return {
        "scanned": len(available),
        "added": added_count,
        "skipped": skipped_count,
        "results": results,
    }


@admin_router.post("/movies", response_model=schemas.MovieOut)
def create_movie(payload: schemas.MovieCreate, db: Session = Depends(get_db)):
    file_path = _resolve_media_path(payload.filename)
    if not os.path.isfile(file_path):
        raise HTTPException(
            status_code=400,
            detail=f"Arquivo '{payload.filename}' nao encontrado em {MEDIA_MOVIES_DIR}.",
        )
    movie = models.Movie(**payload.model_dump())
    db.add(movie)
    db.commit()
    db.refresh(movie)
    return movie


@admin_router.get("/tmdb/search", response_model=list[schemas.TMDBSearchResult])
async def search_tmdb(query: str):
    if not query or not query.strip():
        raise HTTPException(status_code=400, detail="Informe um titulo para buscar")
    return await tmdb.search_movies(query.strip())


@admin_router.post("/movies/from-tmdb", response_model=schemas.MovieOut)
async def create_movie_from_tmdb(payload: schemas.MovieFromTMDB, db: Session = Depends(get_db)):
    file_path = _resolve_media_path(payload.filename)
    if not os.path.isfile(file_path):
        raise HTTPException(
            status_code=400,
            detail=f"Arquivo '{payload.filename}' nao encontrado em {MEDIA_MOVIES_DIR}.",
        )

    details = await tmdb.get_movie_details(payload.tmdb_id)

    movie = models.Movie(
        title=details["title"],
        synopsis=details["synopsis"],
        year=details["year"],
        genre=details["genre"],
        duration_minutes=details["duration_minutes"],
        director=details.get("director"),
        cast=details.get("cast"),
        filename=payload.filename,
        is_private=payload.is_private,
        collection_name=details.get("collection_name"),
        trailer_youtube_id=details.get("trailer_youtube_id"),
    )
    db.add(movie)
    db.commit()
    db.refresh(movie)

    poster_url = details.get("poster_url")
    if poster_url:
        try:
            image_bytes = await tmdb.download_poster(poster_url)
            thumb_name = f"movie_{movie.id}.jpg"
            with open(os.path.join(MEDIA_THUMBS_DIR, thumb_name), "wb") as f:
                f.write(image_bytes)
            movie.thumbnail_filename = thumb_name
        except Exception:
            pass

    backdrop_url = details.get("backdrop_url")
    if backdrop_url:
        try:
            image_bytes = await tmdb.download_poster(backdrop_url)
            backdrop_name = f"movie_{movie.id}_bg.jpg"
            with open(os.path.join(MEDIA_THUMBS_DIR, backdrop_name), "wb") as f:
                f.write(image_bytes)
            movie.backdrop_filename = backdrop_name
        except Exception:
            pass

    db.commit()
    db.refresh(movie)
    return movie


@admin_router.put("/movies/{movie_id}", response_model=schemas.MovieOut)
def update_movie(movie_id: int, payload: schemas.MovieUpdate, db: Session = Depends(get_db)):
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Filme nao encontrado")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(movie, field, value)
    db.commit()
    db.refresh(movie)
    return movie


@admin_router.patch("/movies/{movie_id}/toggle-privacy", response_model=schemas.MovieOut)
def toggle_privacy(movie_id: int, db: Session = Depends(get_db)):
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Filme nao encontrado")
    movie.is_private = not movie.is_private
    db.commit()
    db.refresh(movie)
    return movie


@admin_router.delete("/movies/{movie_id}")
def delete_movie(movie_id: int, db: Session = Depends(get_db)):
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Filme nao encontrado")
    db.delete(movie)
    db.commit()
    return {"ok": True}


@admin_router.post("/movies/{movie_id}/thumbnail", response_model=schemas.MovieOut)
def upload_thumbnail(movie_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Filme nao encontrado")

    ext = os.path.splitext(file.filename)[1].lower() or ".jpg"
    safe_name = f"movie_{movie_id}{ext}"
    dest = os.path.join(MEDIA_THUMBS_DIR, safe_name)
    with open(dest, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    movie.thumbnail_filename = safe_name
    db.commit()
    db.refresh(movie)
    return movie


@admin_router.post("/movies/{movie_id}/backdrop", response_model=schemas.MovieOut)
def upload_backdrop(movie_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Filme nao encontrado")

    ext = os.path.splitext(file.filename)[1].lower() or ".jpg"
    safe_name = f"movie_{movie_id}_bg{ext}"
    dest = os.path.join(MEDIA_THUMBS_DIR, safe_name)
    with open(dest, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    movie.backdrop_filename = safe_name
    db.commit()
    db.refresh(movie)
    return movie


@admin_router.post("/users", response_model=schemas.UserOut)
def create_user(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    from ..auth import hash_password

    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ja existe um usuario com este email")
    user = models.User(
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@admin_router.get("/users", response_model=list[schemas.UserOut])
def list_users(db: Session = Depends(get_db)):
    return db.query(models.User).order_by(models.User.created_at.desc()).all()


# ---------------------- Importação de Filmes Web e Lote ----------------------

@admin_router.post("/movies/from-url", response_model=schemas.MovieOut)
async def create_movie_from_url(
    payload: schemas.MovieFromUrlCreate,
    db: Session = Depends(get_db),
):
    """Cadastra um filme/episódio diretamente a partir de um link de vídeo externo ou Google Drive."""
    video_url = payload.video_url.strip()
    if not video_url or not (video_url.startswith("http://") or video_url.startswith("https://")):
        raise HTTPException(status_code=400, detail="Informe uma URL de vídeo válida (iniciando com http:// ou https://)")

    drive_id, drive_type = extract_drive_id_and_type(video_url)
    source_name = payload.source_name or "Link Web"
    title = payload.title
    year = payload.year

    if drive_id and drive_type == "file":
        video_url = f"https://drive.google.com/file/d/{drive_id}/preview"
        if source_name == "Link Web":
            source_name = "Google Drive"
        if not title:
            try:
                drive_info = await inspect_google_drive_url(video_url)
                if drive_info.get("files"):
                    f_item = drive_info["files"][0]
                    title = f_item["clean_title"]
                    year = year or f_item.get("year")
            except Exception:
                pass

    details = None
    if payload.tmdb_id:
        try:
            details = await tmdb.get_movie_details(payload.tmdb_id)
        except Exception:
            pass
    elif title and TMDB_API_KEY:
        try:
            candidates = await tmdb.search_movies(title)
            if candidates:
                chosen = candidates[0]
                if year:
                    for c in candidates:
                        if c.year and str(year) in c.year:
                            chosen = c
                            break
                details = await tmdb.get_movie_details(chosen.tmdb_id)
        except Exception:
            pass

    synopsis = payload.synopsis or ""
    genre = payload.genre
    director = payload.director
    cast = payload.cast
    duration_minutes = payload.duration_minutes
    poster_url = payload.poster_url
    backdrop_url = payload.backdrop_url
    collection_name = None
    trailer_id = payload.trailer_youtube_id

    if details:
        title = payload.title or details["title"]
        year = year or details["year"]
        synopsis = synopsis or details["synopsis"]
        genre = genre or details["genre"]
        director = director or details.get("director")
        cast = cast or details.get("cast")
        duration_minutes = duration_minutes or details.get("duration_minutes")
        poster_url = poster_url or details.get("poster_url")
        backdrop_url = backdrop_url or details.get("backdrop_url")
        collection_name = details.get("collection_name")
        trailer_id = trailer_id or details.get("trailer_youtube_id")

    if not title:
        url_path = video_url.split("?")[0].split("#")[0]
        url_filename = os.path.basename(url_path)
        clean_name, extracted_year = clean_filename_for_search(url_filename)
        title = clean_name.title() or "Filme Web"
        year = year or extracted_year

    movie = models.Movie(
        title=title,
        synopsis=synopsis,
        year=year,
        genre=genre,
        duration_minutes=duration_minutes,
        director=director,
        cast=cast,
        filename=video_url,
        video_url=video_url,
        is_external=True,
        source_name=source_name,
        is_private=payload.is_private,
        is_series=payload.is_series,
        series_title=payload.series_title,
        season_number=payload.season_number,
        episode_number=payload.episode_number,
        collection_name=collection_name,
        trailer_youtube_id=trailer_id,
        thumbnail_filename=poster_url,
        backdrop_filename=backdrop_url,
    )
    db.add(movie)
    db.commit()
    db.refresh(movie)

    if poster_url and poster_url.startswith("http") and os.path.isdir(MEDIA_THUMBS_DIR):
        try:
            image_bytes = await tmdb.download_poster(poster_url)
            thumb_name = f"movie_{movie.id}.jpg"
            with open(os.path.join(MEDIA_THUMBS_DIR, thumb_name), "wb") as f:
                f.write(image_bytes)
            movie.thumbnail_filename = thumb_name
            db.commit()
            db.refresh(movie)
        except Exception:
            pass

    if backdrop_url and backdrop_url.startswith("http") and os.path.isdir(MEDIA_THUMBS_DIR):
        try:
            image_bytes = await tmdb.download_poster(backdrop_url)
            bg_name = f"movie_{movie.id}_bg.jpg"
            with open(os.path.join(MEDIA_THUMBS_DIR, bg_name), "wb") as f:
                f.write(image_bytes)
            movie.backdrop_filename = bg_name
            db.commit()
            db.refresh(movie)
        except Exception:
            pass

    return movie


@admin_router.post("/movies/parse-m3u", response_model=schemas.ParseMovieM3UResponse)
async def parse_movie_m3u(payload: schemas.ParseMovieM3URequest):
    """Analisa uma lista M3U (URL ou arquivo) e extrai os títulos de filmes/VOD, categorias e links."""
    content = payload.content
    if payload.url and not content:
        url = payload.url.strip()
        try:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                resp = await client.get(url, headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                })
                resp.raise_for_status()
                content = resp.text
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Erro ao baixar lista M3U: {str(e)}")

    if not content:
        raise HTTPException(status_code=400, detail="Nenhum conteúdo ou link M3U fornecido")

    lines = content.splitlines()
    items: list[schemas.ParsedMovieItem] = []
    category_counts: dict[str, int] = {}
    current_meta: dict = {}

    for line in lines:
        line_str = line.strip()
        if not line_str:
            continue
        if line_str.startswith("#EXTINF:"):
            group_match = re.search(r'group-title="([^"]*)"', line_str, re.IGNORECASE)
            logo_match = re.search(r'tvg-logo="([^"]*)"', line_str, re.IGNORECASE)
            name_match = re.search(r',([^,]+)$', line_str)

            raw_cat = group_match.group(1).strip() if group_match else "Filmes"
            logo = logo_match.group(1).strip() if logo_match else None
            name = name_match.group(1).strip() if name_match else "Filme"

            current_meta = {
                "name": name,
                "category": raw_cat or "Filmes",
                "logo": logo,
            }
        elif not line_str.startswith("#") and current_meta:
            video_url = line_str
            raw_title = current_meta.get("name", "Filme")
            category = current_meta.get("category", "Filmes")
            logo = current_meta.get("logo")

            clean_name, year = clean_filename_for_search(raw_title)

            category_counts[category] = category_counts.get(category, 0) + 1
            items.append(schemas.ParsedMovieItem(
                title=raw_title,
                video_url=video_url,
                category=category,
                poster_url=logo,
                clean_title=clean_name,
                year=year,
            ))
            current_meta = {}

    sorted_cats = [
        schemas.CategoryWithCount(category=cat, count=cnt)
        for cat, cnt in sorted(category_counts.items(), key=lambda x: -x[1])
    ]

    return schemas.ParseMovieM3UResponse(
        total=len(items),
        categories=sorted_cats,
        items=items,
    )


GLOBAL_IMPORT_CANCELLED = False


@admin_router.post("/movies/abort-all-imports")
def abort_all_imports():
    """Trava e cancela imediatamente qualquer importação ativa no servidor."""
    global GLOBAL_IMPORT_CANCELLED
    GLOBAL_IMPORT_CANCELLED = True
    return {"ok": True, "message": "Todas as importações ativas foram canceladas no servidor."}


@admin_router.post("/movies/reset-import-lock")
def reset_import_lock():
    """Destrava o servidor para permitir novas importações."""
    global GLOBAL_IMPORT_CANCELLED
    GLOBAL_IMPORT_CANCELLED = False
    return {"ok": True, "message": "Importações liberadas."}


@admin_router.post("/movies/batch-import")
async def batch_import_movies(
    payload: schemas.BatchMovieImportRequest,
    db: Session = Depends(get_db),
):
    """Importa uma lista de filmes e séries em massa da internet com busca inteligente opcional no TMDB."""
    global GLOBAL_IMPORT_CANCELLED
    if GLOBAL_IMPORT_CANCELLED:
        raise HTTPException(status_code=400, detail="Importação cancelada pelo administrador.")

    items = payload.items
    if not items:
        raise HTTPException(status_code=400, detail="Nenhum item fornecido para importação")

    added = 0
    errors = 0
    results = []

    for item in items:
        video_url = item.video_url.strip()
        if not video_url:
            continue

        raw_title = item.title or os.path.basename(video_url.split("?")[0])
        clean_name, year = clean_filename_for_search(raw_title)

        synopsis = ""
        genre = item.category or "Geral"
        director = None
        cast = None
        duration_minutes = None
        poster_url = item.poster_url
        backdrop_url = None
        collection_name = None
        trailer_id = None
        movie_title = clean_name.title() or raw_title

        if payload.fetch_tmdb and TMDB_API_KEY:
            try:
                candidates = await tmdb.search_movies(clean_name)
                if candidates:
                    chosen = candidates[0]
                    if year:
                        for c in candidates:
                            if c.year and str(year) in c.year:
                                chosen = c
                                break
                    details = await tmdb.get_movie_details(chosen.tmdb_id)
                    movie_title = details.get("title") or movie_title
                    synopsis = details.get("synopsis") or ""
                    year = details.get("year") or year
                    genre = details.get("genre") or genre
                    director = details.get("director")
                    cast = details.get("cast")
                    duration_minutes = details.get("duration_minutes")
                    poster_url = details.get("poster_url") or poster_url
                    backdrop_url = details.get("backdrop_url")
                    collection_name = details.get("collection_name")
                    trailer_id = details.get("trailer_youtube_id")
            except Exception:
                pass

        try:
            movie = models.Movie(
                title=movie_title,
                synopsis=synopsis,
                year=year,
                genre=genre,
                duration_minutes=duration_minutes,
                director=director,
                cast=cast,
                filename=video_url,
                video_url=video_url,
                is_external=True,
                source_name=payload.source_name or "Importação Web",
                is_private=payload.is_private,
                collection_name=collection_name,
                trailer_youtube_id=trailer_id,
                thumbnail_filename=poster_url,
                backdrop_filename=backdrop_url,
            )
            db.add(movie)
            db.commit()
            db.refresh(movie)

            # Baixa poster localmente se possível
            if poster_url and poster_url.startswith("http") and os.path.isdir(MEDIA_THUMBS_DIR):
                try:
                    img_data = await tmdb.download_poster(poster_url)
                    thumb_name = f"movie_{movie.id}.jpg"
                    with open(os.path.join(MEDIA_THUMBS_DIR, thumb_name), "wb") as f:
                        f.write(img_data)
                    movie.thumbnail_filename = thumb_name
                    db.commit()
                except Exception:
                    pass

            added += 1
            results.append({"id": movie.id, "title": movie.title, "status": "added"})
        except Exception as e:
            errors += 1
            results.append({"url": video_url, "status": "error", "error": str(e)})

    return {
        "total": len(items),
        "added": added,
        "errors": errors,
        "results": results,
    }


@admin_router.post("/movies/bulk-delete")
def bulk_delete_movies(payload: schemas.BulkDeleteMoviesRequest, db: Session = Depends(get_db)):
    """Exclui múltiplos filmes selecionados por ID."""
    if not payload.movie_ids:
        return {"deleted": 0}
    deleted = db.query(models.Movie).filter(models.Movie.id.in_(payload.movie_ids)).delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}


@admin_router.post("/movies/delete-by-source")
def delete_movies_by_source(payload: schemas.DeleteMoviesBySourceRequest, db: Session = Depends(get_db)):
    """Exclui todos os filmes vinculados a uma fonte ou lista específica."""
    deleted = db.query(models.Movie).filter(models.Movie.source_name == payload.source_name).delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted, "source_name": payload.source_name}


@admin_router.post("/movies/clear-external")
def clear_all_external_movies(db: Session = Depends(get_db)):
    """Exclui todos os filmes e séries que foram importados via Web/links externos."""
    deleted = db.query(models.Movie).filter(models.Movie.is_external == True).delete(synchronize_session=False)  # noqa: E712
    db.commit()
    return {"deleted": deleted, "ok": True}


@router.get("/movies/sources")
def list_movie_sources(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Lista todas as fontes de filmes registradas com suas respectivas contagens."""
    from sqlalchemy import func
    results = (
        db.query(
            models.Movie.source_name,
            models.Movie.is_external,
            func.count(models.Movie.id).label("count")
        )
        .group_by(models.Movie.source_name, models.Movie.is_external)
        .all()
    )

    sources = []
    for r in results:
        name = r.source_name or ("Web / Link Externo" if r.is_external else "Servidor Local (Disco)")
        sources.append({
            "name": name,
            "is_external": bool(r.is_external),
            "count": r.count,
        })
    return sources


# ---------------------- Rotas de IA & Google Drive (SilvaFlix IA Search & Drive) ----------------------

@router.post("/ai/search-movie", response_model=schemas.AISearchResultResponse)
async def search_movie_with_ai(
    payload: schemas.AISearchRequest,
    current_user: models.User = Depends(get_current_user),
):
    """Busca inteligente de filmes e séries na web com IA (TMDB + candidatos + Google Drive + players PT-BR)."""
    if not payload.query or not payload.query.strip():
        raise HTTPException(status_code=400, detail="Digite o nome de um filme ou série para buscar.")
    return await ai_find_movie(
        query=payload.query,
        year=payload.year,
        tmdb_id=payload.tmdb_id,
        media_type=payload.media_type,
    )


@router.post("/ai/drive/inspect", response_model=schemas.GoogleDriveInspectResponse)
async def inspect_drive_link(
    payload: schemas.GoogleDriveInspectRequest,
    current_user: models.User = Depends(get_current_user),
):
    """Inspeciona um link de arquivo ou pasta pública do Google Drive e retorna todos os vídeos detectados."""
    return await inspect_google_drive_url(payload.url)


@router.post("/ai/drive/import", response_model=schemas.GoogleDriveImportResponse)
async def import_drive_link_or_folder(
    payload: schemas.GoogleDriveImportRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Importa diretamente um arquivo de vídeo do Google Drive ou TODOS os vídeos de uma pasta pública do Drive,
    buscando capas, sinopses e fichas técnicas automaticamente no TMDB!
    """
    inspected = await inspect_google_drive_url(payload.url)
    files = inspected.get("files", [])
    created_movies: list[models.Movie] = []

    for idx, f_item in enumerate(files):
        raw_title = payload.title if (payload.title and len(files) == 1) else f_item["clean_title"]
        year = f_item.get("year")
        series_info = parse_series_info(f_item["title"])

        details = None
        if payload.tmdb_id and len(files) == 1:
            try:
                details = await tmdb.get_movie_details(payload.tmdb_id)
            except Exception:
                pass
        elif payload.fetch_tmdb and TMDB_API_KEY and raw_title:
            try:
                candidates = await tmdb.search_movies(raw_title)
                if candidates:
                    chosen = candidates[0]
                    if year:
                        for c in candidates:
                            if c.year and str(year) in c.year:
                                chosen = c
                                break
                    details = await tmdb.get_movie_details(chosen.tmdb_id)
            except Exception:
                pass

        title_final = (details.get("title") if details else None) or raw_title or f_item["title"]
        if series_info.get("is_series") and details:
            title_final = f"{details['title']} - T{series_info['season_number']}E{series_info['episode_number']}"

        poster_url = details.get("poster_url") if details else None
        backdrop_url = details.get("backdrop_url") if details else None

        movie = models.Movie(
            title=title_final,
            synopsis=(details.get("synopsis") if details else "") or "",
            year=(details.get("year") if details else None) or year,
            genre=(details.get("genre") if details else None) or "Google Drive",
            duration_minutes=details.get("duration_minutes") if details else None,
            director=details.get("director") if details else None,
            cast=details.get("cast") if details else None,
            filename=f"gdrive_{f_item['file_id']}_{int(time.time())}_{idx}.mp4",
            video_url=f_item["preview_url"],
            is_external=True,
            source_name="Google Drive",
            thumbnail_filename=poster_url,
            backdrop_filename=backdrop_url,
            trailer_youtube_id=details.get("trailer_youtube_id") if details else None,
            collection_name=details.get("collection_name") if details else None,
            is_series=series_info.get("is_series", False),
            series_title=series_info.get("series_title"),
            season_number=series_info.get("season_number"),
            episode_number=series_info.get("episode_number"),
            is_private=payload.is_private if current_user.role == models.RoleEnum.admin else False,
        )
        db.add(movie)
        db.commit()
        db.refresh(movie)

        if poster_url and poster_url.startswith("http") and os.path.isdir(MEDIA_THUMBS_DIR):
            try:
                img_data = await tmdb.download_poster(poster_url)
                thumb_name = f"movie_{movie.id}.jpg"
                with open(os.path.join(MEDIA_THUMBS_DIR, thumb_name), "wb") as f:
                    f.write(img_data)
                movie.thumbnail_filename = thumb_name
                db.commit()
                db.refresh(movie)
            except Exception:
                pass

        created_movies.append(movie)

    return {
        "total_found": len(files),
        "added": len(created_movies),
        "movies": created_movies,
    }


@router.post("/ai/import-stream", response_model=schemas.MovieOut)
async def import_ai_stream(
    payload: schemas.AIImportStreamRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Salva no catálogo do SilvaFlix o filme ou série encontrado pela IA com 1 clique."""
    meta = payload.metadata
    player_url = payload.player_url.strip()
    drive_id, drive_type = extract_drive_id_and_type(player_url)
    if drive_id and drive_type == "file":
        player_url = f"https://drive.google.com/file/d/{drive_id}/preview"

    movie = models.Movie(
        title=meta.title,
        synopsis=meta.synopsis or "",
        year=meta.year,
        genre=meta.genre or "Geral",
        duration_minutes=meta.duration_minutes,
        director=meta.director,
        cast=meta.cast,
        filename=f"ai_{meta.tmdb_id}_{int(time.time())}.mp4",
        video_url=player_url,
        is_external=True,
        source_name="Google Drive" if "drive.google.com" in player_url else f"SilvaFlix IA ({payload.provider_name})",
        thumbnail_filename=meta.poster_url,
        backdrop_filename=meta.backdrop_url,
        trailer_youtube_id=meta.trailer_youtube_id,
        collection_name=meta.collection_name,
        is_series=meta.is_series,
        season_number=meta.season_number,
        episode_number=meta.episode_number,
        is_private=payload.is_private if current_user.role == models.RoleEnum.admin else False,
    )
    db.add(movie)
    db.commit()
    db.refresh(movie)

    # Tenta salvar poster localmente em disco se a pasta existir
    if meta.poster_url and meta.poster_url.startswith("http") and os.path.isdir(MEDIA_THUMBS_DIR):
        try:
            img_data = await tmdb.download_poster(meta.poster_url)
            thumb_name = f"movie_{movie.id}.jpg"
            with open(os.path.join(MEDIA_THUMBS_DIR, thumb_name), "wb") as f:
                f.write(img_data)
            movie.thumbnail_filename = thumb_name
            db.commit()
            db.refresh(movie)
        except Exception:
            pass

    return movie


# ---------------------- Rotas de Torrents & Stremio Engine (Pillar 1) ----------------------

@router.get("/torrents/search", response_model=schemas.TorrentSearchResponse)
async def search_movie_torrents(
    q: str,
    year: Optional[int] = None,
    current_user: models.User = Depends(get_current_user),
):
    """Pesquisa torrents e magnet links diretamente para o título, priorizando Dublados PT-BR."""
    if not q or not q.strip():
        raise HTTPException(status_code=400, detail="Informe um termo para buscar torrents.")
    return await search_torrents_for_media(query=q.strip(), year=year)


@router.post("/torrents/resolve", response_model=schemas.TorrentResolveResponse)
async def resolve_torrent_stream(
    payload: schemas.TorrentResolveRequest,
    current_user: models.User = Depends(get_current_user),
):
    """Resolve um Magnet Link em link direto de alta velocidade via Debrid ou gateway."""
    direct_link = await resolve_debrid_link(magnet=payload.magnet, api_key=payload.debrid_token)
    if direct_link:
        return schemas.TorrentResolveResponse(
            stream_url=direct_link,
            player_type="direct",
            title="Stream Direto (Debrid 1Gbps)",
        )

    # Se não houver token Debrid, retorna o magnet link formatado para clientes locais/VLC/WebTorrent
    return schemas.TorrentResolveResponse(
        stream_url=payload.magnet,
        player_type="magnet",
        title="Magnet Link (P2P)",
    )


# ---------------------- Rotas de Gerenciador de Downloads (Pillar 2) ----------------------

@admin_router.post("/downloads/start", response_model=schemas.DownloadTaskOut)
async def start_movie_download(
    payload: schemas.DownloadStartRequest,
    db: Session = Depends(get_db),
):
    """Inicia o download de qualquer vídeo (YouTube, Drive, MP4, m3u8, etc.) em segundo plano."""
    if not payload.url or not payload.url.strip():
        raise HTTPException(status_code=400, detail="Informe a URL do vídeo para download.")
    task = await start_background_download(
        url=payload.url.strip(),
        title=payload.title,
        tmdb_id=payload.tmdb_id,
        is_private=payload.is_private,
    )
    return task.to_dict()


@admin_router.get("/downloads/active", response_model=list[schemas.DownloadTaskOut])
def get_active_downloads():
    """Lista todos os downloads ativos e recentes com progresso em tempo real."""
    return list_active_downloads()


@admin_router.post("/downloads/cancel/{task_id}")
def cancel_movie_download(task_id: str):
    """Cancela um download em andamento."""
    success = cancel_download(task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Tarefa de download não encontrada.")
    return {"ok": True, "message": f"Download {task_id} cancelado."}


# ---------------------- Rota de Importação VOD Inteligente (Pillar 3) ----------------------

@admin_router.post("/movies/smart-vod-import", response_model=schemas.SmartVODImportResponse)
async def smart_vod_import(
    payload: schemas.SmartVODImportRequest,
    db: Session = Depends(get_db),
):
    """Importa lista VOD com verificação assíncrona de links vivos e separação inteligente de séries e filmes."""
    raw_items = [it.model_dump() for it in payload.items]
    return await scan_and_import_smart_vod(
        items=raw_items,
        source_name=payload.source_name or "Importação VOD Inteligente",
        auto_categorize=payload.auto_categorize_series,
        verify_live=payload.verify_live_streams,
        is_private=payload.is_private,
        db=db,
    )


# ---------------------- Rotas para Puxar Filmes e Pastas do Próprio PC ----------------------

@admin_router.get("/pc/drives")
def list_pc_drives_and_folders():
    """Lista os discos rígidos/pendrives conectados ao PC (C:, D:, E:, etc.) e pastas comuns do usuário."""
    drives = []
    for letter in "CDEFGHIJKLMNOPQRSTUVWXYZ":
        drv = f"{letter}:\\"
        if os.path.isdir(drv):
            drives.append({"label": f"Disco Local ({letter}:)", "path": drv, "type": "drive"})

    user_home = os.path.expanduser("~")
    common_folders = [
        ("Vídeos do PC", os.path.join(user_home, "Videos")),
        ("Downloads", os.path.join(user_home, "Downloads")),
        ("Área de Trabalho", os.path.join(user_home, "Desktop")),
        ("Documentos", os.path.join(user_home, "Documents")),
    ]
    for label, folder_path in common_folders:
        if os.path.isdir(folder_path):
            drives.append({"label": label, "path": folder_path, "type": "folder"})

    return {
        "current_media_dir": MEDIA_MOVIES_DIR,
        "locations": drives,
    }


@admin_router.post("/pc/browse-dialog")
def open_pc_native_dialog(payload: schemas.PCBrowseRequest):
    """Abre a janela nativa do Windows Explorer no servidor local para escolher um arquivo de vídeo ou pasta."""
    try:
        if payload.mode == "folder":
            ps_script = (
                "Add-Type -AssemblyName System.Windows.Forms; "
                "$f = New-Object System.Windows.Forms.FolderBrowserDialog; "
                "$f.Description = 'Selecione a pasta ou HD com seus filmes'; "
                "$f.ShowNewFolderButton = $false; "
                "if ($f.ShowDialog() -eq 'OK') { Write-Output $f.SelectedPath }"
            )
        else:
            ps_script = (
                "Add-Type -AssemblyName System.Windows.Forms; "
                "$f = New-Object System.Windows.Forms.OpenFileDialog; "
                "$f.Title = 'Selecione um ou mais arquivos de filme no PC'; "
                "$f.Filter = 'Arquivos de Vídeo (*.mp4;*.mkv;*.avi;*.webm;*.mov;*.m4v)|*.mp4;*.mkv;*.avi;*.webm;*.mov;*.m4v|Todos os arquivos (*.*)|*.*'; "
                "$f.Multiselect = $true; "
                "if ($f.ShowDialog() -eq 'OK') { $f.FileNames -join '|' }"
            )
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-Sta", "-Command", ps_script],
            capture_output=True,
            text=True,
            timeout=120,
        )
        out = (proc.stdout or "").strip()
        if not out:
            return {"selected": [], "cancelled": True}
        paths = [p.strip() for p in out.split("|") if p.strip()]
        return {"selected": paths, "cancelled": False}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Não foi possível abrir o seletor do Windows: {str(e)}")


@admin_router.post("/pc/scan-path")
async def scan_custom_pc_path(
    payload: schemas.PCScanPathRequest,
    db: Session = Depends(get_db),
):
    """Importa um arquivo de vídeo específico ou varre qualquer pasta/HD do PC (ex: D:\\) sem precisar copiar arquivos."""
    raw_paths = [p.strip().strip('"') for p in payload.path.split("|") if p.strip()]
    if not raw_paths:
        raise HTTPException(status_code=400, detail="Informe o caminho de uma pasta ou arquivo do PC.")

    already_registered = set()
    for (fname,) in db.query(models.Movie.filename).all():
        if fname:
            already_registered.add(fname)
            already_registered.add(fname.replace("\\", "/"))
            already_registered.add(os.path.normpath(fname))

    video_files_to_add = []
    primary_abs = os.path.abspath(MEDIA_MOVIES_DIR) if os.path.isdir(MEDIA_MOVIES_DIR) else None

    for target in raw_paths:
        norm_target = os.path.abspath(os.path.normpath(target))
        if os.path.isfile(norm_target):
            ext = os.path.splitext(norm_target)[1].lower()
            if ext not in VIDEO_EXTENSIONS and ext not in (".ts", ".wmv", ".flv"):
                raise HTTPException(status_code=400, detail=f"O arquivo '{os.path.basename(norm_target)}' não é um formato de vídeo suportado.")
            video_files_to_add.append(norm_target)
        elif os.path.isdir(norm_target):
            for root, dirs, filenames in os.walk(norm_target):
                dirs[:] = [
                    d for d in dirs
                    if not d.startswith(".")
                    and d not in ("$RECYCLE.BIN", "System Volume Information", "Windows", "Program Files", "Program Files (x86)", "AppData", "node_modules", "venv")
                ]
                for name in filenames:
                    if os.path.splitext(name)[1].lower() in VIDEO_EXTENSIONS:
                        video_files_to_add.append(os.path.abspath(os.path.join(root, name)))
        else:
            raise HTTPException(status_code=404, detail=f"Caminho não encontrado no PC: '{target}'")

    results = []
    added_count = 0
    skipped_count = 0

    for full_path in video_files_to_add:
        try:
            if primary_abs and os.path.commonpath([primary_abs, full_path]) == primary_abs:
                stored_path = os.path.relpath(full_path, primary_abs).replace(os.sep, "/")
            else:
                stored_path = full_path.replace(os.sep, "/")
        except Exception:
            stored_path = full_path.replace(os.sep, "/")

        if (
            stored_path in already_registered
            or full_path in already_registered
            or full_path.replace(os.sep, "/") in already_registered
        ):
            skipped_count += 1
            results.append({"filename": stored_path, "title": os.path.basename(full_path), "status": "already_exists"})
            continue

        try:
            drive_label = os.path.splitdrive(full_path)[0] or "PC"
            res_item = await _register_local_video_file(
                stored_path,
                db=db,
                source_name=f"Disco Local ({drive_label})",
                is_private=payload.is_private,
            )
            already_registered.add(stored_path)
            already_registered.add(full_path)
            added_count += 1
            results.append(res_item)
        except Exception as e:
            skipped_count += 1
            results.append({"filename": stored_path, "status": "error", "error": str(e)})

    return {
        "scanned": len(video_files_to_add),
        "added": added_count,
        "skipped": skipped_count,
        "results": results,
    }


@admin_router.post("/pc/upload-file")
async def upload_pc_video_file(
    file: UploadFile = File(...),
    is_private: bool = Form(False),
    db: Session = Depends(get_db),
):
    """Recebe o upload direto de um arquivo de vídeo do PC/celular pelo navegador e cadastra com TMDB."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Arquivo inválido.")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in VIDEO_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Formato '{ext}' não suportado. Use MP4, MKV, AVI, WEBM ou MOV.")

    target_dir = MEDIA_MOVIES_DIR if os.path.isdir(MEDIA_MOVIES_DIR) else os.path.join(os.path.dirname(os.path.dirname(__file__)), "media", "movies")
    os.makedirs(target_dir, exist_ok=True)

    safe_filename = os.path.basename(file.filename)
    dest_path = os.path.join(target_dir, safe_filename)
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer, length=1024 * 1024)

    primary_abs = os.path.abspath(MEDIA_MOVIES_DIR) if os.path.isdir(MEDIA_MOVIES_DIR) else None
    full_abs = os.path.abspath(dest_path)
    try:
        if primary_abs and os.path.commonpath([primary_abs, full_abs]) == primary_abs:
            stored_path = os.path.relpath(full_abs, primary_abs).replace(os.sep, "/")
        else:
            stored_path = full_abs.replace(os.sep, "/")
    except Exception:
        stored_path = full_abs.replace(os.sep, "/")

    res_item = await _register_local_video_file(
        stored_path,
        db=db,
        source_name="Upload do PC",
        is_private=is_private,
    )
    return res_item



