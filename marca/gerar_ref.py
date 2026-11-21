# Recria em vetor o modelo enviado por Robson (marca/referencia.png) e troca SÓ a bomba.
# O R verde, a gota e o nome "AbasteceR" são contornados direto da imagem; a bomba é desenhada à mão.
# Uso: python -I marca/gerar_ref.py   (gera marca/ref/*.svg e marca/ref/comparar.html)
import math
import os
import cv2
import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))
SAI = os.path.join(AQUI, 'ref')
os.makedirs(SAI, exist_ok=True)

im = cv2.imread(os.path.join(AQUI, 'referencia.png'))
hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
H, S, V = cv2.split(hsv)
verde = ((H >= 30) & (H <= 85) & (S > 120) & (V > 90))
ambar = ((H >= 5) & (H < 30) & (S > 120) & (V > 150))
escuro = (V < 110)


def contornos(mask, eps=0.35, externo=False, borra=1.3):
    """Máscara -> caminho SVG suave (borda tirada da máscara borrada e ampliada 4x)."""
    m = (mask.astype(np.uint8) * 255)
    m = cv2.GaussianBlur(m, (0, 0), borra)
    m = cv2.resize(m, None, fx=4, fy=4, interpolation=cv2.INTER_LINEAR)
    _, m = cv2.threshold(m, 127, 255, cv2.THRESH_BINARY)
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL if externo else cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    partes = []
    for c in cs:
        if cv2.contourArea(c) < 400:
            continue
        c = cv2.approxPolyDP(c, eps * 4, True)
        pts = c.reshape(-1, 2) / 4.0
        partes.append('M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + 'Z')
    return ' '.join(partes)


def componentes(mask, filtro):
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    out = np.zeros_like(mask)
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if a > 300 and filtro(x, y, w, h):
            out |= (lab == i)
    return out


# --- partes que ficam iguais ao modelo ---------------------------------------------
sombra = componentes(escuro, lambda x, y, w, h: x > 780 and y < 500)           # sombra dentro do R
r_mask = componentes(verde, lambda x, y, w, h: y < 840) | sombra
r_mask = cv2.dilate(r_mask.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
gota_cheia = componentes(ambar, lambda x, y, w, h: True)
gota_cheia = cv2.morphologyEx(gota_cheia.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8))
# brilho da gota = parte clara dentro da gota
claro = (im.min(axis=2) > 150) & ~ambar
brilho = componentes(claro & gota_cheia.astype(bool), lambda x, y, w, h: True)
texto_azul = componentes(escuro, lambda x, y, w, h: y > 840)
texto_verde = componentes(verde, lambda x, y, w, h: y > 840)

P_R = contornos(r_mask)
P_SOMBRA = contornos(cv2.morphologyEx(sombra.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)).astype(bool), 0.5, True, 4)
P_GOTA = contornos(gota_cheia.astype(bool), 0.35, True)
P_BRILHO = contornos(brilho, 0.3, True, 2)
P_TXT = contornos(texto_azul, 0.3)
P_TXT_R = contornos(texto_verde, 0.3)

AZUL = '#001B44'

DEFS = f'''
<linearGradient id="gGota" x1="500" y1="520" x2="690" y2="780" gradientUnits="userSpaceOnUse">
  <stop offset="0" stop-color="#FFE11A"/><stop offset=".45" stop-color="#FDC304"/><stop offset="1" stop-color="#FE8A08"/></linearGradient>
<radialGradient id="gR" cx="1000" cy="170" r="620" gradientUnits="userSpaceOnUse" gradientTransform="translate(1000 170) scale(1.8 1) translate(-1000 -170)">
  <stop offset="0" stop-color="#B8F404"/><stop offset=".22" stop-color="#7EE40C"/><stop offset=".42" stop-color="#2CCB22"/>
  <stop offset=".62" stop-color="#05AE37"/><stop offset="1" stop-color="#028C46"/></radialGradient>
<linearGradient id="gPerna" x1="0" y1="540" x2="0" y2="800" gradientUnits="userSpaceOnUse">
  <stop offset="0" stop-color="#1DC92B" stop-opacity="0"/><stop offset=".35" stop-color="#22CA26"/><stop offset="1" stop-color="#74E10A"/></linearGradient>
<linearGradient id="gSombra" x1="0" y1="340" x2="0" y2="480" gradientUnits="userSpaceOnUse">
  <stop offset="0" stop-color="#0A7A3A"/><stop offset="1" stop-color="#02623C"/></linearGradient>
<linearGradient id="gTela" x1="0" y1="352" x2="0" y2="462" gradientUnits="userSpaceOnUse">
  <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E4ECF5"/></linearGradient>
<linearGradient id="gCorpo" x1="452" y1="0" x2="744" y2="0" gradientUnits="userSpaceOnUse">
  <stop offset="0" stop-color="#0A2A5E"/><stop offset=".18" stop-color="{AZUL}"/><stop offset="1" stop-color="#00163A"/></linearGradient>
<clipPath id="cR"><path d="{P_R}" fill-rule="evenodd"/></clipPath>
'''

