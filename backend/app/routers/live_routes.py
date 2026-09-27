import os
import re
import urllib.parse
from typing import List, Optional
from datetime import datetime
from collections import Counter

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text, func

from .. import models, schemas
from ..auth import get_current_user, require_admin
from ..database import get_db

router = APIRouter(prefix="/live", tags=["live"])
admin_router = APIRouter(prefix="/admin/live", tags=["admin-live"])

DEFAULT_FREE_CHANNELS = [
    {
        "name": "NASA TV HD",
        "category": "Cultura & Educação",
        "stream_url": "https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8",
        "logo_url": "https://images.nasa.gov/images/nasa_logo.png",
        "epg_id": "NASATV.us",
        "order": 1,
    },
    {
        "name": "Red Bull TV",
        "category": "Esportes",
        "stream_url": "https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8",
        "logo_url": "https://img.redbull.com/images/w_300/q_auto,f_auto/redbullcom/2020/6/15/h305u2gqfv7o1n9x1vfe/red-bull-tv-logo",
        "epg_id": "RedBullTV.global",
        "order": 2,
    },
    {
        "name": "Amazon Sat HD",
        "category": "Abertos / Brasil",
        "stream_url": "https://amazonsat.brasilstream.com.br/hls/amazonsat/index.m3u8",
        "logo_url": "",
        "epg_id": "AmazonSat.br",
        "order": 3,
    },
    {
        "name": "Adesso TV HD",
        "category": "Abertos / Brasil",
        "stream_url": "https://cdn.jmvstream.com/w/LVW-9715/LVW9715_12B26T62tm/playlist.m3u8",
        "logo_url": "",
        "epg_id": "AdessoTV.br",
        "order": 4,
    },
    {
        "name": "Aratu On Salvador",
        "category": "Abertos / Brasil",
        "stream_url": "https://cdn.live.br1.jmvstream.com/w/LVW-9359/LVW9359_XSyReL0QVf/playlist.m3u8",
        "logo_url": "",
        "epg_id": "AratuOn.br",
        "order": 5,
    },
    {
        "name": "STZ TV 1080p",
        "category": "Abertos / Brasil",
        "stream_url": "https://cdn.live.br1.jmvstream.com/webtv/AVJ-12952/playlist/playlist.m3u8",
        "logo_url": "",
        "epg_id": "STZTV.br",
        "order": 6,
    },
    {
        "name": "SOU TV",
        "category": "Entretenimento & Variedades",
        "stream_url": "https://video10.logicahost.com.br/soutv/soutv/playlist.m3u8",
        "logo_url": "",
        "epg_id": "SouTV.br",
        "order": 7,
    },
    {
        "name": "AgroCanal",
        "category": "Entretenimento & Variedades",
        "stream_url": "https://aovivo.equipea.com.br:5443/aovivort/streams/pshRLrnv6isXq7RG4747567774043229.m3u8",
        "logo_url": "",
        "epg_id": "AgroCanal.br",
        "order": 8,
    },
    {
        "name": "DW Português",
        "category": "Notícias",
        "stream_url": "https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8",
        "logo_url": "",
        "epg_id": "DWPortugues.de",
        "order": 9,
    },
    {
        "name": "Sony Movies HD",
        "category": "Filmes & Séries",
        "stream_url": "http://45.177.114.115/SONY_MOVIES/index.m3u8",
        "logo_url": "",
        "epg_id": "SonyMovies.br",
        "order": 10,
    },
    {
        "name": "Sony Channel HD",
        "category": "Entretenimento & Variedades",
        "stream_url": "http://170.83.16.50/SONY_CHANNEL/index.m3u8",
        "logo_url": "",
        "epg_id": "SonyChannel.br",
        "order": 11,
    },
    {
        "name": "SporTV 3 HD",
        "category": "Esportes",
        "stream_url": "http://170.83.49.66:8083/SPORTV3HD/index.m3u8",
        "logo_url": "",
        "epg_id": "SporTV3.br",
        "order": 12,
    },
    {
        "name": "Arte 1 HD",
        "category": "Cultura & Educação",
        "stream_url": "http://45.162.64.114/ARTE1/index.m3u8",
        "logo_url": "",
        "epg_id": "Arte1.br",
        "order": 13,
    },
    {
        "name": "Terra Viva",
        "category": "Entretenimento & Variedades",
        "stream_url": "http://45.177.114.115/TERRAVIVA/index.m3u8",
        "logo_url": "",
        "epg_id": "TerraViva.br",
        "order": 14,
    },
    {
        "name": "AgroMais HD",
        "category": "Entretenimento & Variedades",
        "stream_url": "http://45.162.64.114/AGROMAIS/index.m3u8",
        "logo_url": "",
        "epg_id": "AgroMais.br",
        "order": 15,
    }
]


