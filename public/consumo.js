// Média do meu carro (Premium): calcula quantos km por litro o carro faz de verdade, a partir dos
// abastecimentos registrados com a quilometragem do painel (método do tanque cheio).
// Só cálculo, sem tela: a tela fica em premium.js. Funciona também no Node (para testar).
(function (raiz) {
  'use strict';

  const USOS = { cidade: 'Cidade', rodovia: 'Rodovia', misto: 'Misto' };

  /** Gasolina comum e aditivada rendem igual; o resto é o próprio combustível. */
  const familia = (comb) => (comb === 'gasolina_aditivada' ? 'gasolina' : comb);

  /**
   * Trechos medidos: de um tanque cheio até o próximo tanque cheio.
   * km rodados = km do painel no 2º tanque cheio − km no 1º; litros = tudo o que entrou depois do 1º
   * (inclui abastecimentos parciais no meio), que é o que o carro queimou no trecho.
   * O combustível queimado é o que foi colocado no 1º tanque cheio (e nos parciais do meio), não o do 2º.
   * O uso (cidade/rodovia/misto) é o informado no 2º ("desde o último abastecimento, rodei mais em…").
   * Trecho com gasolina e etanol misturados não entra nas médias de cada um.
   */
  function trechos(abastecimentos) {
    const lista = abastecimentos
      .filter((a) => Number(a.km) > 0 && Number(a.litros) > 0)
      .sort((x, y) => Date.parse(x.data) - Date.parse(y.data));
    const out = [];
    let inicio = null; // último tanque cheio
    let ultimoKm = 0;
    let litros = 0;
    let combs = new Set();
    for (const a of lista) {
      if (a.km <= ultimoKm) continue; // km menor que o anterior: erro de digitação, ignora o registro
      ultimoKm = a.km;
      if (inicio) litros += Number(a.litros);
      if (!a.cheio) {
        if (inicio) combs.add(familia(a.combustivel)); // parcial no meio do trecho: entra no tanque
        continue;
      }
      if (inicio) {
        const km = a.km - inicio.km;
        const kmL = km / litros;
        // descarta erro de digitação (km voltando, trecho absurdo)
        if (km >= 20 && km <= 3000 && kmL >= 2 && kmL <= 40) {
          out.push({
            de: inicio.data, ate: a.data, km, litros: Math.round(litros * 100) / 100,
            kmL: Math.round(kmL * 10) / 10,
            combustivel: combs.size === 1 ? [...combs][0] : 'mistura',
            uso: USOS[a.uso] ? a.uso : 'misto',
          });
        }
      }
      inicio = a;
      litros = 0;
      combs = new Set([familia(a.combustivel)]);
    }
    return out;
  }

  /** km/l ponderado (soma dos km ÷ soma dos litros) de uma lista de trechos. */
  function media(lista) {
    const km = lista.reduce((t, x) => t + x.km, 0);
    const l = lista.reduce((t, x) => t + x.litros, 0);
    return l ? { kmL: Math.round((km / l) * 10) / 10, trechos: lista.length, km } : null;
  }

  /** Médias por combustível (geral e por uso), só com trechos de um combustível só. */
  function medias(abastecimentos) {
    const ts = trechos(abastecimentos);
    const r = {};
    for (const t of ts) {
      if (t.combustivel === 'mistura') continue;
      (r[t.combustivel] ||= { todos: [], cidade: [], rodovia: [], misto: [] });
      r[t.combustivel].todos.push(t);
      r[t.combustivel][t.uso].push(t);
    }
    const out = {};
    for (const [comb, g] of Object.entries(r)) {
      out[comb] = { geral: media(g.todos), cidade: media(g.cidade), rodovia: media(g.rodovia), misto: media(g.misto) };
    }
    return { trechos: ts, porCombustivel: out };
  }

  /**
   * Etanol × gasolina com as médias medidas: custo de cada km = preço do litro ÷ km por litro.
   * Use os km/l do mesmo uso quando existir para os dois; senão, a média geral.
   */
  function comparar(m, precoGasolina, precoEtanol, uso) {
    const g = m.porCombustivel.gasolina;
    const e = m.porCombustivel.etanol;
    if (!g || !e || !(precoGasolina > 0) || !(precoEtanol > 0)) return null;
    const mesmoUso = uso && g[uso] && e[uso];
    const kmLG = (mesmoUso ? g[uso] : g.geral).kmL;
    const kmLE = (mesmoUso ? e[uso] : e.geral).kmL;
    const rsKmG = precoGasolina / kmLG;
    const rsKmE = precoEtanol / kmLE;
    return {
      uso: mesmoUso ? uso : null, kmLG, kmLE,
      rsKmG: Math.round(rsKmG * 1000) / 1000,
      rsKmE: Math.round(rsKmE * 1000) / 1000,
      melhor: rsKmE < rsKmG ? 'etanol' : 'gasolina',
      limite: Math.round((kmLE / kmLG) * 100), // etanol compensa até este % do preço da gasolina
    };
  }

  /** Último trecho bem abaixo da média do mesmo combustível e uso (sinal de manutenção). */
  function alertaConsumo(m) {
    const ts = m.trechos.filter((t) => t.combustivel !== 'mistura');
    const ult = ts[ts.length - 1];
    if (!ult) return null;
    const mesmos = ts.slice(0, -1).filter((t) => t.combustivel === ult.combustivel && t.uso === ult.uso);
    if (mesmos.length < 2) return null;
    const ref = media(mesmos).kmL;
    return ult.kmL < ref * 0.85 ? { ultimo: ult.kmL, media: ref, queda: Math.round((1 - ult.kmL / ref) * 100) } : null;
  }

  const Consumo = { USOS, familia, trechos, medias, comparar, alertaConsumo };
  if (typeof module !== 'undefined') module.exports = Consumo;
  else raiz.Consumo = Consumo;
})(typeof window !== 'undefined' ? window : globalThis);
