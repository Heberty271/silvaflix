@echo off
title SilvaFlix - Servidor de Streaming Familiar
cd /d "%~dp0\backend"

if exist ".\venv\Scripts\python.exe" (
    ".\venv\Scripts\python.exe" launcher.py
) else (
    python launcher.py
)

pause