def clean_category_name(raw: Optional[str]) -> str:
    """Padroniza e organiza nomes de categorias caóticas de listas IPTV."""
    if not raw:
        return "Geral"
    raw_clean = raw.strip()
    raw_lower = raw_clean.lower()

    if raw_lower in ["undefined", "null", "none", "unknown", "geral", "general", "outros", "iptv", "diversos", "sem categoria"]:
        return "Geral"

    tokens = [t.strip() for t in re.split(r'[;/|]', raw_clean) if t.strip()]

    for token in (tokens if len(tokens) > 1 else [raw_clean]):
        tok_lower = token.lower()

        if any(k in tok_lower for k in ["kid", "infantil", "cartoon", "desenho", "disney", "nick", "gloob", "anime", "animation"]):
            return "Infantil & Desenhos"

        if any(k in tok_lower for k in ["aberto", "globo", "sbt", "record", "band", "brasil", "brazil", "redetv", "tv brasil"]):
            return "Abertos / Brasil"

        if any(k in tok_lower for k in ["sport", "esporte", "futebol", "premiere", "espn", "combate", "conmebol", "auto", "racing", "outdoor"]):
            return "Esportes"

        if any(k in tok_lower for k in ["filme", "movie", "cine", "telecine", "hbo", "series", "serie", "comedy", "classic", "drama", "action", "terror", "ficcao"]):
            return "Filmes & Séries"

        if any(k in tok_lower for k in ["noticia", "notícia", "news", "jornal", "dw", "cnn", "bandnews", "globonews", "business", "economia"]):
            return "Notícias"

        if any(k in tok_lower for k in ["music", "música", "musica", "clip", "mtv", "radio", "rádio", "som"]):
            return "Música"

        if any(k in tok_lower for k in ["documentar", "doc", "discovery", "history", "nat geo", "national geographic", "science", "ciencia", "ciência"]):
            return "Documentários"

        if any(k in tok_lower for k in ["cultura", "culture", "education", "educacao", "educação", "arte", "learn"]):
            return "Cultura & Educação"

        if any(k in tok_lower for k in ["legislativ", "senado", "camara", "câmara", "public", "governo"]):
            return "Canais Públicos & Legislativos"

        if any(k in tok_lower for k in ["religi", "gospel", "igreja", "catolic", "evang", "fe", "fé", "oracao"]):
            return "Religiosos"

        if any(k in tok_lower for k in ["variedade", "variety", "lifestyle", "shop", "travel", "cooking", "culinaria", "entretenimento", "entertainment", "family", "relax", "reality"]):
            return "Entretenimento & Variedades"

    first_token = tokens[0] if tokens else raw_clean
    cleaned_str = re.sub(r'^[\[\(].*?[\]\)]', '', first_token).strip()
    return cleaned_str.title() if cleaned_str else "Geral"


def seed_default_channels_if_empty(db: Session):
    count = db.query(models.Channel).count()
    if count == 0:
        for ch in DEFAULT_FREE_CHANNELS:
            db_ch = models.Channel(
                name=ch["name"],
                category=ch.get("category", "Geral"),
                stream_url=ch["stream_url"],
                logo_url=ch.get("logo_url"),
                epg_id=ch.get("epg_id"),
                is_custom=False,
                playlist_id=None,
                order=ch.get("order", 0),
                is_active=True,
            )
            db.add(db_ch)
        db.commit()


