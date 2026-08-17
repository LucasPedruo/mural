@echo off
rem Sobe o Mural e abre no navegador. Instala e compila na primeira execucao.
cd /d "%~dp0"

if not exist "node_modules" (
  echo Instalando dependencias...
  call npm install || exit /b 1
)

if not exist "dist\index.html" (
  echo Compilando a interface...
  call npm run build || exit /b 1
)

start "" http://localhost:4317
node server.js
