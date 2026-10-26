@echo off
REM Atalho para ligar o site: basta dar dois cliques neste arquivo.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar.ps1"
pause