def parse_m3u_text(content: str, default_category: str = "Geral") -> List[dict]:
    """Parse robusto e otimizado de listas M3U/M3U8 com metadados do #EXTINF."""
    lines = [line.strip() for line in content.splitlines() if line.strip()]
    channels = []
    
    current_name = None
    current_logo = None
    current_category = default_category
    current_epg = None

    for line in lines:
        if line.startswith("#EXTINF:"):
            group_match = re.search(r'group-title="([^"]+)"', line, re.IGNORECASE)
            if group_match:
                current_category = clean_category_name(group_match.group(1))
            else:
                current_category = default_category

            logo_match = re.search(r'tvg-logo="([^"]+)"', line, re.IGNORECASE)
            if logo_match:
                current_logo = logo_match.group(1).strip()
            else:
                current_logo = None

            epg_match = re.search(r'tvg-id="([^"]+)"', line, re.IGNORECASE)
            if epg_match:
                current_epg = epg_match.group(1).strip()
            else:
                current_epg = None

            if "," in line:
                raw_name = line.split(",")[-1].strip()
                current_name = raw_name or "Canal IPTV"
            else:
                current_name = "Canal IPTV"

        elif line.startswith("#"):
            continue
        else:
            if line.startswith("http://") or line.startswith("https://") or line.startswith("rtmp://") or line.startswith("mms://"):
                channels.append({
                    "name": current_name or f"Canal {len(channels) + 1}",
                    "stream_url": line,
                    "category": current_category or default_category,
                    "logo_url": current_logo,
                    "epg_id": current_epg,
                })
                current_name = None
                current_logo = None
                current_category = default_category
                current_epg = None

    return channels


# --- ROTAS PÚBLICAS / USUÁRIO ---

@router.get("/channels", response_model=schemas.PaginatedChannels)
def list_channels(
    category: Optional[str] = None,
    playlist_id: Optional[int] = None,
    q: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(60, ge=1, le=5000),
    all: bool = Query(False),
    db: Session = Depends(get_db),
    user: Optional[models.User] = Depends(get_current_user),
):
    """Lista canais ao vivo de forma paginada e ultra-rápida, evitando congelar o navegador."""
    seed_default_channels_if_empty(db)

    query = db.query(models.Channel).filter(models.Channel.is_active == True)

    if playlist_id:
        query = query.filter(models.Channel.playlist_id == playlist_id)
    
    if category and category != "Todos":
        query = query.filter(models.Channel.category == category)
        
    if q:
        search = f"%{q}%"
        query = query.filter(models.Channel.name.ilike(search))

    total = query.count()

    if all:
        items = query.order_by(models.Channel.order.asc(), models.Channel.id.asc()).all()
        return {
            "items": items,
            "total": total,
            "page": 1,
            "limit": total or 1,
            "total_pages": 1,
        }

    total_pages = max(1, (total + limit - 1) // limit)
    offset = (page - 1) * limit

    items = query.order_by(models.Channel.order.asc(), models.Channel.id.asc()).offset(offset).limit(limit).all()

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
    }


@router.get("/categories", response_model=List[schemas.CategoryWithCount])
def list_categories(
    playlist_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: Optional[models.User] = Depends(get_current_user),
):
    """Retorna todas as categorias com suas respectivas contagens de canais."""
    seed_default_channels_if_empty(db)

    query = db.query(models.Channel.category, func.count(models.Channel.id).label("count")).filter(models.Channel.is_active == True)
    if playlist_id:
        query = query.filter(models.Channel.playlist_id == playlist_id)

    results = query.group_by(models.Channel.category).all()
    cat_dict = {r[0]: r[1] for r in results if r[0]}

    priority_order = [
        "Abertos / Brasil",
        "Esportes",
        "Filmes & Séries",
        "Notícias",
        "Infantil & Desenhos",
        "Entretenimento & Variedades",
        "Documentários",
        "Cultura & Educação",
        "Música",
        "Canais Públicos & Legislativos",
        "Religiosos",
        "Geral",
    ]

    ordered_list = []
    added = set()

    for p in priority_order:
        if p in cat_dict:
            ordered_list.append({"category": p, "count": cat_dict[p]})
            added.add(p)

    remaining = [
        {"category": k, "count": v} for k, v in cat_dict.items() if k not in added
    ]
    remaining.sort(key=lambda x: x["count"], reverse=True)
    ordered_list.extend(remaining)

    return ordered_list


@router.get("/playlists", response_model=List[schemas.PlaylistOut])
def list_playlists(
    db: Session = Depends(get_db),
    user: Optional[models.User] = Depends(get_current_user),
):
    """Lista todas as listas/playlists IPTV cadastradas com quantidade atualizada de canais."""
    playlists = db.query(models.Playlist).order_by(models.Playlist.id.desc()).all()
    
    for pl in playlists:
        real_count = db.query(models.Channel).filter(models.Channel.playlist_id == pl.id).count()
        pl.channel_count = real_count

    return playlists


