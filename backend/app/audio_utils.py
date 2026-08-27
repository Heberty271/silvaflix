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


def get_ffmpeg_binary() -> str:
    """Retorna o caminho do executável do FFmpeg embutido."""
    return imageio_ffmpeg.get_ffmpeg_exe()


def probe_audio_tracks(file_path: str) -> list[dict]:
    """Inspeciona o arquivo de vídeo e retorna todas as faixas de áudio disponíveis."""
    if not os.path.isfile(file_path):
        return []

    ffmpeg_bin = get_ffmpeg_binary()
    cmd = [ffmpeg_bin, "-hide_banner", "-i", file_path]

    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors="replace", timeout=10)
        output = res.stderr
    except Exception:
        return []

    # Procura por linhas do tipo:
    # Stream #0:1[0x2](por): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s (default)
    # Metadata:
    #   title           : Dublado
    # Stream #0:2[0x3](eng): Audio: ac3 (ac-3 / 0x332D6361), 48000 Hz, 5.1(side), fltp, 384 kb/s
    tracks = []
    stream_pattern = re.compile(r"Stream #0:(\d+)(?:\[0x[0-9a-fA-F]+\])?(?:\(([^)]+)\))?: Audio:\s*([a-zA-Z0-9_\-]+)(?:.*)", re.IGNORECASE)

    lines = output.splitlines()
    audio_index = 0

    for i, line in enumerate(lines):
        match = stream_pattern.search(line)
        if match:
            stream_id = int(match.group(1))
            lang_raw = (match.group(2) or "und").lower()
            codec = match.group(3).lower()

            # Tenta pegar título da metadata nas linhas seguintes
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
            })
            audio_index += 1

    # Se não identificou nada específico, retorna pelo menos 1 faixa padrão
    if not tracks:
        tracks.append({
            "index": 0,
            "stream_id": 1,
            "language": "und",
            "language_name": "Áudio Principal",
            "flag": "🎧",
            "title": "🎧 Áudio Principal",
            "codec": "aac",
        })

    return tracks

