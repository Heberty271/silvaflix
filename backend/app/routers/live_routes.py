import os
import re
import urllib.parse
from typing import List, Optional
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse, PlainTextResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user, require_admin
from ..database import get_db

router = APIRouter(prefix="/live", tags=["live"])
admin_router = APIRouter(prefix="/admin/live", tags=["admin-live"])

DEFAULT_FREE_CHANNELS = [
    {
        "name": "TV Brasil HD",
        "category": "Abertos / Brasil",
        "stream_url": "https://ebc-live.akamaized.net/hls/live/2034988/tvbrasil/master.m3u8",
        "logo_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/TV_Brasil_2023_logo.svg/300px-TV_Brasil_2023_logo.svg.png",
        "epg_id": "TVBrasil.br",
        "order": 1,
    },
    {
        "name": "TV Cultura",
        "category": "Abertos / Brasil",
        "stream_url": "https://cultura-stream.cultura.com.br/hls/tvcultura/index.m3u8",
        "logo_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/TV_Cultura_logo_2019.svg/300px-TV_Cultura_logo_2019.svg.png",
        "epg_id": "TVCultura.br",
        "order": 2,
    },
    {
        "name": "Record News",
        "category": "Notícias",
        "stream_url": "https://recordnews-lh.akamaihd.net/i/recordnews_1@115206/master.m3u8",
        "logo_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Record_News_2020.png/300px-Record_News_2020.png",
        "epg_id": "RecordNews.br",
        "order": 3,
    },
    {
        "name": "TV Senado",
        "category": "Abertos / Brasil",
        "stream_url": "https://tvsenado-stream.senado.leg.br/hls/tvsenado/index.m3u8",
        "logo_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Logo_TV_Senado.svg/300px-Logo_TV_Senado.svg.png",
        "epg_id": "TVSenado.br",
        "order": 4,
    },
    {
        "name": "TV Câmara",
        "category": "Abertos / Brasil",
        "stream_url": "https://tvcamara-stream.camara.leg.br/hls/tvcamara/index.m3u8",
        "logo_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/TV_C%C3%A2mara_logo_2019.png/300px-TV_C%C3%A2mara_logo_2019.png",
        "epg_id": "TVCamara.br",
        "order": 5,
    },
    {
        "name": "RedeTV!",
        "category": "Abertos / Brasil",
        "stream_url": "https://redetv-live.akamaized.net/hls/live/2034991/redetv/master.m3u8",
        "logo_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/RedeTV%21_logo_2018.png/300px-RedeTV%21_logo_2018.png",
        "epg_id": "RedeTV.br",
        "order": 6,
    },
    {
        "name": "Canal Futura",
        "category": "Cultura & Educação",
        "stream_url": "https://futura-stream.globo.com/hls/futura/index.m3u8",
        "logo_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Canal_Futura_logo.svg/300px-Canal_Futura_logo.svg.png",
        "epg_id": "CanalFutura.br",
        "order": 7,
    },
    {
        "name": "Canal Rural",
        "category": "Variedades",
        "stream_url": "https://stream.canalrural.com.br/hls/live.m3u8",
        "logo_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Canal_Rural_logo.png/300px-Canal_Rural_logo.png",
        "epg_id": "CanalRural.br",
        "order": 8,
    },
    {
        "name": "Pluto TV Cine Sucessos",
        "category": "Filmes & Séries",
        "stream_url": "https://service-stitcher.clusters.pluto.tv/v1/stitch/hls/channel/5f9b44129494440007883296/master.m3u8?advertisingId=&appName=web&appStoreUrl=&appVersion=unknown&architecture=&buildVersion=&clientDeviceType=0&clientModelNumber=unknown&deviceDNT=0&deviceId=unknown&deviceLat=&deviceLon=&deviceMake=Chrome&deviceModel=Chrome&deviceType=web&deviceVersion=unknown&includeExtendedEvents=false&serverSideAds=false&sid=unknown",
        "logo_url": "https://images.pluto.tv/channels/5f9b44129494440007883296/colorLogoPNG.png",
        "epg_id": "PlutoTVCineSucessos.br",
        "order": 9,
    },
    {
        "name": "Pluto TV Cine Terror",
        "category": "Filmes & Séries",
        "stream_url": "https://service-stitcher.clusters.pluto.tv/v1/stitch/hls/channel/5f9b44a7949444000788329e/master.m3u8?advertisingId=&appName=web&appStoreUrl=&appVersion=unknown&architecture=&buildVersion=&clientDeviceType=0&clientModelNumber=unknown&deviceDNT=0&deviceId=unknown&deviceLat=&deviceLon=&deviceMake=Chrome&deviceModel=Chrome&deviceType=web&deviceVersion=unknown&includeExtendedEvents=false&serverSideAds=false&sid=unknown",
        "logo_url": "https://images.pluto.tv/channels/5f9b44a7949444000788329e/colorLogoPNG.png",
        "epg_id": "PlutoTVCineTerror.br",
        "order": 10,
    },
    {
        "name": "Pluto TV Anime",
        "category": "Entretenimento",
        "stream_url": "https://service-stitcher.clusters.pluto.tv/v1/stitch/hls/channel/5f9b45bf94944400078832a8/master.m3u8?advertisingId=&appName=web&appStoreUrl=&appVersion=unknown&architecture=&buildVersion=&clientDeviceType=0&clientModelNumber=unknown&deviceDNT=0&deviceId=unknown&deviceLat=&deviceLon=&deviceMake=Chrome&deviceModel=Chrome&deviceType=web&deviceVersion=unknown&includeExtendedEvents=false&serverSideAds=false&sid=unknown",
        "logo_url": "https://images.pluto.tv/channels/5f9b45bf94944400078832a8/colorLogoPNG.png",
        "epg_id": "PlutoTVAnime.br",
        "order": 11,
    },
    {
        "name": "Pluto TV Comédia",
        "category": "Entretenimento",
        "stream_url": "https://service-stitcher.clusters.pluto.tv/v1/stitch/hls/channel/5f9b437e949444000788328e/master.m3u8?advertisingId=&appName=web&appStoreUrl=&appVersion=unknown&architecture=&buildVersion=&clientDeviceType=0&clientModelNumber=unknown&deviceDNT=0&deviceId=unknown&deviceLat=&deviceLon=&deviceMake=Chrome&deviceModel=Chrome&deviceType=web&deviceVersion=unknown&includeExtendedEvents=false&serverSideAds=false&sid=unknown",
        "logo_url": "https://images.pluto.tv/channels/5f9b437e949444000788328e/colorLogoPNG.png",
        "epg_id": "PlutoTVComedia.br",
        "order": 12,
    },
    {
        "name": "Pluto TV Junior Kids",
        "category": "Infantil",
        "stream_url": "https://service-stitcher.clusters.pluto.tv/v1/stitch/hls/channel/5f9b454594944400078832a4/master.m3u8?advertisingId=&appName=web&appStoreUrl=&appVersion=unknown&architecture=&buildVersion=&clientDeviceType=0&clientModelNumber=unknown&deviceDNT=0&deviceId=unknown&deviceLat=&deviceLon=&deviceMake=Chrome&deviceModel=Chrome&deviceType=web&deviceVersion=unknown&includeExtendedEvents=false&serverSideAds=false&sid=unknown",
        "logo_url": "https://images.pluto.tv/channels/5f9b454594944400078832a4/colorLogoPNG.png",
        "epg_id": "PlutoTVJunior.br",
        "order": 13,
    },
    {
        "name": "Red Bull TV",
        "category": "Esportes",
        "stream_url": "https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8",
        "logo_url": "https://upload.wikimedia.org/wikipedia/en/thumb/f/f5/Red_Bull_TV_logo.svg/300px-Red_Bull_TV_logo.svg.png",
        "epg_id": "RedBullTV.global",
        "order": 14,
    },
    {
        "name": "NASA TV HD",
        "category": "Cultura & Educação",
        "stream_url": "https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8",
        "logo_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/NASA_logo.svg/300px-NASA_logo.svg.png",
        "epg_id": "NASATV.us",
        "order": 15,
    },
    {
        "name": "Euronews Português",
        "category": "Notícias",
        "stream_url": "https://euronews-portuguese.rakuten.wurl.tv/playlist.m3u8",
        "logo_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Euronews_2016_logo.svg/300px-Euronews_2016_logo.svg.png",
        "epg_id": "EuronewsPT.eu",
        "order": 16,
    },
    {
        "name": "TV Aparecida HD",
        "category": "Variedades",
        "stream_url": "https://tvaparecida.audiogestor.biz/live/smil:aovivo.smil/playlist.m3u8",
        "logo_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/TV_Aparecida_logo_2019.png/300px-TV_Aparecida_logo_2019.png",
        "epg_id": "TVAparecida.br",
        "order": 17,
    },
    {
        "name": "TV Canção Nova",
        "category": "Variedades",
        "stream_url": "https://cancaonova-live.akamaized.net/hls/live/2035985/cancaonova/master.m3u8",
        "logo_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Logo_TV_Can%C3%A7%C3%A3o_Nova.png/300px-Logo_TV_Can%C3%A7%C3%A3o_Nova.png",
        "epg_id": "CancaoNova.br",
        "order": 18,
    }
]


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
                order=ch.get("order", 0),
                is_active=True,
            )
            db.add(db_ch)
        db.commit()


