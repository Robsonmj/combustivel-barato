// Tira um PNG de cada proposta da página marca/propostas.html (Chrome sem janela).
// Uso: node marca/render.js
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PAGINA = 'file:///' + path.join(__dirname, 'propostas.html').replace(/\\/g, '/');
const SAIDA = path.join(__dirname, 'png');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(SAIDA, { recursive: true });
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'marca-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9334', `--user-data-dir=${perfil}`,
    '--no-first-run', '--hide-scrollbars', 'about:blank']);
  let ws;
  for (let i = 0; i < 40 && !ws; i++) {
    await espera(300);
    try {
      const alvos = await (await fetch('http://127.0.0.1:9334/json')).json();
      const pag = alvos.find((a) => a.type === 'page');
      if (pag) ws = pag.webSocketDebuggerUrl;
    } catch { /* subindo */ }
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
  const js = async (e) => (await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;

  await cmd('Page.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  await cmd('Page.navigate', { url: PAGINA });
  await espera(3000);
  await js('document.fonts.ready.then(() => 1)');
  await espera(800);
  const caixas = await js(`[...document.querySelectorAll('section')].map(s => { const r = s.getBoundingClientRect(); return { id: s.id, x: r.x, y: r.y + scrollY, w: r.width, h: r.height }; })`);
  for (const c of caixas) {
    const r = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: c.x, y: c.y, width: c.w, height: c.h, scale: 1 } });
    fs.writeFileSync(path.join(SAIDA, c.id + '.png'), Buffer.from(r.result.data, 'base64'));
    console.log('ok', c.id);
  }
  sock.close();
  proc.kill();
})();
