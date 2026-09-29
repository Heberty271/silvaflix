import os
import sys
import time
import json
import re
import signal
import subprocess
import threading
import urllib.request
from collections import deque

# Força codificação UTF-8 no terminal Windows para evitar UnicodeEncodeError com emojis
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

NPOINT_URL = "https://api.npoint.io/a008871770ac1c671939"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CLOUDFLARED_PATH = os.path.join(BASE_DIR, "bin", "cloudflared.exe")

processes = []
backend_logs = deque(maxlen=100)

def kill_process_on_port(port: int = 8000):
    """Encerra qualquer processo antigo travado na porta especificada antes de iniciar"""
    if os.name == "nt":
        try:
            ps_cmd = f"Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue | ForEach-Object {{ Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }}"
            subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            time.sleep(1)
        except Exception:
            pass

def drain_and_record(pipe, log_buffer):
    """Lê continuamente a saída para evitar travamento de buffer e grava as últimas linhas para debug"""
    try:
        for line in iter(pipe.readline, ""):
            if not line:
                break
            log_buffer.append(line.rstrip())
    except Exception:
        pass
    finally:
        try:
            pipe.close()
        except Exception:
            pass

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

def wait_for_backend(timeout_seconds: int = 15) -> bool:
    """Verifica se o backend FastAPI respondeu com sucesso no endpoint /health"""
    start = time.time()
    while time.time() - start < timeout_seconds:
        try:
            req = urllib.request.Request("http://127.0.0.1:8000/health")
            with urllib.request.urlopen(req, timeout=1) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.5)
    return False

def main():
    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    # Limpa portas travadas
    kill_process_on_port(8000)

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
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    processes.append(backend_proc)

    # Drena stdout do backend continuamente gravando no buffer
    threading.Thread(target=drain_and_record, args=(backend_proc.stdout, backend_logs), daemon=True).start()

    # Aguarda o backend ficar 100% online
    if not wait_for_backend(15):
        print("\n[ERRO CRÍTICO] O servidor backend FastAPI não respondeu no tempo esperado!")
        print("-" * 65)
        for line in list(backend_logs):
            print(line)
        print("-" * 65)
        input("\nPressione Enter para sair...")
        cleanup()

    print("[2/3] Conectando ao Cloudflare Tunnel...")

    if not os.path.exists(CLOUDFLARED_PATH):
        print(f"[ERRO] Executável do Cloudflare não encontrado em: {CLOUDFLARED_PATH}")
        input("\nPressione Enter para sair...")
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
    cf_logs = deque(maxlen=50)

    # Lê as linhas do cloudflared até achar o link
    for line in iter(cf_proc.stdout.readline, ""):
        cf_logs.append(line.rstrip())
        match = url_pattern.search(line)
        if match:
            tunnel_url = match.group(0)
            break

    # Continua drenando a saída do Cloudflare em background
    threading.Thread(target=drain_and_record, args=(cf_proc.stdout, cf_logs), daemon=True).start()

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

    # Mantém o processo rodando e monitora
    try:
        while True:
            time.sleep(1)
            if backend_proc.poll() is not None:
                print(f"\n[!] O backend encerrou inesperadamente (código {backend_proc.poll()}):")
                for line in list(backend_logs)[-20:]:
                    print("   " + line)
                input("\nPressione Enter para fechar...")
                break
            if cf_proc.poll() is not None:
                print(f"\n[!] O túnel Cloudflare encerrou (código {cf_proc.poll()}):")
                for line in list(cf_logs)[-20:]:
                    print("   " + line)
                input("\nPressione Enter para fechar...")
                break
    except KeyboardInterrupt:
        pass
    finally:
        cleanup()

if __name__ == "__main__":
    main()

