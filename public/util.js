// Funções pequenas usadas por todas as telas (app, painel do posto, administração e recursos premium).
(function () {
  'use strict';

  /** Nome de cada combustível, na ordem em que aparecem nas tabelas. */
  const NOMES = {
    gasolina: 'Gasolina',
    gasolina_aditivada: 'Gasolina aditivada',
    etanol: 'Etanol',
    diesel: 'Diesel S500',
    diesel_s10: 'Diesel S10',
    gnv: 'GNV',
  };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reais = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',');
  const numero = (v) => Number(v).toFixed(2).replace('.', ',');
  /** Número com no máximo uma casa (12 → "12", 8.4 → "8,4"). */
  const decimal = (v) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const fmtKm = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`);
  /** Lê número digitado com vírgula ou ponto ("6,29" → 6.29). */
  const lerNumero = (s) => Number(String(s ?? '').trim().replace(',', '.'));

  function haQuanto(iso) {
    const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.round(h / 24);
    return d === 1 ? 'há 1 dia' : `há ${d} dias`;
  }

  function distanciaKm(a, b) {
    const R = 6371;
    const rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // Preferências guardadas só neste aparelho (localStorage, prefixo "pc.").
  const pref = {
    ler(k) {
      try { return localStorage.getItem('pc.' + k); } catch { return null; }
    },
    salvar(k, v) {
      try { localStorage.setItem('pc.' + k, v); } catch { /* sem armazenamento: tudo bem */ }
    },
    lerJson(k, padrao) {
      try { return JSON.parse(pref.ler(k)) ?? padrao; } catch { return padrao; }
    },
    salvarJson(k, v) { pref.salvar(k, JSON.stringify(v)); },
  };

  window.Util = { NOMES, esc, reais, numero, decimal, fmtKm, lerNumero, haQuanto, distanciaKm, pref };
})();
