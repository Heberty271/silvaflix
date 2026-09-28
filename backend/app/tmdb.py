"""
Integracao com a API do TMDB (The Movie Database) - https://www.themoviedb.org/
"""
import re
from typing import Optional

import httpx
from fastapi import HTTPException

from .config import TMDB_API_KEY, TMDB_API_BASE, TMDB_IMAGE_BASE, TMDB_LANGUAGE
from .schemas import TMDBSearchResult


def _require_api_key():
    if not TMDB_API_KEY:
        raise HTTPException(
            status_code=400,
            detail=(
                "Nenhuma chave do TMDB configurada. Crie uma gratis em "
                "themoviedb.org (Configuracoes > API) e coloque em "
                "TMDB_API_KEY no arquivo .env do backend."
            ),
        )


def _poster_url(poster_path: Optional[str]) -> Optional[str]:
    return f"{TMDB_IMAGE_BASE}{poster_path}" if poster_path else None


TMDB_BACKDROP_BASE = "https://image.tmdb.org/t/p/w1280"


def _backdrop_url(backdrop_path: Optional[str]) -> Optional[str]:
    return f"{TMDB_BACKDROP_BASE}{backdrop_path}" if backdrop_path else None


async def search_movies(query: str) -> list[TMDBSearchResult]:
    """Busca varios candidatos por titulo, para o admin escolher o certo."""
    _require_api_key()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{TMDB_API_BASE}/search/movie",
                params={
                    "api_key": TMDB_API_KEY,
                    "query": query,
                    "language": TMDB_LANGUAGE,
                    "include_adult": "false",
                },
            )
    except httpx.RequestError:
        raise HTTPException(
            status_code=503,
            detail="Nao foi possivel conectar ao TMDB. Confira sua internet e tente de novo.",
        )
    if resp.status_code in (401, 403):
        raise HTTPException(
            status_code=400,
            detail="Chave do TMDB invalida. Confira o valor de TMDB_API_KEY no .env.",
        )
    resp.raise_for_status()
    data = resp.json()

    results = []
    for item in data.get("results", []):
        release_date = item.get("release_date") or ""
        year_match = re.match(r"(\d{4})", release_date)
        results.append(
            TMDBSearchResult(
                tmdb_id=item["id"],
                title=item.get("title") or item.get("original_title") or "",
                year=year_match.group(1) if year_match else None,
                poster_url=_poster_url(item.get("poster_path")),
                overview=item.get("overview") or "",
            )
        )
    return results


async def get_movie_details(tmdb_id: int) -> dict:
    """Busca detalhes completos, coleções e trailers do TMDB."""
    _require_api_key()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{TMDB_API_BASE}/movie/{tmdb_id}",
                params={
                    "api_key": TMDB_API_KEY,
                    "language": TMDB_LANGUAGE,
                    "append_to_response": "credits,videos",
                },
            )
    except httpx.RequestError:
        raise HTTPException(
            status_code=503,
            detail="Nao foi possivel conectar ao TMDB. Confira sua internet e tente de novo.",
        )
    if resp.status_code in (401, 403):
        raise HTTPException(
            status_code=400,
            detail="Chave do TMDB invalida. Confira o valor de TMDB_API_KEY no .env.",
        )
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="Filme nao encontrado no TMDB")
    resp.raise_for_status()
    data = resp.json()

    release_date = data.get("release_date") or ""
    year_match = re.match(r"(\d{4})", release_date)
    genres = [g["name"] for g in data.get("genres", [])]

    # Coleção / Franquia
    collection = data.get("belongs_to_collection")
    collection_name = collection.get("name") if collection else None

    # Trailer YouTube
    videos = data.get("videos", {}).get("results", [])
    trailer_key = None
    for v in videos:
        if v.get("site") == "YouTube" and v.get("type") in ("Trailer", "Teaser"):
            trailer_key = v.get("key")
            break

    credits = data.get("credits", {})
    director = next(
        (c["name"] for c in credits.get("crew", []) if c.get("job") == "Director"),
        None,
    )
    cast_names = [c["name"] for c in credits.get("cast", [])[:5]]

    return {
        "title": data.get("title") or data.get("original_title") or "",
        "synopsis": data.get("overview") or "",
        "year": int(year_match.group(1)) if year_match else None,
        "genre": ", ".join(genres) if genres else None,
        "duration_minutes": data.get("runtime") or None,
        "director": director,
        "cast": ", ".join(cast_names) if cast_names else None,
        "poster_url": _poster_url(data.get("poster_path")),
        "backdrop_url": _backdrop_url(data.get("backdrop_path")),
        "collection_name": collection_name,
        "trailer_youtube_id": trailer_key,
    }


async def find_trailer_for_movie(title: str, year: Optional[int] = None) -> Optional[str]:
    """Busca no TMDB e retorna o YouTube ID do trailer oficial do filme."""
    if not TMDB_API_KEY:
        return None
    try:
        results = await search_movies(title)
        if not results:
            return None
        # Pega o primeiro ou o que bate com o ano
        best = results[0]
        if year:
            for r in results:
                if r.year and str(year) in r.year:
                    best = r
                    break
        details = await get_movie_details(best.tmdb_id)
        return details.get("trailer_youtube_id")
    except Exception:
        return None


async def download_poster(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content

