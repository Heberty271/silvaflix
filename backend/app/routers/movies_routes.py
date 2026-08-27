import os
import re
import shutil
import subprocess
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request, Response
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.orm import Session

from .. import models, schemas, tmdb
from ..auth import get_current_user, require_admin
from ..config import MEDIA_MOVIES_DIR, MEDIA_THUMBS_DIR
from ..database import get_db
from ..audio_utils import probe_audio_tracks, get_ffmpeg_binary

router = APIRouter(tags=["movies"])

CHUNK_SIZE = 1024 * 1024  # 1 MB por pedaco
VIDEO_EXTENSIONS = {".mp4", ".mkv", ".webm", ".mov", ".avi", ".m4v"}


def _resolve_media_path(filename: str) -> str:
    """Junta o nome/caminho relativo do arquivo com a pasta de midia configurada
    e garante que o resultado continua DENTRO dessa pasta."""
    base = os.path.abspath(MEDIA_MOVIES_DIR)
    candidate = os.path.abspath(os.path.join(base, filename))
    if os.path.commonpath([base, candidate]) != base:
        raise HTTPException(status_code=400, detail="Caminho de arquivo invalido")
    return candidate


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
        series_clean = re.sub(r"[\._\-]", " ", series_name).strip()
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
        series_clean = re.sub(r"[\._\-]", " ", series_name).strip()
        return {
            "is_series": True,
            "series_title": series_clean or basename,
            "season_number": season,
            "episode_number": episode,
        }

    return {"is_series": False}


def clean_filename_for_search(filename: str) -> tuple[str, Optional[int]]:
    """Extrai título limpo e ano de um arquivo de vídeo para consulta no TMDB."""
    basename = os.path.splitext(os.path.basename(filename))[0]

    year_match = re.search(r"\b(19\d\d|20\d\d)\b", basename)
    year = int(year_match.group(1)) if year_match else None

    if year_match:
        title_part = basename[: year_match.start()]
    else:
        title_part = basename

    tags = [
        r"1080p", r"720p", r"480p", r"2160p", r"4k", r"bluray", r"bdrip", r"dvdrip",
        r"web-dl", r"webrip", r"h\.?264", r"x\.?264", r"h\.?265", r"x\.?265", r"hevc",
        r"dual", r"dublado", r"legendado", r"aac", r"ac3", r"dts", r"yify", r"yts",
        r"rarbg", r"imax", r"s\d{1,2}e\d{1,3}", r"\d{1,2}x\d{1,3}"
    ]
    for tag in tags:
        title_part = re.sub(tag, "", title_part, flags=re.IGNORECASE)

    title_clean = re.sub(r"[\._\-]", " ", title_part)
    title_clean = re.sub(r"\s+", " ", title_clean).strip()
    return title_clean or basename, year


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
    return movie


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
    file_path = _resolve_media_path(movie.filename)
    return probe_audio_tracks(file_path)


