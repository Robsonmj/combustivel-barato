// Gera o projeto Android (Trusted Web Activity) do app, para a Google Play.
// Uso:  node ferramentas/gerar-android.js [codigoVersao] [nomeVersao]
// Requer o Bubblewrap instalado:  npm install -g @bubblewrap/cli
// Depois:  ferramentas\compilar-android.bat  (gera o .aab assinado)
'use strict';
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const globais = execSync('npm root -g').toString().trim();
const core = require(path.join(globais, '@bubblewrap/cli/node_modules/@bubblewrap/core'));

const RAIZ = path.join(__dirname, '..');
const DESTINO = path.join(RAIZ, 'android');
const SITE = 'https://robsonmj.github.io/combustivel-barato/';

(async () => {
  const codigo = Number(process.argv[2] || 1);
  const nome = process.argv[3] || `1.0.${codigo - 1}`;
  const web = JSON.parse(fs.readFileSync(path.join(RAIZ, 'public/manifest.webmanifest'), 'utf8'));
  const j = core.TwaManifest.fromWebManifestJson(new URL('manifest.webmanifest', SITE), web).toJson();

  j.packageId = 'io.github.robsonmj.combustivelbarato';
  j.name = 'Combustível Barato';
  j.launcherName = 'Combustível';
  j.appVersionCode = codigo;
  j.appVersion = nome;
  j.navigationColor = '#0f766e';
  j.navigationColorDark = '#0f766e';
  j.themeColorDark = '#111614';
  j.fallbackType = 'customtabs';
  j.enableSiteSettingsShortcut = false;
  j.signingKey = { path: path.join(RAIZ, 'android-chave/upload.jks'), alias: 'upload' };
  j.generatorApp = 'bubblewrap-cli';
  j.minSdkVersion = 24; // exigido pela biblioteca androidbrowserhelper 2.7+ (Android 7.0 ou mais novo)

  const twa = new core.TwaManifest(j);
  const erro = twa.validate();
  if (erro) throw new Error(erro);

  fs.mkdirSync(DESTINO, { recursive: true });
  await twa.saveToFile(path.join(DESTINO, 'twa-manifest.json'));
  const log = new core.ConsoleLog('android');
  await new core.TwaGenerator().createTwaProject(DESTINO, twa, log);
  console.log(`Projeto Android gerado em ${DESTINO} (versão ${nome}, código ${codigo}).`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