def parse_m3u_text(content: str, default_category: str = "IPTV") -> List[dict]:
    """Parse robusto de listas M3U/M3U8 com metadados do #EXTINF."""
    lines = [line.strip() for line in content.splitlines() if line.strip()]
    channels = []
    
    current_name = None
    current_logo = None
    current_category = default_category
    current_epg = None

    for line in lines:
        if line.startswith("#EXTINF:"):
            # Extrai group-title="..."
            group_match = re.search(r'group-title="([^"]+)"', line, re.IGNORECASE)
            if group_match:
                current_category = group_match.group(1).strip()
            else:
                current_category = default_category

            # Extrai tvg-logo="..."
            logo_match = re.search(r'tvg-logo="([^"]+)"', line, re.IGNORECASE)
            if logo_match:
                current_logo = logo_match.group(1).strip()
            else:
                current_logo = None

            # Extrai tvg-id="..." or tvg-name="..."
            epg_match = re.search(r'tvg-id="([^"]+)"', line, re.IGNORECASE)
            if epg_match:
                current_epg = epg_match.group(1).strip()
            else:
                current_epg = None

            # Nome do canal (depois da última vírgula)
            if "," in line:
                raw_name = line.split(",")[-1].strip()
                current_name = raw_name or "Canal IPTV"
            else:
                current_name = "Canal IPTV"

        elif line.startswith("#"):
            # Outros comentários ou tags M3U (#EXTVLCOPT, etc)
            continue
        else:
            # É a URL do stream
            if line.startswith("http://") or line.startswith("https://") or line.startswith("rtmp://"):
                channels.append({
                    "name": current_name or f"Canal {len(channels) + 1}",
                    "stream_url": line,
                    "category": current_category or default_category,
                    "logo_url": current_logo,
                    "epg_id": current_epg,
                })
                # Reseta temporários
                current_name = None
                current_logo = None
                current_category = default_category
                current_epg = None

    return channels


