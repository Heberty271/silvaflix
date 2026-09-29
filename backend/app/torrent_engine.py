"""
Mecanismo de Busca e Streaming de Torrents para SilvaFlix (Stremio Engine)
- Pesquisa torrents e magnet links diretamente por filmes e séries com metadados TMDB/IMDb.
- Prioriza versões DUBLADAS EM PORTUGUÊS (PT-BR) e Dual Áudio em 1080p / 4K.
- Suporta resolução instantânea via Real-Debrid / AllDebrid / TorBox ou gateways de streaming.
"""
import re
import urllib.parse
from typing import Optional, List, Dict, Any

import httpx

from .ai_finder import search_canonical_tmdb

DEFAULT_TRACKERS = [
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.demonii.com:1337/announce",
    "udp://tracker.openbittorrent.com:6969/announce",
    "udp://tracker.coppersurfer.tk:6969/announce",
    "udp://glotorrents.pw:6969/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://explodie.org:6969/announce",
    "udp://9.rarbg.to:2710/announce",
    "udp://p4p.arenabg.com:1337/announce",
]


def make_magnet(info_hash: str, display_name: str) -> str:
    """Gera um Magnet Link completo e padronizado com múltiplos trackers confiáveis."""
    clean_hash = info_hash.strip().lower()
    dn = urllib.parse.quote(display_name or "stream")
    trackers_str = "&".join(f"tr={urllib.parse.quote(t)}" for t in DEFAULT_TRACKERS)
    return f"magnet:?xt=urn:btih:{clean_hash}&dn={dn}&{trackers_str}"


def parse_torrentio_stream(stream: Dict[str, Any], default_title: str) -> Optional[Dict[str, Any]]:
    """Converte um objeto do Torrentio em uma opção estruturada de torrent."""
    info_hash = stream.get("infoHash")
    if not info_hash:
        return None

    raw_name = stream.get("name", "")
    raw_title = stream.get("title", "")
    behavior = stream.get("behaviorHints", {})
    filename = behavior.get("filename") or ""

    combined_text = f"{raw_name} {raw_title} {filename}".lower()

    # Detecta Qualidade
    quality = "1080p"
    if "4k" in combined_text or "2160p" in combined_text or "uhd" in combined_text:
        quality = "4K Ultra HD"
    elif "1080p" in combined_text or "fhd" in combined_text or "bluray" in combined_text:
        quality = "1080p Full HD"
    elif "720p" in combined_text or "hdrip" in combined_text:
        quality = "720p HD"

    # Extrai Seeders (ícone 👤 ou 👥)
    seeders = 0
    seed_match = re.search(r"[👤👥]\s*(\d+)", raw_title)
    if seed_match:
        seeders = int(seed_match.group(1))

    # Extrai Tamanho do Arquivo (ícone 💾)
    size_str = "N/A"
    size_match = re.search(r"💾\s*([\d\.]+\s*(?:GB|MB|KB))", raw_title, re.IGNORECASE)
    if size_match:
        size_str = size_match.group(1)

    # Extrai Indexer / Fonte (ícone ⚙️)
    provider = "Torrentio"
    provider_match = re.search(r"⚙️\s*([^\n\r]+)", raw_title)
    if provider_match:
        provider = provider_match.group(1).strip()

    # Detecta Áudio em Português / Dublado
    is_dubbed = False
    language_desc = "Original / Legendado"

    pt_markers = [
        "dublado",
        "dual audio",
        "dual áudio",
        "pt-br",
        "ptbr",
        "português",
        "portugues",
        "nacional",
        "🇧🇷",
        "comando",
        "bludv",
        "lapumia",
        "maniacos",
        "brazilian",
    ]
    if any(m in combined_text for m in pt_markers):
        is_dubbed = True
        language_desc = "🇧🇷 Dublado PT-BR / Dual Áudio"
    elif "dual" in combined_text or "multi" in combined_text:
        is_dubbed = True
        language_desc = "🌐 Dual Áudio / Multi-Linguagem"

    clean_display_title = filename or raw_title.split("\n")[0] or default_title
    clean_display_title = re.sub(r"[👤💾⚙️].*", "", clean_display_title).strip()

    magnet_link = make_magnet(info_hash, clean_display_title)

    return {
        "title": clean_display_title,
        "info_hash": info_hash,
        "magnet": magnet_link,
        "quality": quality,
        "size_str": size_str,
        "seeders": seeders,
        "provider": provider,
        "is_dubbed": is_dubbed,
        "language": language_desc,
        "filename": filename or None,
    }


