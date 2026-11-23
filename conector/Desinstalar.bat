@echo off
powershell -NoProfile -ExecutionPolicy Bypass -Command "Unregister-ScheduledTask -TaskName 'AbasteceR Conector' -Confirm:$false -ErrorAction SilentlyContinue; Remove-Item -Recurse -Force \"$env:LOCALAPPDATA\AbasteceR\" -ErrorAction SilentlyContinue"
echo Conector AbasteceR removido deste computador.
pause