# --- ROTAS PÚBLICAS / USUÁRIO ---

@router.get("/channels", response_model=List[schemas.ChannelOut])
def list_channels(
    category: Optional[str] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    user: Optional[models.User] = Depends(get_current_user),
):
    """Lista todos os canais ao vivo disponíveis (gratuitos e personalizados)."""
    seed_default_channels_if_empty(db)

    query = db.query(models.Channel).filter(models.Channel.is_active == True)
    
    if category and category != "Todos":
        query = query.filter(models.Channel.category == category)
        
    if q:
        search = f"%{q}%"
        query = query.filter(models.Channel.name.ilike(search))

    # Ordena por ordem definida e depois por ID
    channels = query.order_by(models.Channel.order.asc(), models.Channel.id.asc()).all()
    return channels


@router.get("/channels/categories")
def list_categories(
    db: Session = Depends(get_db),
    user: Optional[models.User] = Depends(get_current_user),
):
    """Retorna todas as categorias de canais existentes no catálogo."""
    seed_default_channels_if_empty(db)
    results = db.query(models.Channel.category).distinct().filter(models.Channel.is_active == True).all()
    cats = [r[0] for r in results if r[0]]
    # Garante categorias padrão na ordem correta
    default_order = [
        "Abertos / Brasil",
        "Notícias",
        "Esportes",
        "Filmes & Séries",
        "Entretenimento",
        "Infantil",
        "Cultura & Educação",
        "Variedades",
        "Música",
        "IPTV Personalizado",
    ]
    ordered_cats = []
    for d in default_order:
        if d in cats:
            ordered_cats.append(d)
    for c in cats:
        if c not in ordered_cats:
            ordered_cats.append(c)
    return ordered_cats


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