@router.get("/movies/{movie_id}/thumbnail")
def get_thumbnail(movie_id: int, db: Session = Depends(get_db)):
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie or not movie.thumbnail_filename:
        raise HTTPException(status_code=404, detail="Capa nao encontrada")
    path = os.path.join(MEDIA_THUMBS_DIR, movie.thumbnail_filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Arquivo de capa ausente no disco")
    return FileResponse(path)


@router.get("/movies/{movie_id}/backdrop")
def get_backdrop(movie_id: int, db: Session = Depends(get_db)):
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie or not movie.backdrop_filename:
        raise HTTPException(status_code=404, detail="Imagem de fundo nao encontrada")
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

    movie_path = _resolve_media_path(movie.filename)
    base_no_ext = os.path.splitext(movie_path)[0]

    candidates = [
        base_no_ext + ".vtt",
        base_no_ext + ".srt",
        base_no_ext + ".pt-BR.vtt",
        base_no_ext + ".pt-BR.srt",
        base_no_ext + ".pt.vtt",
        base_no_ext + ".pt.srt",
    ]

    for sub_path in candidates:
        if os.path.isfile(sub_path):
            ext = os.path.splitext(sub_path)[1].lower()
            try:
                with open(sub_path, "r", encoding="utf-8-sig", errors="replace") as f:
                    text = f.read()
                if ext == ".srt":
                    text = srt_to_vtt(text)
                return Response(content=text, media_type="text/vtt")
            except Exception:
                pass

    raise HTTPException(status_code=404, detail="Nenhuma legenda encontrada para este filme")


RANGE_RE = re.compile(r"bytes=(\d+)-(\d*)")


@router.get("/movies/{movie_id}/stream")
def stream_movie(
    movie_id: int,
    request: Request,
    audio_track: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Envia o video em pedacos (HTTP Range Requests) ou remuxa em tempo real a faixa de audio selecionada."""
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Filme nao encontrado")
    if movie.is_private and current_user.role != models.RoleEnum.admin:
        raise HTTPException(status_code=403, detail="Este conteudo e privado")

    file_path = _resolve_media_path(movie.filename)
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Arquivo de video ausente no disco")

    # Se o usuário escolheu uma faixa de áudio específica (> 0), fazemos o remuxing com FFmpeg em tempo real
    if audio_track is not None and audio_track > 0:
        ffmpeg_bin = get_ffmpeg_binary()
        cmd = [
            ffmpeg_bin,
            "-hide_banner",
            "-i", file_path,
            "-map", "0:v:0",
            "-map", f"0:a:{audio_track}",
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "192k",
            "-f", "mp4",
            "-movflags", "frag_keyframe+empty_moov+default_base_moof",
            "pipe:1",
        ]
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=CHUNK_SIZE)

        def iter_ffmpeg():
            try:
                while chunk := process.stdout.read(CHUNK_SIZE):
                    yield chunk
            finally:
                process.terminate()
                process.wait()

        return StreamingResponse(iter_ffmpeg(), media_type="video/mp4")

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
    """Varre a pasta de midia e lista os arquivos de video que ainda nao foram cadastrados."""
    if not os.path.isdir(MEDIA_MOVIES_DIR):
        return []

    already_registered = {
        m.filename for m in db.query(models.Movie.filename).all()
    }

    found = []
    for root, dirs, filenames in os.walk(MEDIA_MOVIES_DIR):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d != "$RECYCLE.BIN"]
        for name in filenames:
            if os.path.splitext(name)[1].lower() not in VIDEO_EXTENSIONS:
                continue
            rel_path = os.path.relpath(os.path.join(root, name), MEDIA_MOVIES_DIR)
            rel_path = rel_path.replace(os.sep, "/")
            if rel_path not in already_registered:
                found.append(rel_path)

    return sorted(found)


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
        clean_title, file_year = clean_filename_for_search(rel_path)
        series_info = parse_series_info(rel_path)

        try:
            candidates = []
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
                    filename=rel_path,
                    is_private=False,
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

                # Download do Poster
                if details.get("poster_url"):
                    try:
                        img = await tmdb.download_poster(details["poster_url"])
                        thumb_name = f"movie_{movie.id}.jpg"
                        with open(os.path.join(MEDIA_THUMBS_DIR, thumb_name), "wb") as f:
                            f.write(img)
                        movie.thumbnail_filename = thumb_name
                    except Exception:
                        pass

                # Download do Backdrop
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
                added_count += 1
                results.append({"filename": rel_path, "title": movie.title, "status": "added", "movie_id": movie.id})
            else:
                title_final = clean_title.title()
                if series_info.get("is_series"):
                    title_final = f"{series_info['series_title']} - T{series_info['season_number']}E{series_info['episode_number']}"

                movie = models.Movie(
                    title=title_final,
                    filename=rel_path,
                    year=file_year,
                    is_private=False,
                    is_series=series_info.get("is_series", False),
                    series_title=series_info.get("series_title"),
                    season_number=series_info.get("season_number"),
                    episode_number=series_info.get("episode_number"),
                )
                db.add(movie)
                db.commit()
                db.refresh(movie)
                added_count += 1
                results.append({"filename": rel_path, "title": movie.title, "status": "added_without_tmdb", "movie_id": movie.id})
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
