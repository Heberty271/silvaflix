import os
import re
import subprocess
from typing import Optional
import imageio_ffmpeg

LANGUAGE_MAP = {
  "por": "Português",
  "pob": "Português (Brasil)",
  "pt": "Português",
  "pt-br": "Português (Brasil)",
  "eng": "Inglês",
  "en": "Inglês",
  "spa": "Espanhol",
  "es": "Espanhol",
  "jpn": "Japonês",
  "ja": "Japonês",
  "fra": "Francês",
  "fr": "Francês",
  "ger": "Alemão",
  "de": "Alemão",
  "ita": "Italiano",
  "it": "Italiano",
  "und": "Áudio Principal",
}

LANGUAGE_FLAGS = {
  "por": "🇧🇷",
  "pob": "🇧🇷",
  "pt": "🇧🇷",
  "pt-br": "🇧🇷",
  "eng": "🇺🇸",
  "en": "🇺🇸",
  "spa": "🇪🇸",
  "es": "🇪🇸",
  "jpn": "🇯🇵",
  "ja": "🇯🇵",
  "fra": "🇫🇷",
  "fr": "🇫🇷",
  "ger": "🇩🇪",
  "de": "🇩🇪",
  "ita": "🇮🇹",
  "it": "🇮🇹",
  "und": "🎧",
}


_MEDIA_PROBE_CACHE: dict[str, dict] = {}


def get_ffmpeg_binary() -> str:
    """Retorna o caminho do executável do FFmpeg embutido."""
    return imageio_ffmpeg.get_ffmpeg_exe()


def probe_media_info(file_path: str) -> dict:
    """Inspeciona o arquivo de vídeo (com cache em memória) e retorna codec de vídeo, pixel format e faixas de áudio."""
    if not os.path.isfile(file_path):
        return {"video_codec": None, "pix_fmt": None, "audio_tracks": [], "faststart": False}

    try:
        mtime = os.path.getmtime(file_path)
        cache_key = f"{file_path}:{mtime}"
        if cache_key in _MEDIA_PROBE_CACHE:
            return _MEDIA_PROBE_CACHE[cache_key]
    except Exception:
        cache_key = file_path

    ffmpeg_bin = get_ffmpeg_binary()
    cmd = [ffmpeg_bin, "-hide_banner", "-i", file_path]

    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors="replace", timeout=10)
        output = res.stderr
    except Exception:
        return {"video_codec": None, "pix_fmt": None, "audio_tracks": [], "faststart": False}

    # Detecta codec de vídeo e formato de pixel
    video_codec = None
    pix_fmt = None
    v_match = re.search(r"Stream #0:\d+.*?: Video:\s*([a-zA-Z0-9_\-]+)(.*)", output, re.IGNORECASE)
    if v_match:
        video_codec = v_match.group(1).lower()
        rest = v_match.group(2)
        if "yuv420p10" in rest.lower() or "10le" in rest.lower():
            pix_fmt = "yuv420p10le"
        elif "yuv420p" in rest.lower():
            pix_fmt = "yuv420p"

    # Verifica se MP4 possui átomo moov no cabeçalho (faststart)
    faststart = False
    if file_path.lower().endswith(".mp4"):
        try:
            with open(file_path, "rb") as f:
                head = f.read(65536)
            faststart = (b"ftyp" in head) and (b"moov" in head)
        except Exception:
            faststart = False

    tracks = []
    stream_pattern = re.compile(r"Stream #0:(\d+)(?:\[0x[0-9a-fA-F]+\])?(?:\(([^)]+)\))?: Audio:\s*([a-zA-Z0-9_\-]+)(.*)", re.IGNORECASE)

    lines = output.splitlines()
    audio_index = 0

    for i, line in enumerate(lines):
        match = stream_pattern.search(line)
        if match:
            stream_id = int(match.group(1))
            lang_raw = (match.group(2) or "und").lower()
            codec = match.group(3).lower()
            rest_audio = (match.group(4) or "").lower()
            is_surround = any(ch in rest_audio for ch in ("5.1", "7.1", "side", "quad", "6 channels"))

            title_meta = None
            for next_line in lines[i + 1 : i + 6]:
                if "Stream #" in next_line:
                    break
                title_match = re.search(r"title\s*:\s*(.+)", next_line, re.IGNORECASE)
                if title_match:
                    title_meta = title_match.group(1).strip()
                    break

            lang_name = LANGUAGE_MAP.get(lang_raw, lang_raw.upper())
            flag = LANGUAGE_FLAGS.get(lang_raw, "🎧")

            if title_meta:
                display_name = f"{flag} {lang_name} ({title_meta})"
            else:
                display_name = f"{flag} {lang_name} - Faixa {audio_index + 1}"

            tracks.append({
                "index": audio_index,
                "stream_id": stream_id,
                "language": lang_raw,
                "language_name": lang_name,
                "flag": flag,
                "title": display_name,
                "codec": codec,
                "is_surround": is_surround,
                "is_default": audio_index == 0,
            })
            audio_index += 1

    if not tracks:
        tracks.append({
            "index": 0,
            "stream_id": 1,
            "language": "und",
            "language_name": "Áudio Principal",
            "flag": "🎧",
            "title": "🎧 Áudio Principal",
            "codec": "aac",
            "is_surround": False,
            "is_default": True,
        })

    # Detecta duração exata em segundos
    duration_seconds = None
    dur_match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", output)
    if dur_match:
        try:
            h, m, s = dur_match.groups()
            duration_seconds = round(int(h) * 3600 + int(m) * 60 + float(s), 2)
        except Exception:
            pass

    info = {
        "video_codec": video_codec,
        "pix_fmt": pix_fmt,
        "audio_tracks": tracks,
        "faststart": faststart,
        "duration_seconds": duration_seconds,
    }
    _MEDIA_PROBE_CACHE[cache_key] = info
    return info


def probe_audio_tracks(file_path: str) -> list[dict]:
    """Inspeciona o arquivo de vídeo e retorna todas as faixas de áudio disponíveis."""
    return probe_media_info(file_path).get("audio_tracks", [])