R_VERDE = f'''<g>
  <path d="{P_R}" fill="url(#gR)" fill-rule="evenodd"/>
  <rect x="640" y="530" width="420" height="290" fill="url(#gPerna)" clip-path="url(#cR)"/>
  <path d="{P_SOMBRA}" fill="url(#gSombra)"/>
</g>'''

GOTA = f'''<g>
  <path d="{P_GOTA}" fill="url(#gGota)"/>
  <path d="M566 566 C528 616 506 668 528 716 C534 724 546 720 541 708 C527 668 540 622 573 573 C576 566 570 561 566 566 Z" fill="#FFF8D6" opacity=".9"/>
</g>'''

NOME = f'<path d="{P_TXT}" fill="{AZUL}"/><path d="{P_TXT_R}" fill="#05BF1F"/>'


# --- a bomba (única parte redesenhada) --------------------------------------------------
# Corpo no mesmo lugar do modelo (x 452-744, topo 308, base 800), agora descendo reto (sem o triângulo).
CLARO = {'corpo': 'url(#gCorpo)', 'traco': AZUL, 'friso': '#2C4C80', 'moldura': '#FFFFFF', 'tela': '#0B2A5C', 'vazado': '#FFFFFF'}
NEGATIVO = {'corpo': 'url(#gCorpoNeg)', 'traco': '#FFFFFF', 'friso': '#C9D6E8', 'moldura': AZUL, 'tela': '#0B2A5C', 'vazado': AZUL}


def corpo(c, v=2):
    if v == 7:   # topo em arco (bomba retrô)
        d = 'M452 800 V430 C452 352 514 308 598 308 C682 308 744 352 744 430 V800 Z'
    else:
        d = 'M452 800 V342 Q452 308 486 308 H710 Q744 308 744 342 V800 Z'
    return f'<path d="{d}" fill="{c["corpo"]}"/>'


def rot(px, py, ang, ox, oy):
    a = math.radians(ang)
    return ox + px * math.cos(a) - py * math.sin(a), oy + px * math.sin(a) + py * math.cos(a)


def bico(ox, oy, ang, c):
    """Pistola em coordenadas locais: x ao longo do bico (cabeça->cabo), y<0 = lado da bomba."""
    corpo_b = ('<path d="M-8 -38 Q-8 -46 2 -46 H112 Q132 -46 140 -28 L162 24 Q166 38 150 38 H2 Q-8 38 -8 28 Z"/>'
               '<rect x="154" y="-26" width="32" height="52" rx="10"/>'
               f'<rect x="40" y="-30" width="74" height="22" rx="11" fill="{c["vazado"]}"/>')
    return f'<g transform="translate({ox} {oy}) rotate({ang})" fill="{c["traco"]}">{corpo_b}</g>'


