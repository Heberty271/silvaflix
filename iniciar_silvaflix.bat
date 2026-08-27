@echo off
title SilvaFlix - Servidor de Streaming Familiar
echo ===================================================================
echo               INICIANDO SILVAFLIX STREAMING SERVER
echo ===================================================================
echo.

cd /d "%~dp0\backend"
echo [1/2] Iniciando Backend FastAPI na porta 8000...
start "SilvaFlix Backend" cmd /k ".\venv\Scripts\activate && uvicorn app.main:app --host 0.0.0.0 --port 8000"

timeout /t 3 >nul

echo [2/2] Conectando ao link publico fixo gratuito...
start "SilvaFlix Tunnel" cmd /k "npx --yes localtunnel --port 8000 --subdomain silvaflix-stream-br"

echo.
echo ===================================================================
echo   SILVAFLIX ESTA ONLINE E PRONTO PARA A FAMILIA!
echo   Link fixo da sua API: https://silvaflix-stream-br.loca.lt
echo ===================================================================
echo.
pause