async def search_torrents_for_media(
    query: str,
    year: Optional[int] = None,
    debrid_token: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Pesquisa torrents no ecossistema (Torrentio BR + YTS + Indexers) para o título canônico TMDB.
    Retorna a lista completa com prioridade para versões Dubladas PT-BR com mais seeders.
    """
    metadata = await search_canonical_tmdb(query=query, year=year)
    imdb_id = metadata.get("imdb_id")
    is_series = metadata.get("is_series", False)
    season = metadata.get("season_number", 1) or 1
    episode = metadata.get("episode_number", 1) or 1

    torrents: List[Dict[str, Any]] = []
    seen_hashes = set()

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
    }

    async with httpx.AsyncClient(headers=headers, timeout=8.0) as client:
        # Se temos IMDb ID, faz consultas otimizadas no Torrentio com filtro de Português e Global
        if imdb_id:
            media_path = f"series/{imdb_id}:{season}:{episode}.json" if is_series else f"movie/{imdb_id}.json"

            # 1. Consulta com filtro preferencial em português
            url_pt = f"https://torrentio.strem.fun/language=portuguese|sort=seeders/stream/{media_path}"
            # 2. Consulta global com todos os trackers
            url_global = f"https://torrentio.strem.fun/sort=seeders/stream/{media_path}"

            responses = await client.get(url_pt), await client.get(url_global)

            for resp in responses:
                if resp.status_code == 200:
                    try:
                        data = resp.json()
                        streams = data.get("streams", [])
                        for s in streams:
                            item = parse_torrentio_stream(s, metadata["title"])
                            if item and item["info_hash"] not in seen_hashes:
                                seen_hashes.add(item["info_hash"])
                                torrents.append(item)
                    except Exception:
                        pass

        # Se não achou ou não tem IMDb ID, faz busca por texto no YTS (para filmes)
        if not is_series and len(torrents) < 5:
            try:
                yts_q = urllib.parse.quote(metadata["title"])
                yts_url = f"https://yts.mx/api/v2/list_movies.json?query_term={yts_q}&limit=5"
                yts_resp = await client.get(yts_url)
                if yts_resp.status_code == 200:
                    yts_data = yts_resp.json()
                    movies = yts_data.get("data", {}).get("movies", [])
                    for m in movies:
                        for t in m.get("torrents", []):
                            ih = t.get("hash")
                            if ih and ih.lower() not in seen_hashes:
                                seen_hashes.add(ih.lower())
                                q_val = t.get("quality", "1080p")
                                torrents.append({
                                    "title": f"{m.get('title')} ({m.get('year')}) [{q_val} {t.get('type', 'BluRay')}]",
                                    "info_hash": ih.lower(),
                                    "magnet": make_magnet(ih.lower(), m.get("title")),
                                    "quality": f"{q_val} Full HD" if "1080" in q_val else f"{q_val}",
                                    "size_str": t.get("size", "N/A"),
                                    "seeders": t.get("seeds", 0),
                                    "provider": "YTS YIFY",
                                    "is_dubbed": False,
                                    "language": "Original (EN) + Legendas",
                                    "filename": None,
                                })
            except Exception:
                pass

    # Ordenação: 1º Dublados PT-BR, 2º Quantidade de Seeders
    torrents.sort(key=lambda x: (
        0 if x.get("is_dubbed") else 1,
        -x.get("seeders", 0),
    ))

    best_dubbed = next((t for t in torrents if t.get("is_dubbed")), None)
    if not best_dubbed and torrents:
        best_dubbed = torrents[0]

    return {
        "query": query,
        "found": len(torrents) > 0,
        "metadata": metadata,
        "torrents": torrents,
        "total": len(torrents),
        "best_dubbed": best_dubbed,
    }


async def resolve_debrid_link(magnet: str, api_key: Optional[str] = None) -> Optional[str]:
    """
    Resolve um Magnet Link para um link direto HTTP/MP4 de 1 Gbps via Real-Debrid ou TorBox.
    """
    if not api_key or not magnet:
        return None

    clean_key = api_key.strip()

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # 1. Real-Debrid API Flow
            headers = {"Authorization": f"Bearer {clean_key}"}
            add_resp = await client.post(
                "https://api.real-debrid.com/rest/1.0/torrents/addMagnet",
                data={"magnet": magnet},
                headers=headers,
            )
            if add_resp.status_code == 201:
                torrent_info = add_resp.json()
                t_id = torrent_info.get("id")
                if t_id:
                    # Seleciona todos os arquivos
                    await client.post(
                        f"https://api.real-debrid.com/rest/1.0/torrents/selectFiles/{t_id}",
                        data={"files": "all"},
                        headers=headers,
                    )
                    # Busca os links gerados
                    info_resp = await client.get(
                        f"https://api.real-debrid.com/rest/1.0/torrents/info/{t_id}",
                        headers=headers,
                    )
                    if info_resp.status_code == 200:
                        links = info_resp.json().get("links", [])
                        if links:
                            # Desrestringe o link para stream direto
                            unrestrict_resp = await client.post(
                                "https://api.real-debrid.com/rest/1.0/unrestrict/link",
                                data={"link": links[0]},
                                headers=headers,
                            )
                            if unrestrict_resp.status_code == 200:
                                return unrestrict_resp.json().get("download")
    except Exception:
        pass

    return None