def visor(v, c):
    m = (f'<rect x="487" y="350" width="212" height="114" rx="18" fill="{c["moldura"]}"/>'
         f'<rect x="503" y="364" width="180" height="86" rx="10" fill="{c["tela"]}"/>')
    if v == 7:   # visor redondo da bomba retrô
        return (f'<circle cx="598" cy="410" r="66" fill="{c["moldura"]}"/><circle cx="598" cy="410" r="52" fill="{c["tela"]}"/>'
                '<text x="598" y="430" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" '
                'font-size="50" fill="#7CE30B">R$</text>')
    if v == 8:   # visor baixo + 3 botões (etanol, gasolina, diesel)
        return (f'<rect x="487" y="336" width="212" height="92" rx="16" fill="{c["moldura"]}"/>'
                f'<rect x="501" y="348" width="184" height="68" rx="9" fill="{c["tela"]}"/>'
                '<text x="593" y="400" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" '
                'font-size="46" fill="#7CE30B">R$</text>'
                '<circle cx="540" cy="460" r="14" fill="#2FD12A"/><circle cx="593" cy="460" r="14" fill="#FDC304"/>'
                '<circle cx="646" cy="460" r="14" fill="#3B8BEB"/>')
    if v == 4:   # preço digital
        return m + ('<text x="593" y="425" text-anchor="middle" font-family="Consolas, Courier New, monospace" '
                    'font-weight="700" font-size="56" fill="#7CE30B">5,79</text>')
    if v == 6:   # R$ menor + linhas de leitura
        return m + ('<text x="522" y="420" font-family="Arial Black, Arial, sans-serif" font-weight="900" '
                    'font-size="40" fill="#7CE30B">R$</text>'
                    '<rect x="612" y="390" width="56" height="12" rx="6" fill="#7CE30B"/>'
                    '<rect x="612" y="410" width="36" height="12" rx="6" fill="#7CE30B" opacity=".55"/>')
    return m + ('<text x="593" y="427" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" '
                'font-weight="900" font-size="54" fill="#7CE30B" letter-spacing="2">R$</text>')


def bomba(v, c=CLARO):
    T = c['traco']
    out = [corpo(c, v)]
    if v != 7:
        out.append(f'<path d="M470 356 Q470 328 496 326 H522" fill="none" stroke="{c["friso"]}" stroke-width="8" stroke-linecap="round" opacity=".8"/>')
    if v == 6:   # base mais larga
        out.append(f'<rect x="436" y="772" width="324" height="28" rx="10" fill="{T}"/>')
    out.append(visor(v, c))
    if v == 9:   # mangueira sai do alto da bomba, faz um laço e o bico fica pendurado embaixo
        out.append(f'<rect x="428" y="352" width="32" height="44" rx="10" fill="{T}"/>')
        ox, oy, ang = 300, 712, -84
        tx, ty = rot(186, 0, ang, ox, oy)
        out.append(f'<path d="M440 374 C 340 352, 268 410, {tx:.0f} {ty:.0f}" fill="none" stroke="{T}" stroke-width="32" stroke-linecap="round"/>')
        hx, hy = rot(-2, 10, ang, ox, oy)
        out.append(f'<path d="M{hx:.0f} {hy:.0f} C {hx:.0f} {hy+44:.0f}, {hx+40:.0f} {hy+60:.0f}, {hx+70:.0f} {hy+46:.0f}" fill="none" stroke="{T}" stroke-width="24" stroke-linecap="round"/>')
        out.append(bico(ox, oy, ang, c))
        return '\n'.join(out)
    if v == 7:   # bico e mangueira um pouco mais baixos, acompanhando o topo em arco
        ox, oy, ang = 350, 432, 116
        out.append(f'<rect x="426" y="394" width="34" height="46" rx="10" fill="{T}"/>')
        hx, hy = rot(-4, -4, ang, ox, oy)
        out.append(f'<path d="M{hx:.0f} {hy:.0f} C {hx+14:.0f} {hy-34:.0f}, 392 406, 432 410" fill="none" stroke="{T}" stroke-width="24" stroke-linecap="round"/>')
        out.append(bico(ox, oy, ang, c))
        tx, ty = rot(184, 0, ang, ox, oy)
        hose = f'M{tx:.0f} {ty:.0f} C {tx-30:.0f} {ty+70:.0f}, {tx-30:.0f} 740, 320 756 C 360 772, 414 766, 452 748'
    elif v == 5:   # bico pendurado em pé no coldre, rente à lateral da bomba
        ox, oy, ang = 404, 360, 97
        out.append(f'<rect x="430" y="330" width="30" height="60" rx="10" fill="{T}"/>')
        hx, hy = rot(-6, -18, ang, ox, oy)
        out.append(f'<path d="M{hx:.0f} {hy:.0f} C {hx:.0f} {hy-40:.0f}, 418 322, 446 336" fill="none" stroke="{T}" stroke-width="24" stroke-linecap="round"/>')
        out.append(bico(ox, oy, ang, c))
        tx, ty = rot(186, 0, ang, ox, oy)
        hose = f'M{tx:.0f} {ty:.0f} C {tx-10:.0f} {ty+70:.0f}, 300 640, 300 700 C 300 760, 400 768, 452 748'
    else:
        ox, oy, ang = 350, 362, 116
        out.append(f'<rect x="426" y="324" width="34" height="46" rx="10" fill="{T}"/>')
        hx, hy = rot(-4, -4, ang, ox, oy)
        out.append(f'<path d="M{hx:.0f} {hy:.0f} C {hx+14:.0f} {hy-34:.0f}, 392 336, 432 340" fill="none" stroke="{T}" stroke-width="24" stroke-linecap="round"/>')
        out.append(bico(ox, oy, ang, c))
        tx, ty = rot(184, 0, ang, ox, oy)
        hose = f'M{tx:.0f} {ty:.0f} C {tx-42:.0f} {ty+92:.0f}, {tx-44:.0f} 730, 300 754 C 346 780, 410 770, 452 748'
    out.append(f'<path d="{hose}" fill="none" stroke="{T}" stroke-width="32" stroke-linecap="round"/>')
    out.append(f'<rect x="430" y="722" width="30" height="52" rx="9" fill="{T}"/>')
    return '\n'.join(out)


