// Codifica/decodifica geohash (formato de localização usado pelo Menor Preço).
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

function encode(lat, lng, precisao = 7) {
  const latR = [-90, 90];
  const lngR = [-180, 180];
  let hash = '';
  let bit = 0;
  let ch = 0;
  let par = true;
  while (hash.length < precisao) {
    const r = par ? lngR : latR;
    const v = par ? lng : lat;
    const meio = (r[0] + r[1]) / 2;
    if (v > meio) {
      ch |= 1 << (4 - bit);
      r[0] = meio;
    } else {
      r[1] = meio;
    }
    par = !par;
    if (bit < 4) bit++;
    else {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

function decode(hash) {
  const latR = [-90, 90];
  const lngR = [-180, 180];
  let par = true;
  for (const c of String(hash).toLowerCase()) {
    const idx = BASE32.indexOf(c);
    if (idx < 0) throw new Error('geohash inválido: ' + hash);
    for (let b = 4; b >= 0; b--) {
      const r = par ? lngR : latR;
      const meio = (r[0] + r[1]) / 2;
      if ((idx >> b) & 1) r[0] = meio;
      else r[1] = meio;
      par = !par;
    }
  }
  return { lat: (latR[0] + latR[1]) / 2, lng: (lngR[0] + lngR[1]) / 2 };
}

module.exports = { encode, decode };
