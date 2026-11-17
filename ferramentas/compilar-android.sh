#!/usr/bin/env bash
# Compila e assina o app Android. Rodar no Git Bash, a partir da pasta do projeto:
#   node ferramentas/gerar-android.js <codigo> <versao>   (ex.: 2 1.0.1 — o código tem de subir a cada envio à Play)
#   bash ferramentas/compilar-android.sh
# Saída: play-store/arquivos/combustivel-barato.aab (enviar à Play) e .apk (instalar direto no celular para testar)
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-/c/Program Files/Eclipse Adoptium/jdk-21.0.13.9-hotspot}"
SDK="${ANDROID_HOME:-/c/Users/ROBSON/AppData/Local/Android/Sdk}"
BT="$SDK/build-tools/35.0.0"
CHAVE="$RAIZ/android-chave/upload.jks"
SENHA="$(sed -n 's/^Senha (do arquivo e da chave): //p' "$RAIZ/android-chave/LEIA-ME-SENHA.txt" | tr -d '\r')"
SAIDA="$RAIZ/play-store/arquivos"
mkdir -p "$SAIDA"

# compila fora do OneDrive (a sincronização trava os arquivos temporários do Gradle)
OBRA="${LOCALAPPDATA:-$HOME/AppData/Local}/combustivel-android"
OBRA="$(cygpath -u "$OBRA")"
mkdir -p "$OBRA"
rm -rf "$OBRA/app/src"
cp -r "$RAIZ/android/." "$OBRA/"
cd "$OBRA"
echo "sdk.dir=$(cygpath -m "$SDK")" > local.properties
./gradlew.bat bundleRelease assembleRelease --no-daemon -q

cp app/build/outputs/bundle/release/app-release.aab "$SAIDA/combustivel-barato.aab"
"$JAVA_HOME/bin/jarsigner.exe" -keystore "$CHAVE" -storepass "$SENHA" -keypass "$SENHA" \
  -sigalg SHA256withRSA -digestalg SHA-256 "$SAIDA/combustivel-barato.aab" upload > /dev/null

"$BT/zipalign.exe" -f -p 4 app/build/outputs/apk/release/app-release-unsigned.apk "$SAIDA/alinhado.apk"
"$BT/apksigner.bat" sign --ks "$CHAVE" --ks-pass "pass:$SENHA" --ks-key-alias upload --key-pass "pass:$SENHA" \
  --out "$SAIDA/combustivel-barato.apk" "$SAIDA/alinhado.apk"
rm -f "$SAIDA/alinhado.apk" "$SAIDA"/*.idsig
"$BT/apksigner.bat" verify "$SAIDA/combustivel-barato.apk" && echo "APK assinado OK"
"$JAVA_HOME/bin/jarsigner.exe" -verify "$SAIDA/combustivel-barato.aab" | head -1
ls -la "$SAIDA"