NEG_DEFS = ('<linearGradient id="gCorpoNeg" x1="452" y1="0" x2="744" y2="0" gradientUnits="userSpaceOnUse">'
            '<stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#DCE5F0"/></linearGradient>')


def svg(conteudo, vb='0 0 1254 1254', fundo=None):
    f = f'<rect x="-2000" y="-2000" width="6000" height="6000" fill="{fundo}"/>' if fundo else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">'
            f'<defs>{DEFS}{NEG_DEFS}</defs>{f}{conteudo}</svg>')


def logo(v, com_nome=True, c=CLARO):
    # R primeiro; a bomba vem por cima e corta o R reto na lateral
    partes = [R_VERDE, bomba(v, c), GOTA]
    if com_nome:
        partes.append(NOME)
    return '\n'.join(partes)


VERSOES = {2: 'Visor R$ (refinada)', 4: 'Preço digital', 5: 'Bico no coldre', 6: 'Base larga',
           7: 'Retrô (topo em arco)', 8: 'Visor + 3 combustíveis', 9: 'Mangueira em laço'}
VB_ICONE = '150 110 940 940'
FUNDOS = {'branco': '#FFFFFF', 'azul': '#DCE7F5', 'verde': '#E3F6DF', 'creme': '#FFF3D1'}
cards = ['<section id="ref_original"><h2>Seu modelo (original)</h2><img src="../referencia.png" width="560"></section>']
for v, nome in VERSOES.items():
    open(os.path.join(SAI, f'logo_{v}.svg'), 'w', encoding='utf-8').write(svg(logo(v)))
    for k, cor in FUNDOS.items():
        open(os.path.join(SAI, f'icone_{v}_{k}.svg'), 'w', encoding='utf-8').write(svg(logo(v, False), VB_ICONE, cor))
    cards.append(f'<section id="ref_{v}"><h2>Bomba {v} · {nome}</h2>'
                 f'<img src="logo_{v}.svg" width="560">'
                 '<p>Ícone do app: branco · azul-claro (tom sobre tom) · verde-claro · creme · tamanhos pequenos</p><div class="mini">'
                 + ''.join(f'<img class="ic" src="icone_{v}_{k}.svg">' for k in FUNDOS)
                 + f'<img class="ic pp" src="icone_{v}_azul.svg"></div></section>')
html = ('<!doctype html><meta charset="utf-8"><title>AbasteceR · bomba</title><style>'
        'body{margin:0;padding:20px;background:#eef1f5;font-family:Arial;display:flex;flex-wrap:wrap;gap:20px}'
        'section{background:#fff;border-radius:16px;padding:18px;width:560px} h2{margin:0 0 8px;font-size:22px;color:#001B44}'
        'p{margin:6px 0 0;color:#5a6577;font-size:14px} img{display:block} .mini{display:flex;gap:16px;align-items:end;margin-top:10px}'
        '.ic{width:96px;height:96px;border-radius:28px;box-shadow:0 0 0 1px #dde3ea}'
        '.ic.p{width:64px;height:64px;border-radius:15px} .ic.pp{width:40px;height:40px;border-radius:10px}</style>'
        + ''.join(cards))
open(os.path.join(SAI, 'comparar.html'), 'w', encoding='utf-8').write(html)
print('ok')