@router.post("/parse-m3u", response_model=List[schemas.ParsedChannel])
async def parse_m3u_endpoint(
    payload: schemas.M3UImportRequest,
    user: models.User = Depends(get_current_user),
):
    """Analisa uma URL ou texto M3U e retorna a lista de canais identificados para pré-visualização."""
    raw_content = ""
    if payload.url:
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                res = await client.get(payload.url, headers={"User-Agent": "Mozilla/5.0 SilvaFlix/1.0"})
                if res.status_code != 200:
                    raise HTTPException(status_code=400, detail=f"Erro ao baixar lista M3U (Status {res.status_code})")
                raw_content = res.text
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Falha ao conectar com a URL da lista: {str(e)}")
    elif payload.content:
        raw_content = payload.content
    else:
        raise HTTPException(status_code=400, detail="Forneça uma URL ou o conteúdo da lista M3U")

    default_cat = payload.category_override or "IPTV Personalizado"
    channels = parse_m3u_text(raw_content, default_category=default_cat)
    return channels


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

    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        try:
            auth_res = await client.get(api_url)
            if auth_res.status_code != 200:
                raise HTTPException(status_code=400, detail="Servidor Xtream Codes inacessível")
            
            data = auth_res.json()
            user_info = data.get("user_info", {})
            if user_info.get("auth") != 1 and user_info.get("status") != "Active":
                raise HTTPException(status_code=401, detail="Usuário ou senha Xtream Codes inválidos ou conta expirada")

            # Busca categorias e streams
            cats_res = await client.get(f"{api_url}&action=get_live_categories")
            categories = cats_res.json() if cats_res.status_code == 200 else []
            cats_map = {str(c.get("category_id")): c.get("category_name") for c in categories if isinstance(c, dict)}

            streams_res = await client.get(f"{api_url}&action=get_live_streams")
            streams = streams_res.json() if streams_res.status_code == 200 else []

            parsed_channels = []
            for s in streams:
                if not isinstance(s, dict):
                    continue
                stream_id = s.get("stream_id")
                stream_name = s.get("name") or "Canal Xtream"
                cat_id = str(s.get("category_id"))
                category_name = cats_map.get(cat_id, "IPTV Xtream")
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

            return {
                "success": True,
                "server_info": data.get("server_info", {}),
                "user_info": user_info,
                "channels_count": len(parsed_channels),
                "channels": parsed_channels[:500],  # Limita para não estourar resposta inicial se lista for gigante
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Erro ao conectar com Xtream Codes: {str(e)}")


# --- PROXY DE STREAMING HLS / IPTV (CORS BYPASS & RELATIVE URL REWRITER) ---

@router.get("/proxy")
async def live_proxy_stream(
    url: str = Query(..., description="URL da transmissão HLS ou TS"),
    req: Request = None,
):
    """
    Proxy universal de baixa latência para HLS (.m3u8 e .ts).
    Resolve problemas de CORS e headers de proteção de players IPTV no navegador.
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
            # Lê o conteúdo do manifesto para reescrever as URLs relativas ou absolutas através do proxy
            body_bytes = await upstream_res.aread()
            await upstream_res.aclose()
            await client.aclose()

            text_content = body_bytes.decode("utf-8", errors="ignore")
            base_parsed = urllib.parse.urlparse(decoded_url)
            base_url_dir = decoded_url.rsplit("/", 1)[0] + "/"

            rewritten_lines = []
            for line in text_content.splitlines():
                trimmed = line.strip()
                if not trimmed:
                    rewritten_lines.append(line)
                    continue

                if trimmed.startswith("#"):
                    # Processa tags como #EXT-X-KEY:URI="...", #EXT-X-MAP:URI="..."
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
                    # É uma URL de chunk (.ts, .aac, .m4s) ou de sub-manifesto (.m3u8)
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

        # Para arquivos de mídia binários (.ts, .aac, .mp4, .m4s), faz streaming direto
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


# --- ROTAS ADMINISTRATIVAS / GESTÃO DE CANAIS ---

@admin_router.post("/channels", response_model=schemas.ChannelOut)
def create_channel(
    payload: schemas.ChannelCreate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    """Cria um canal individual na grade de canais."""
    channel = models.Channel(
        name=payload.name,
        stream_url=payload.stream_url,
        category=payload.category,
        logo_url=payload.logo_url,
        epg_id=payload.epg_id,
        is_custom=payload.is_custom,
        user_id=admin.id,
        order=payload.order,
        is_active=True,
    )
    db.add(channel)
    db.commit()
    db.refresh(channel)
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
    """Remove um canal da grade."""
    channel = db.query(models.Channel).filter(models.Channel.id == id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Canal não encontrado")

    db.delete(channel)
    db.commit()
    return {"ok": True, "message": "Canal removido com sucesso"}


@admin_router.post("/import-m3u")
async def import_m3u_channels(
    payload: schemas.M3UImportRequest,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    """Importa uma lista M3U inteira para a base de dados."""
    raw_content = ""
    if payload.url:
        try:
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
                res = await client.get(payload.url, headers={"User-Agent": "Mozilla/5.0 SilvaFlix/1.0"})
                if res.status_code != 200:
                    raise HTTPException(status_code=400, detail=f"Erro ao baixar lista M3U (Status {res.status_code})")
                raw_content = res.text
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Falha ao buscar URL da lista M3U: {str(e)}")
    elif payload.content:
        raw_content = payload.content
    else:
        raise HTTPException(status_code=400, detail="Forneça uma URL ou o conteúdo da lista M3U")

    default_cat = payload.category_override or "IPTV Personalizado"
    parsed_channels = parse_m3u_text(raw_content, default_category=default_cat)

    if not parsed_channels:
        raise HTTPException(status_code=400, detail="Nenhum canal válido foi encontrado no arquivo/URL M3U fornecido.")

    # Busca a maior ordem existente para adicionar em sequência
    last_channel = db.query(models.Channel).order_by(models.Channel.order.desc()).first()
    next_order = (last_channel.order + 1) if last_channel else 1

    created_count = 0
    for ch in parsed_channels:
        db_ch = models.Channel(
            name=ch["name"],
            stream_url=ch["stream_url"],
            category=ch.get("category", default_cat),
            logo_url=ch.get("logo_url"),
            epg_id=ch.get("epg_id"),
            is_custom=True,
            user_id=admin.id,
            order=next_order,
            is_active=True,
        )
        db.add(db_ch)
        next_order += 1
        created_count += 1

    db.commit()
    return {
        "ok": True,
        "imported_count": created_count,
        "message": f"{created_count} canais foram importados com sucesso para a grade ao vivo.",
    }


@admin_router.post("/reset-defaults")
def reset_default_channels(
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    """Restaura todos os canais gratuitos padrão do SilvaFlix."""
    # Remove canais padrão existentes (não customizados)
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
            order=ch.get("order", 0),
            is_active=True,
        )
        db.add(db_ch)

    db.commit()
    return {"ok": True, "message": "Canais gratuitos padrão restaurados com sucesso."}
