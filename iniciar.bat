@echo off
chcp 65001 >nul
title Combustivel Barato - servidor
cd /d "%~dp0"
echo Iniciando o app... (deixe esta janela aberta)
start "" http://localhost:3000
node src\server.js
pause
