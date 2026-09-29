"""
Verificador Inteligente de Streams VOD & Separador Automático de Séries vs Filmes
- Valida centenas de links de vídeo de forma assíncrona e ultrarrápida.
- Descarta links mortos, 404, timeouts ou bloqueados.
- Classifica perfeitamente Séries (Temporada/Episódio) e Filmes sem intervenção manual.
"""
import asyncio
import re
from typing import List, Dict, Any, Tuple
from datetime import datetime

import httpx
from sqlalchemy.orm import Session

from .models import Movie


def extract_series_and_movie_info(title: str, category: str = "") -> Dict[str, Any]:
    """
    Analisa o título e a categoria para determinar se é Série ou Filme,
    extraindo nome da série, temporada, episódio e título limpo.
    """
    clean_title = title.strip()
    is_series = False
    season_num = None
    episode_num = None
    series_name = None
    episode_title = None

    # Verifica se a categoria indica série
    cat_lower = (category or "").lower()
    cat_is_series = any(k in cat_lower for k in [
        "serie", "série", "temporada", "season", "novela", "anime", "desenho", "doramas"
    ])

    # 1. Padrão S01E02 ou S1E2
    match_se = re.search(r"\bS(\d{1,2})[\s\._-]*E(\d{1,3})\b", clean_title, re.IGNORECASE)
    if match_se:
        is_series = True
        season_num = int(match_se.group(1))
        episode_num = int(match_se.group(2))
        series_name = clean_title[:match_se.start()].strip(" -_.")
        episode_title = clean_title[match_se.end():].strip(" -_.")

    # 2. Padrão 1x05 ou 01x02
    if not is_series:
        match_nxn = re.search(r"\b(\d{1,2})x(\d{1,3})\b", clean_title, re.IGNORECASE)
        if match_nxn:
            is_series = True
            season_num = int(match_nxn.group(1))
            episode_num = int(match_nxn.group(2))
            series_name = clean_title[:match_nxn.start()].strip(" -_.")
            episode_title = clean_title[match_nxn.end():].strip(" -_.")

    # 3. Padrão "T01 E02" ou "Temp 1 Ep 2"
    if not is_series:
        match_temp = re.search(r"\b(?:Temp|Temporada|T)[\s\._-]*(\d{1,2})[\s\._-]*(?:Ep|Episodio|E)[\s\._-]*(\d{1,3})\b", clean_title, re.IGNORECASE)
        if match_temp:
            is_series = True
            season_num = int(match_temp.group(1))
            episode_num = int(match_temp.group(2))
            series_name = clean_title[:match_temp.start()].strip(" -_.")
            episode_title = clean_title[match_temp.end():].strip(" -_.")

    # Se a categoria é série mas não tem SxxExx, assume T1 E1
    if not is_series and cat_is_series:
        is_series = True
        series_name = clean_title
        season_num = 1
        episode_num = 1

    # Extrai Ano do título (ex: 2024, 2021)
    year = None
    y_match = re.search(r"\b(19\d\d|20\d\d)\b", clean_title)
    if y_match:
        year = int(y_match.group(1))

    # Limpa o título final
    clean_display = series_name or clean_title
    clean_display = re.sub(r"[\[\(].*?[\]\)]", "", clean_display)
    clean_display = re.sub(r"\b(4k|1080p|720p|fhd|hd|dublado|dual|legendado|pt-br|x264|x265|hevc|web-dl)\b", "", clean_display, flags=re.IGNORECASE)
    clean_display = re.sub(r"\s+", " ", clean_display).strip(" -_.")

    return {
        "title": clean_title,
        "clean_title": clean_display or clean_title,
        "is_series": is_series,
        "series_title": series_name or (clean_display if is_series else None),
        "season_number": season_num,
        "episode_number": episode_num,
        "episode_title": episode_title or (f"Episódio {episode_num}" if is_series and episode_num else None),
        "year": year,
    }


async def test_single_stream(url: str, client: httpx.AsyncClient) -> bool:
    """Verifica rapidamente se um link de vídeo responde com sucesso."""
    if not url or not url.startswith("http"):
        return False
    try:
        # Envia HEAD com timeout curto de 2.5s
        resp = await client.head(url, timeout=2.5, follow_redirects=True)
        if resp.status_code in (200, 206, 301, 302, 307, 308):
            return True
        # Se HEAD falhar, tenta GET de 1 byte
        resp_get = await client.get(url, headers={"Range": "bytes=0-1"}, timeout=2.5, follow_redirects=True)
        return resp_get.status_code in (200, 206, 301, 302, 307, 308)
    except Exception:
        return False


async def scan_and_import_smart_vod(
    items: List[Dict[str, Any]],
    source_name: str,
    auto_categorize: bool,
    verify_live: bool,
    is_private: bool,
    db: Session,
) -> Dict[str, Any]:
    """
    Testa e importa lote de VODs garantindo que apenas streams que funcionam entrem no catálogo.
    """
    total_submitted = len(items)
    verified_items = []
    dead_count = 0

    if verify_live:
        semaphore = asyncio.Semaphore(30)

        async def check_item(item: Dict[str, Any]):
            nonlocal dead_count
            url = item.get("video_url", "")
            async with semaphore:
                async with httpx.AsyncClient(timeout=3.0, follow_redirects=True) as client:
                    is_alive = await test_single_stream(url, client)
                    if is_alive:
                        verified_items.append(item)
                    else:
                        dead_count += 1

        tasks = [check_item(it) for it in items]
        await asyncio.gather(*tasks, return_exceptions=True)
    else:
        verified_items = items

    movies_added = 0
    series_episodes_added = 0
    results_list = []

    # Salva no Banco de Dados
    for item in verified_items:
        raw_title = item.get("title", "Filme")
        video_url = item.get("video_url", "")
        category = item.get("category", "")
        poster_url = item.get("poster_url")

        info = extract_series_and_movie_info(raw_title, category) if auto_categorize else {
            "title": raw_title,
            "clean_title": raw_title,
            "is_series": item.get("is_series", False),
            "series_title": item.get("series_title"),
            "season_number": item.get("season_number"),
            "episode_number": item.get("episode_number"),
            "episode_title": item.get("episode_title"),
            "year": None,
        }

        # Verifica se já existe filme/episódio idêntico
        existing = db.query(Movie).filter(Movie.video_url == video_url).first()
        if existing:
            continue

        movie_entry = Movie(
            title=info["clean_title"],
            synopsis=f"Adicionado via {source_name}. Categoria: {category or 'Geral'}",
            year=info.get("year"),
            genre=category or "Geral",
            filename=info["clean_title"],
            thumbnail_filename=poster_url,
            backdrop_filename=poster_url,
            is_private=is_private,
            is_featured=False,
            is_series=info["is_series"],
            series_title=info.get("series_title"),
            season_number=info.get("season_number"),
            episode_number=info.get("episode_number"),
            episode_title=info.get("episode_title"),
            video_url=video_url,
            is_external=True,
            source_name=source_name,
        )

        db.add(movie_entry)
        if info["is_series"]:
            series_episodes_added += 1
        else:
            movies_added += 1

        results_list.append({
            "title": info["clean_title"],
            "url": video_url,
            "is_series": info["is_series"],
            "status": "adicionado",
        })

    db.commit()

    return {
        "total_submitted": total_submitted,
        "verified_working": len(verified_items),
        "dead_discarded": dead_count,
        "movies_added": movies_added,
        "series_episodes_added": series_episodes_added,
        "results": results_list,
    }