@router.get("/channels/{id}", response_model=schemas.ChannelOut)
def get_channel(
    id: int,
    db: Session = Depends(get_db),
    user: Optional[models.User] = Depends(get_current_user),
):
    channel = db.query(models.Channel).filter(models.Channel.id == id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Canal não encontrado")
    return channel


@router.post("/parse-m3u")
async def parse_m3u_endpoint(
    payload: schemas.M3UImportRequest,
    user: models.User = Depends(get_current_user),
):
    """Analisa uma URL ou texto M3U e retorna resumo estruturado com categorias detectadas."""
    raw_content = ""
    if payload.url:
        try:
            async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as client:
                res = await client.get(payload.url, headers={"User-Agent": "Mozilla/5.0 SilvaFlix/2.0"})
                if res.status_code != 200:
                    raise HTTPException(status_code=400, detail=f"Erro ao baixar lista M3U (Status {res.status_code})")
                raw_content = res.text
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Falha ao conectar com a URL da lista: {str(e)}")
    elif payload.content:
        raw_content = payload.content
    else:
        raise HTTPException(status_code=400, detail="Forneça uma URL ou o conteúdo da lista M3U")

    default_cat = clean_category_name(payload.category_override) if payload.category_override else "Geral"
    channels = parse_m3u_text(raw_content, default_category=default_cat)

    if not channels:
        raise HTTPException(status_code=400, detail="Nenhum canal válido foi identificado na lista M3U.")

    cat_counts = Counter(ch["category"] for ch in channels)
    categories_summary = [
        {"name": cat, "count": count} for cat, count in cat_counts.most_common()
    ]

    return {
        "success": True,
        "total_channels": len(channels),
        "categories": categories_summary,
        "sample_channels": channels[:50],
    }


@router.post("/xtream-connect")
async def connect_xtream_codes(
    payload: schemas.XtreamLoginRequest,
    user: models.User = Depends(get_current_user),
):
    """Conecta a um servidor Xtream Codes e busca categorias e canais ao vivo."""
    base_url = payload.server_url.rstrip("/")
    if not base_url.startswith("http"):
        base_url = f"http://{base_url}"

    api_url = f"{base_url}/player_api.php?username={payload.username}&password={payload.password}"

    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        try:
            auth_res = await client.get(api_url)
            if auth_res.status_code != 200:
                raise HTTPException(status_code=400, detail="Servidor Xtream Codes inacessível")
            
            data = auth_res.json()
            user_info = data.get("user_info", {})
            if user_info.get("auth") != 1 and user_info.get("status") != "Active":
                raise HTTPException(status_code=401, detail="Usuário ou senha Xtream Codes inválidos ou conta expirada")

            cats_res = await client.get(f"{api_url}&action=get_live_categories")
            categories = cats_res.json() if cats_res.status_code == 200 else []
            cats_map = {str(c.get("category_id")): clean_category_name(c.get("category_name")) for c in categories if isinstance(c, dict)}

            streams_res = await client.get(f"{api_url}&action=get_live_streams")
            streams = streams_res.json() if streams_res.status_code == 200 else []

            parsed_channels = []
            for s in streams:
                if not isinstance(s, dict):
                    continue
                stream_id = s.get("stream_id")
                stream_name = s.get("name") or "Canal Xtream"
                cat_id = str(s.get("category_id"))
                category_name = cats_map.get(cat_id, "Geral")
                icon_url = s.get("stream_icon")
                epg_id = s.get("epg_channel_id")

                stream_url = f"{base_url}/live/{payload.username}/{payload.password}/{stream_id}.m3u8"

                parsed_channels.append({
                    "name": stream_name,
                    "stream_url": stream_url,
                    "category": category_name,
                    "logo_url": icon_url,
                    "epg_id": str(epg_id) if epg_id else None,
                })

            cat_counts = Counter(ch["category"] for ch in parsed_channels)
            categories_summary = [
                {"name": cat, "count": count} for cat, count in cat_counts.most_common()
            ]

            return {
                "success": True,
                "server_info": data.get("server_info", {}),
                "user_info": user_info,
                "total_channels": len(parsed_channels),
                "categories": categories_summary,
                "sample_channels": parsed_channels[:50],
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Erro ao conectar com Xtream Codes: {str(e)}")


# --- PROXY DE STREAMING HLS / IPTV ---

@router.get("/proxy")
async def live_proxy_stream(
    url: str = Query(..., description="URL da transmissão HLS ou TS"),
    req: Request = None,
):
    """
    Proxy universal de alta performance para HLS (.m3u8 e .ts).
    Resolve problemas de CORS e restrições de player no navegador.
    """
    if not url:
        raise HTTPException(status_code=400, detail="Parâmetro url é obrigatório")

    try:
        decoded_url = urllib.parse.unquote(url)
    except Exception:
        decoded_url = url

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    }

    client = httpx.AsyncClient(timeout=20.0, follow_redirects=True, headers=headers)

    try:
        upstream_req = client.build_request("GET", decoded_url)
        upstream_res = await client.send(upstream_req, stream=True)

        content_type = upstream_res.headers.get("content-type", "").lower()
        is_m3u8 = (
            "mpegurl" in content_type
            or "m3u8" in decoded_url.lower()
            or "m3u" in content_type
            or "application/x-mpegurl" in content_type
        )

        if is_m3u8:
            body_bytes = await upstream_res.aread()
            await upstream_res.aclose()
            await client.aclose()

            text_content = body_bytes.decode("utf-8", errors="ignore")
            base_url_dir = decoded_url.rsplit("/", 1)[0] + "/"

            rewritten_lines = []
            for line in text_content.splitlines():
                trimmed = line.strip()
                if not trimmed:
                    rewritten_lines.append(line)
                    continue

                if trimmed.startswith("#"):
                    if 'URI="' in trimmed:
                        def replace_key_uri(match):
                            orig_uri = match.group(1)
                            abs_uri = urllib.parse.urljoin(base_url_dir, orig_uri)
                            proxy_uri = f"/live/proxy?url={urllib.parse.quote(abs_uri, safe='')}"
                            return f'URI="{proxy_uri}"'
                        modified_tag = re.sub(r'URI="([^"]+)"', replace_key_uri, trimmed)
                        rewritten_lines.append(modified_tag)
                    else:
                        rewritten_lines.append(line)
                else:
                    abs_target = urllib.parse.urljoin(base_url_dir, trimmed)
                    proxy_target = f"/live/proxy?url={urllib.parse.quote(abs_target, safe='')}"
                    rewritten_lines.append(proxy_target)

            new_manifest = "\n".join(rewritten_lines)
            return Response(
                content=new_manifest,
                media_type="application/vnd.apple.mpegurl",
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
                    "Access-Control-Allow-Headers": "*",
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                },
            )

        async def media_stream_generator():
            try:
                async for chunk in upstream_res.aiter_bytes(chunk_size=64 * 1024):
                    yield chunk
            finally:
                await upstream_res.aclose()
                await client.aclose()

        response_headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        }
        if "content-length" in upstream_res.headers:
            response_headers["Content-Length"] = upstream_res.headers["content-length"]
        if "content-type" in upstream_res.headers:
            response_headers["Content-Type"] = upstream_res.headers["content-type"]

        return StreamingResponse(
            media_stream_generator(),
            status_code=upstream_res.status_code,
            headers=response_headers,
            media_type=upstream_res.headers.get("content-type", "video/mp2t"),
        )

    except Exception as e:
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"Erro ao acessar stream ao vivo via proxy: {str(e)}")


