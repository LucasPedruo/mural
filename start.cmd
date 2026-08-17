@echo off
rem Sobe o painel de tasks e abre no navegador.
cd /d "%~dp0"
start "" http://localhost:4317
node server.js
