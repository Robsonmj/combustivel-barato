// Gera as imagens da Google Play (capturas de tela 1080x1920 e gráfico de destaque 1024x500)
// usando o Chrome sem janela. Uso: node ferramentas/capturas.js
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SITE = 'https://robsonmj.github.io/combustivel-barato/';
const SAIDA = path.join(__dirname, '..', 'play-store', 'imagens');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(SAIDA, { recursive: true });
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'capt-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${perfil}`,
    '--no-first-run', '--hide-scrollbars', '--lang=pt-BR', 'about:blank']);
  let ws;
  for (let i = 0; i < 40 && !ws; i++) {
    await espera(300);
    try {
      const alvos = await (await fetch('http://127.0.0.1:9333/json')).json();
      const pag = alvos.find((a) => a.type === 'page');
      if (pag) ws = pag.webSocketDebuggerUrl;
    } catch { /* ainda subindo */ }
  }
  const sock = new WebSocket(ws);
  await new Promise((r) => sock.addEventListener('open', r));
  let id = 0;
  const pend = new Map();
  sock.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  });
  const cmd = (method, params = {}) => new Promise((r) => { const n = ++id; pend.set(n, r); sock.send(JSON.stringify({ id: n, method, params })); });
  const js = async (expr) => (await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const foto = async (nome) => {
    await js(`document.getElementById('instalar') && (document.getElementById('instalar').hidden = true); 1`);
    const r = await cmd('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SAIDA, nome), Buffer.from(r.result.data, 'base64'));
    console.log('ok', nome);
  };

  await cmd('Page.enable');
  await cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });

  // ---- celular 1080x1920 (360x640 x3) ----
  await cmd('Emulation.setDeviceMetricsOverride', { width: 360, height: 640, deviceScaleFactor: 3, mobile: true });
  await cmd('Emulation.setGeolocationOverride', { latitude: -24.7246, longitude: -53.7412, accuracy: 30 });
  await cmd('Browser.grantPermissions', { permissions: ['geolocation'], origin: 'https://robsonmj.github.io' }).catch(() => {});

  await cmd('Page.navigate', { url: SITE });
  await espera(6000);
  await foto('1-mapa-gasolina.png');

  await js(`document.getElementById('painel').classList.add('aberto'); 1`);
  await espera(1200);
  await foto('2-lista-mais-baratos.png');

  await js(`document.getElementById('painel').classList.remove('aberto'); [...document.querySelectorAll('.chip')].find(c => /Etanol/.test(c.textContent)).click(); 1`);
  await espera(3500);
  await foto('3-etanol-ou-gasolina.png');

  await js(`[...document.querySelectorAll('.chip')].find(c => /Gasolina/.test(c.textContent)).click(); 1`);
  await espera(3000);
  await js(`document.querySelector('.item:not(.patrocinado)').click(); 1`);
  await espera(2500);
  await foto('4-detalhe-do-posto.png');

  // Outra cidade: o GPS em Cascavel faz o app trocar de cidade sozinho
  await cmd('Emulation.setGeolocationOverride', { latitude: -24.9555, longitude: -53.4552, accuracy: 30 });
  await cmd('Page.navigate', { url: SITE });
  await espera(6000);
  await js(`const s = document.getElementById('cidade'); s.value = 'Cascavel'; s.dispatchEvent(new Event('change')); 1`);
  await espera(5000);
  await foto('5-outras-cidades.png');

  // ---- gráfico de destaque 1024x500 ----
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1024, height: 500, deviceScaleFactor: 1, mobile: false });
  const simbolo = fs.readFileSync(path.join(__dirname, '..', 'marca', 'final', 'abastecer-simbolo.svg'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, 'grafico-destaque.html'), 'utf8').replace('<!--SIMBOLO-->', simbolo);
  await cmd('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(html) });
  await espera(1500);
  await foto('grafico-destaque-1024x500.png');

  sock.close();
  proc.kill();
}
main().catch((e) => { console.error(e); process.exit(1); });