# --- ROTAS ADMINISTRATIVAS / GESTÃO DE LISTAS E CANAIS ---

@admin_router.post("/channels", response_model=schemas.ChannelOut)
def create_channel(
    payload: schemas.ChannelCreate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    """Cria um canal individual na grade de canais."""
    clean_cat = clean_category_name(payload.category)
    channel = models.Channel(
        name=payload.name,
        stream_url=payload.stream_url,
        category=clean_cat,
        logo_url=payload.logo_url,
        epg_id=payload.epg_id,
        is_custom=payload.is_custom,
        playlist_id=payload.playlist_id,
        user_id=admin.id,
        order=payload.order,
        is_active=True,
    )
    db.add(channel)
    db.commit()
    db.refresh(channel)

    if payload.playlist_id:
        pl = db.query(models.Playlist).filter(models.Playlist.id == payload.playlist_id).first()
        if pl:
            pl.channel_count = db.query(models.Channel).filter(models.Channel.playlist_id == pl.id).count()
            db.commit()

    return channel


@admin_router.put("/channels/{id}", response_model=schemas.ChannelOut)
def update_channel(
    id: int,
    payload: schemas.ChannelUpdate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    """Atualiza metadados ou status de um canal."""
    channel = db.query(models.Channel).filter(models.Channel.id == id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Canal não encontrado")

    update_data = payload.dict(exclude_unset=True)
    if "category" in update_data and update_data["category"]:
        update_data["category"] = clean_category_name(update_data["category"])

    for key, value in update_data.items():
        setattr(channel, key, value)

    db.commit()
    db.refresh(channel)
    return channel


@admin_router.delete("/channels/{id}")
def delete_channel(
    id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    """Remove um canal individual da grade."""
    channel = db.query(models.Channel).filter(models.Channel.id == id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Canal não encontrado")

    playlist_id = channel.playlist_id
    db.delete(channel)
    db.commit()

    if playlist_id:
        pl = db.query(models.Playlist).filter(models.Playlist.id == playlist_id).first()
        if pl:
            pl.channel_count = db.query(models.Channel).filter(models.Channel.playlist_id == pl.id).count()
            db.commit()

    return {"ok": True, "message": "Canal removido com sucesso"}


@admin_router.delete("/playlists/{id}")
def delete_playlist(
    id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    """Exclui uma lista IPTV inteira e todos os canais associados a ela."""
    playlist = db.query(models.Playlist).filter(models.Playlist.id == id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Lista/Playlist não encontrada")

    deleted_channels = db.query(models.Channel).filter(models.Channel.playlist_id == id).delete()
    db.delete(playlist)
    db.commit()

    return {
        "ok": True,
        "deleted_channels_count": deleted_channels,
        "message": f"Lista '{playlist.name}' e seus {deleted_channels} canais foram excluídos com sucesso.",
    }


@admin_router.post("/clear-all-custom")
def clear_all_custom_channels(
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    """Exclui todos os canais customizados/importados e todas as playlists, mantendo apenas a grade padrão."""
    deleted_channels = db.query(models.Channel).filter(models.Channel.is_custom == True).delete()
    deleted_playlists = db.query(models.Playlist).delete()
    db.commit()

    seed_default_channels_if_empty(db)

    return {
        "ok": True,
        "deleted_channels_count": deleted_channels,
        "deleted_playlists_count": deleted_playlists,
        "message": f"{deleted_channels} canais importados e {deleted_playlists} listas foram removidos. A grade limpa padrão foi restaurada.",
    }


@admin_router.post("/channels/bulk-delete")
def bulk_delete_channels(
    payload: schemas.BulkDeleteChannelsRequest,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    """Remove múltiplos canais selecionados de uma só vez."""
    if not payload.channel_ids:
        raise HTTPException(status_code=400, detail="Nenhum ID de canal fornecido.")

    deleted = db.query(models.Channel).filter(models.Channel.id.in_(payload.channel_ids)).delete(synchronize_session=False)
    db.commit()

    playlists = db.query(models.Playlist).all()
    for pl in playlists:
        pl.channel_count = db.query(models.Channel).filter(models.Channel.playlist_id == pl.id).count()
    db.commit()

    return {
        "ok": True,
        "deleted_count": deleted,
        "message": f"{deleted} canais foram removidos com sucesso.",
    }


@admin_router.post("/channels/delete-by-category")
def delete_channels_by_category(
    payload: schemas.DeleteByCategoryRequest,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    """Exclui todos os canais de uma categoria específica (e opcionalmente de uma playlist)."""
    query = db.query(models.Channel).filter(models.Channel.category == payload.category)
    if payload.playlist_id:
        query = query.filter(models.Channel.playlist_id == payload.playlist_id)

    deleted = query.delete(synchronize_session=False)
    db.commit()

    playlists = db.query(models.Playlist).all()
    for pl in playlists:
        pl.channel_count = db.query(models.Channel).filter(models.Channel.playlist_id == pl.id).count()
    db.commit()

    return {
        "ok": True,
        "deleted_count": deleted,
        "message": f"{deleted} canais da categoria '{payload.category}' foram removidos com sucesso.",
    }


@admin_router.post("/organize-categories")
def organize_all_categories(
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    """Re-analisa e organiza as categorias de todos os canais existentes no banco de dados."""
    channels = db.query(models.Channel).all()
    updated_count = 0
    for ch in channels:
        cleaned = clean_category_name(ch.category)
        if ch.category != cleaned:
            ch.category = cleaned
            updated_count += 1
    db.commit()

    return {
        "ok": True,
        "updated_count": updated_count,
        "message": f"Categorias de {updated_count} canais foram organizadas e padronizadas com sucesso!",
    }


@admin_router.post("/import-m3u")
async def import_m3u_channels(
    payload: schemas.M3UImportRequest,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    """Importa uma lista M3U criando uma Playlist vinculada para fácil gestão ou exclusão futura."""
    raw_content = ""
    if payload.url:
        try:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                res = await client.get(payload.url, headers={"User-Agent": "Mozilla/5.0 SilvaFlix/2.0"})
                if res.status_code != 200:
                    raise HTTPException(status_code=400, detail=f"Erro ao baixar lista M3U (Status {res.status_code})")
                raw_content = res.text
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Falha ao buscar URL da lista M3U: {str(e)}")
    elif payload.content:
        raw_content = payload.content
    else:
        raise HTTPException(status_code=400, detail="Forneça uma URL ou o conteúdo da lista M3U")

    default_cat = clean_category_name(payload.category_override) if payload.category_override else "Geral"
    parsed_channels = parse_m3u_text(raw_content, default_category=default_cat)

    if not parsed_channels:
        raise HTTPException(status_code=400, detail="Nenhum canal válido foi encontrado no arquivo/URL M3U fornecido.")

    if payload.selected_categories and len(payload.selected_categories) > 0:
        allowed = set(payload.selected_categories)
        parsed_channels = [ch for ch in parsed_channels if ch["category"] in allowed]

    if not parsed_channels:
        raise HTTPException(status_code=400, detail="Nenhum canal corresponde às categorias selecionadas.")

    playlist_name = payload.name.strip() if (payload.name and payload.name.strip()) else f"Lista M3U ({datetime.now().strftime('%d/%m/%Y %H:%M')})"
    playlist = models.Playlist(
        name=playlist_name,
        url=payload.url,
        type="m3u",
        channel_count=len(parsed_channels),
    )
    db.add(playlist)
    db.commit()
    db.refresh(playlist)

    last_channel = db.query(models.Channel).order_by(models.Channel.order.desc()).first()
    next_order = (last_channel.order + 1) if last_channel else 1

    channel_objects = []
    for ch in parsed_channels:
        category_name = default_cat if payload.category_override else ch.get("category", default_cat)
        channel_objects.append(
            models.Channel(
                name=ch["name"],
                stream_url=ch["stream_url"],
                category=category_name,
                logo_url=ch.get("logo_url"),
                epg_id=ch.get("epg_id"),
                is_custom=True,
                playlist_id=playlist.id,
                user_id=admin.id,
                order=next_order,
                is_active=True,
            )
        )
        next_order += 1

    db.bulk_save_objects(channel_objects)
    db.commit()

    return {
        "ok": True,
        "playlist_id": playlist.id,
        "playlist_name": playlist.name,
        "imported_count": len(channel_objects),
        "message": f"Lista '{playlist.name}' criada com sucesso com {len(channel_objects)} canais organizados!",
    }


@admin_router.post("/reset-defaults")
def reset_default_channels(
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    """Restaura todos os canais gratuitos padrão do SilvaFlix."""
    db.query(models.Channel).filter(models.Channel.is_custom == False).delete()
    db.commit()

    for ch in DEFAULT_FREE_CHANNELS:
        db_ch = models.Channel(
            name=ch["name"],
            category=ch.get("category", "Geral"),
            stream_url=ch["stream_url"],
            logo_url=ch.get("logo_url"),
            epg_id=ch.get("epg_id"),
            is_custom=False,
            playlist_id=None,
            order=ch.get("order", 0),
            is_active=True,
        )
        db.add(db_ch)

    db.commit()
    return {"ok": True, "message": "Canais gratuitos padrão restaurados com sucesso."}
