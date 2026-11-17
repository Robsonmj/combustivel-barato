@echo off
chcp 65001 >nul
cd /d "%~dp0"
node src\publicar-do-pc.js >> dados\publicar.log 2>&1
