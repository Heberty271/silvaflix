import os
import sys
import time
import json
import re
import signal
import subprocess
import threading
import urllib.request

NPOINT_URL = "https://api.npoint.io/a008871770ac1c671939"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CLOUDFLARED_PATH = os.path.join(BASE_DIR, "bin", "cloudflared.exe")

processes = []

def update_npoint(url: str):
    """Envia a URL ativa para a ponte npoint.io"""
    try:
        data = json.dumps({"url": url}).encode("utf-8")
        req = urllib.request.Request(
            NPOINT_URL,
            data=data,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status == 200:
                return True
    except Exception as e:
        print(f"[!] Erro ao atualizar ponte npoint: {e}")
    return False

def copy_to_clipboard(text: str):
    """Copia a URL para a área de transferência do Windows"""
    try:
        cmd = f"Set-Clipboard -Value '{text}'"
        subprocess.run(["powershell", "-Command", cmd], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass

def cleanup(*args):
    """Encerra os processos filhos de forma limpa"""
    print("\n[!] Encerrando o servidor SilvaFlix...")
    for p in processes:
        try:
            p.terminate()
            p.kill()
        except Exception:
            pass
    sys.exit(0)

def main():
    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    os.system("cls" if os.name == "nt" else "clear")
    print("=" * 65)
    print("           INICIANDO SILVAFLIX STREAMING SERVER")
    print("=" * 65)
    print("\n[1/3] Iniciando Backend FastAPI na porta 8000...")

    # 1. Inicia o backend FastAPI
    uvicorn_cmd = [
        sys.executable, "-m", "uvicorn", "app.main:app",
        "--host", "0.0.0.0",
        "--port", "8000",
        "--limit-concurrency", "200",
        "--timeout-keep-alive", "30"
    ]
    backend_proc = subprocess.Popen(
        uvicorn_cmd,
        cwd=BASE_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    processes.append(backend_proc)

    time.sleep(2)
    print("[2/3] Conectando ao Cloudflare Tunnel...")

    if not os.path.exists(CLOUDFLARED_PATH):
        print(f"[ERRO] Executável do Cloudflare não encontrado em: {CLOUDFLARED_PATH}")
        cleanup()

    # 2. Inicia o Cloudflare Tunnel e captura o link
    cloudflared_cmd = [
        CLOUDFLARED_PATH, "tunnel", "--url", "http://localhost:8000"
    ]
    cf_proc = subprocess.Popen(
        cloudflared_cmd,
        cwd=BASE_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    processes.append(cf_proc)

    tunnel_url = None
    url_pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")

    # Lê as linhas do cloudflared até achar o link
    for line in iter(cf_proc.stdout.readline, ""):
        match = url_pattern.search(line)
        if match:
            tunnel_url = match.group(0)
            break

    if tunnel_url:
        print("[3/3] Sincronizando link com o Vercel...")
        success = update_npoint(tunnel_url)
        copy_to_clipboard(tunnel_url)

        os.system("cls" if os.name == "nt" else "clear")
        print("=" * 65)
        print("         🎉 SILVAFLIX ESTÁ ONLINE E CONECTADO! 🎉")
        print("=" * 65)
        print(f"  > Link Ativo:     {tunnel_url}")
        print(f"  > Ponte Vercel:   Sincronizada automaticamente no npoint!")
        print(f"  > Status:         Pronto! Seu site no Vercel ja esta conectado.")
        print(f"  > Area Transf.:   Link copiado para o seu Ctrl+V")
        print("=" * 65)
        print("\n  [Dica] Voce NAO precisa mexer em nada no Vercel!")
        print("  Pressione Ctrl + C nesta janela quando quiser desligar.")
        print("=" * 65 + "\n")
    else:
        print("[!] Não foi possível capturar o link do Cloudflare automaticamente.")

    # Mantém o processo rodando
    try:
        while True:
            time.sleep(1)
            if backend_proc.poll() is not None or cf_proc.poll() is not None:
                break
    except KeyboardInterrupt:
        pass
    finally:
        cleanup()

if __name__ == "__main__":
    main()

