# Rodada "bomba em A": a bomba vira a letra A, a gota é o vão do A (ponta = bico de dentro do A,
# parte larga = abertura de baixo), a barra do A cruza a gota e a base da bomba encosta na perna do R com seta.
# Uso: python -I marca/gerar_a.py   (gera marca/bomba_a/*.svg e comparar.html)
import os

AQUI = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(AQUI, 'gerar_amarelo.py'), encoding='utf-8').read())  # R_VERDE, seta(), svg2(), NOME...

SAI3 = os.path.join(AQUI, 'bomba_a')
os.makedirs(SAI3, exist_ok=True)

# A: topo em (538..658, 308); perna esquerda até (410, 800); perna direita até (900, 800),
# quase paralela à perna do R, para a base "entrar" por baixo da seta.
def corpo_a(pontudo=False, topo=62):
    if pontudo:
        d = 'M410 800 L578 322 Q598 290 618 322 L900 800 Z'
    else:
        L, R = 598 - topo, 598 + topo
        d = f'M410 800 L{L-6} 330 Q{L} 308 {L+24} 308 H{R-24} Q{R} 308 {R+6} 330 L900 800 Z'
    return f'<path d="{d}" fill="url(#gCorpo)" stroke="url(#gCorpo)" stroke-width="6" stroke-linejoin="round"/>'


GOTA_A = ('<path d="M600 452 C622 520 714 598 714 686 A114 114 0 0 1 486 686 C486 598 578 520 600 452 Z" fill="url(#gGotaA)"/>'
          '<path d="M572 560 C548 600 530 650 538 700 C540 712 552 712 552 700 C548 656 562 610 582 572 C588 560 578 552 572 560 Z" fill="#FFF8D6" opacity=".9"/>')
GRAD_A = ('<linearGradient id="gGotaA" x1="500" y1="470" x2="700" y2="800" gradientUnits="userSpaceOnUse">'
          '<stop offset="0" stop-color="#FFE11A"/><stop offset=".45" stop-color="#FDC304"/><stop offset="1" stop-color="#FE8A08"/></linearGradient>')


def barra(cor, fim=726, alt=40):
    # barra do A: sai da perna esquerda e entra na gota; com fim < 714 ela para antes da borda direita
    y = 626 - alt / 2
    return f'<rect x="460" y="{y:.0f}" width="{fim - 460}" height="{alt}" rx="{min(alt / 2, 22):.0f}" fill="{cor}"/>'


def visor_a(larg=140, tela='R$'):
    if larg != 140 or tela != 'R$':
        x = 600 - larg / 2
        out = (f'<rect x="{x:.0f}" y="338" width="{larg}" height="84" rx="14" fill="#FFFFFF"/>'
               f'<rect x="{x+12:.0f}" y="350" width="{larg-24}" height="60" rx="8" fill="#0B2A5C"/>')
        if tela.startswith('cifrao'):
            cor = '#7CE30B' if tela == 'cifrao_verde' else '#FFD43B'
            out += (f'<text x="600" y="397" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" '
                    f'font-weight="900" font-size="46" letter-spacing="3" fill="{cor}">R$</text>')
        if tela == 'linhas':
            out += (f'<rect x="{x+30:.0f}" y="366" width="{(larg-60)*0.7:.0f}" height="11" rx="5.5" fill="#7CE30B"/>'
                    f'<rect x="{x+30:.0f}" y="384" width="{(larg-60)*0.45:.0f}" height="11" rx="5.5" fill="#7CE30B" opacity=".55"/>')
        return out
    return ('<rect x="530" y="336" width="140" height="84" rx="14" fill="#FFFFFF"/>'
            '<rect x="542" y="348" width="116" height="60" rx="8" fill="#0B2A5C"/>'
            '<text x="600" y="393" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" '
            'font-size="38" fill="#7CE30B">R$</text>')


def mangueira_bico(dx=0):
    # bico pendurado no coldre da perna esquerda do A; mangueira volta até a base
    ox, oy, ang = 406 + dx, 448, 116
    out = [f'<rect x="{482 + dx}" y="410" width="34" height="46" rx="10" fill="{AZUL}"/>']
    hx, hy = rot(-4, -4, ang, ox, oy)
    out.append(f'<path d="M{hx:.0f} {hy:.0f} C {hx+14:.0f} {hy-34:.0f}, {448 + dx} 422, {488 + dx} 426" fill="none" stroke="{AZUL}" stroke-width="24" stroke-linecap="round"/>')
    out.append(bico(ox, oy, ang, CLARO))
    tx, ty = rot(184, 0, ang, ox, oy)
    out.append(f'<path d="M{tx:.0f} {ty:.0f} C {tx-42:.0f} {ty+92:.0f}, {tx-44:.0f} 742, {tx+6:.0f} 772 C {360 + dx/2:.0f} 792, 404 784, 428 762" '
               f'fill="none" stroke="{AZUL}" stroke-width="32" stroke-linecap="round"/>')
    out.append(f'<rect x="408" y="734" width="30" height="52" rx="9" fill="{AZUL}"/>')
    return '\n'.join(out)


def logo_a(variante, com_nome=True, fim=726, alt=40, topo=62, tela='R$'):
    pontudo = variante == 2
    mascara, ponta = seta(175, 'url(#gSeta)')
    borda = (598 - topo - 6) - (598 - topo - 6 - 410) * (100 / 470)   # perna esquerda na altura do coldre
    dx = 34 if pontudo else round(borda - 28 - 482)
    partes = [mascara, corpo_a(pontudo, topo), mangueira_bico(dx)]
    if not pontudo:
        partes.append(visor_a(140 if topo == 62 and tela == 'R$' else 2 * topo - 40, tela))
    partes += [f'<g mask="url(#mSeta)">{R_VERDE}</g>', ponta, GOTA_A,
               barra('url(#gSeta)' if variante == 3 else AZUL, fim, alt)]
    if com_nome:
        partes.append(NOME)
    return '\n'.join(partes)


def svg3(conteudo, vb='0 0 1254 1254', fundo=None):
    f = f'<rect x="-2000" y="-2000" width="6000" height="6000" fill="{fundo}"/>' if fundo else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">'
            f'<defs>{DEFS}{NEG_DEFS}{GRAD_SETA}{GRAD_A}</defs>{f}{conteudo}</svg>')


OPC_A = {1: 'A com visor R$', 2: 'A pontudo (sem visor)', 3: 'A com visor + barra verde'}
BARRAS = {'1b': ('barra larga até 2/3 da gota', 655, 60), '1c': ('barra mais larga até o meio da gota', 625, 74), '1d': ('barra larga até 3/4 da gota', 675, 56)}
cards = []
for v, nome in OPC_A.items():
    open(os.path.join(SAI3, f'logo_a{v}.svg'), 'w', encoding='utf-8').write(svg3(logo_a(v)))
    open(os.path.join(SAI3, f'icone_a{v}.svg'), 'w', encoding='utf-8').write(svg3(logo_a(v, False), VB_ICONE, AMARELO))
    cards.append(f'<section id="a{v}"><h2>A{v} · {nome}</h2><div class="lado">'
                 f'<img class="logo" src="logo_a{v}.svg">'
                 f'<div class="ics"><img class="ic" src="icone_a{v}.svg"><img class="ic p" src="icone_a{v}.svg">'
                 f'<img class="ic pp" src="icone_a{v}.svg"></div></div></section>')
html = ('<!doctype html><meta charset="utf-8"><title>AbasteceR · bomba em A</title><style>'
        'body{margin:0;padding:20px;background:#eef1f5;font-family:Arial;display:flex;flex-wrap:wrap;gap:20px}'
        'section{background:#fff;border-radius:16px;padding:18px;width:620px} h2{margin:0 0 8px;font-size:20px;color:#001B44}'
        '.lado{display:flex;gap:14px;align-items:center} img{display:block} .logo{width:380px;height:380px}'
        '.ics{display:flex;flex-direction:column;gap:12px;align-items:center}'
        '.ic{width:180px;height:180px;border-radius:40px;box-shadow:0 2px 8px rgba(0,0,0,.18)}'
        '.ic.p{width:64px;height:64px;border-radius:15px} .ic.pp{width:40px;height:40px;border-radius:10px}</style>'
        + ''.join(cards))
open(os.path.join(SAI3, 'comparar.html'), 'w', encoding='utf-8').write(html)
cards2 = []
for k, (nome, fim, alt) in BARRAS.items():
    open(os.path.join(SAI3, f'logo_a{k}.svg'), 'w', encoding='utf-8').write(svg3(logo_a(1, True, fim, alt)))
    open(os.path.join(SAI3, f'icone_a{k}.svg'), 'w', encoding='utf-8').write(svg3(logo_a(1, False, fim, alt), VB_ICONE, AMARELO))
    cards2.append(f'<section id="a{k}"><h2>A1 · {nome}</h2><div class="lado">'
                  f'<img class="logo" src="logo_a{k}.svg">'
                  f'<div class="ics"><img class="ic" src="icone_a{k}.svg"><img class="ic p" src="icone_a{k}.svg">'
                  f'<img class="ic pp" src="icone_a{k}.svg"></div></div></section>')
open(os.path.join(SAI3, 'comparar_barra.html'), 'w', encoding='utf-8').write(html.split('</style>')[0] + '</style>' + ''.join(cards2))
LARGOS = {'e1': ('topo largo, visor liso', 100, 'liso'), 'e2': ('topo bem largo, visor liso', 120, 'liso'),
          'e3': ('topo bem largo, visor com linhas', 120, 'linhas'),
          'e2v': ('topo bem largo, R$ verde', 120, 'cifrao_verde'), 'e2a': ('topo bem largo, R$ amarelo', 120, 'cifrao_amarelo')}
cards3 = []
for k, (nome, topo, tela) in LARGOS.items():
    open(os.path.join(SAI3, f'logo_{k}.svg'), 'w', encoding='utf-8').write(svg3(logo_a(1, True, 675, 56, topo, tela)))
    open(os.path.join(SAI3, f'icone_{k}.svg'), 'w', encoding='utf-8').write(svg3(logo_a(1, False, 675, 56, topo, tela), VB_ICONE, AMARELO))
    cards3.append(f'<section id="{k}"><h2>{k.upper()} · {nome}</h2><div class="lado">'
                  f'<img class="logo" src="logo_{k}.svg">'
                  f'<div class="ics"><img class="ic" src="icone_{k}.svg"><img class="ic p" src="icone_{k}.svg">'
                  f'<img class="ic pp" src="icone_{k}.svg"></div></div></section>')
open(os.path.join(SAI3, 'comparar_largo.html'), 'w', encoding='utf-8').write(html.split('</style>')[0] + '</style>' + ''.join(cards3))
print('ok bomba A')


# --- rodada X: visor = parte de cima do A, gota menor embaixo, R$ amarelo -------------------------
def xl(y):  # borda esquerda do A (topo 120)
    return 472 - 62 * (y - 330) / 470


def xr(y):  # borda direita do A
    return 724 + 176 * (y - 330) / 470


def visor_topo():
    f = lambda x, y: f'{x:.0f} {y:.0f}'
    t, b = 328, 452
    moldura = f'M{f(xl(t)+20, t)} L{f(xr(t)-20, t)} L{f(xr(b)-26, b)} L{f(xl(b)+26, b)} Z'
    t2, b2 = t + 13, b - 13
    tela = f'M{f(xl(t2)+34, t2)} L{f(xr(t2)-34, t2)} L{f(xr(b2)-40, b2)} L{f(xl(b2)+40, b2)} Z'
    return (f'<path d="{moldura}" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="16" stroke-linejoin="round"/>'
            f'<path d="{tela}" fill="#0B2A5C" stroke="#0B2A5C" stroke-width="10" stroke-linejoin="round"/>'
            '<text x="606" y="412" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" '
            'font-size="62" letter-spacing="4" fill="#FFD43B">R$</text>')


def gota_em(cx, tip, r):
    cy = 800 - r
    k = r / 114
    corpo = (f'<path d="M{cx} {tip} C{cx+22*k:.0f} {tip+(cy-tip)*0.29:.0f} {cx+r} {cy-(cy-tip)*0.38:.0f} {cx+r} {cy} '
             f'A{r} {r} 0 0 1 {cx-r} {cy} C{cx-r} {cy-(cy-tip)*0.38:.0f} {cx-22*k:.0f} {tip+(cy-tip)*0.29:.0f} {cx} {tip} Z" fill="url(#gGotaA)"/>')
    hx, hy = cx - 0.45 * r, cy - 0.2 * r
    brilho = (f'<path d="M{hx+10*k:.0f} {hy-60*k:.0f} C{hx-6*k:.0f} {hy-30*k:.0f} {hx-14*k:.0f} {hy:.0f} {hx-8*k:.0f} {hy+30*k:.0f}" '
              f'fill="none" stroke="#FFF8D6" stroke-width="{max(10, 15*k):.0f}" stroke-linecap="round" opacity=".9"/>')
    return corpo + brilho


def logo_x(tip, r, barra_y, fim, alt, com_nome=True):
    mascara, ponta = seta(175, 'url(#gSeta)')
    borda = xl(430)
    partes = [mascara, corpo_a(False, 120), mangueira_bico(round(borda - 28 - 482)), visor_topo(),
              f'<g mask="url(#mSeta)">{R_VERDE}</g>', ponta, gota_em(606, tip, r),
              f'<rect x="440" y="{barra_y - alt/2:.0f}" width="{fim - 440}" height="{alt}" rx="{alt/2:.0f}" fill="url(#gCorpo)"/>']
    if com_nome:
        partes.append(NOME)
    return '\n'.join(partes)


OPC_X = {'x1': ('gota média embaixo', 520, 96, 640, 676, 52), 'x2': ('gota pequena embaixo', 575, 80, 676, 668, 46)}
cards4 = []
for k, (nome, tip, r, by, fim, alt) in OPC_X.items():
    open(os.path.join(SAI3, f'logo_{k}.svg'), 'w', encoding='utf-8').write(svg3(logo_x(tip, r, by, fim, alt)))
    open(os.path.join(SAI3, f'icone_{k}.svg'), 'w', encoding='utf-8').write(svg3(logo_x(tip, r, by, fim, alt, False), VB_ICONE, AMARELO))
    cards4.append(f'<section id="{k}"><h2>{k.upper()} · visor no topo do A, R$ amarelo, {nome}</h2><div class="lado">'
                  f'<img class="logo" src="logo_{k}.svg">'
                  f'<div class="ics"><img class="ic" src="icone_{k}.svg"><img class="ic p" src="icone_{k}.svg">'
                  f'<img class="ic pp" src="icone_{k}.svg"></div></div></section>')
open(os.path.join(SAI3, 'comparar_x.html'), 'w', encoding='utf-8').write(html.split('</style>')[0] + '</style>' + ''.join(cards4))
print('ok rodada X')


# --- rodada Y: visor menor, em triângulo (o "vão de cima" do A) ----------------------------------
def visor_triangulo(ap=356, base=498, meia=100):
    cx = 606
    f = lambda x, y: f'{x:.0f} {y:.0f}'
    moldura = f'M{f(cx, ap)} L{f(cx+meia, base)} L{f(cx-meia, base)} Z'
    k = 15  # espessura da moldura
    tela = f'M{f(cx, ap+2.2*k)} L{f(cx+meia-1.9*k, base-k)} L{f(cx-meia+1.9*k, base-k)} Z'
    return (f'<path d="{moldura}" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="22" stroke-linejoin="round"/>'
            f'<path d="{tela}" fill="#0B2A5C" stroke="#0B2A5C" stroke-width="12" stroke-linejoin="round"/>'
            f'<text x="{cx}" y="{base - k - 14}" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" '
            'font-weight="900" font-size="40" letter-spacing="2" fill="#FFD43B">R$</text>')


def logo_y(tip, r, barra_y, fim, alt, com_nome=True):
    return logo_x(tip, r, barra_y, fim, alt, com_nome).replace(visor_topo(), visor_triangulo())


cards5 = []
for k, (nome, tip, r, by, fim, alt) in OPC_X.items():
    ky = k.replace('x', 'y')
    open(os.path.join(SAI3, f'logo_{ky}.svg'), 'w', encoding='utf-8').write(svg3(logo_y(tip, r, by, fim, alt)))
    open(os.path.join(SAI3, f'icone_{ky}.svg'), 'w', encoding='utf-8').write(svg3(logo_y(tip, r, by, fim, alt, False), VB_ICONE, AMARELO))
    cards5.append(f'<section id="{ky}"><h2>{ky.upper()} · visor em triângulo, {nome}</h2><div class="lado">'
                  f'<img class="logo" src="logo_{ky}.svg">'
                  f'<div class="ics"><img class="ic" src="icone_{ky}.svg"><img class="ic p" src="icone_{ky}.svg">'
                  f'<img class="ic pp" src="icone_{ky}.svg"></div></div></section>')
open(os.path.join(SAI3, 'comparar_y.html'), 'w', encoding='utf-8').write(html.split('</style>')[0] + '</style>' + ''.join(cards5))
print('ok rodada Y')


# --- rodada Z: visor no formato do X2 (trapézio que segue as pernas do A), só que menor -------------
def visor_trap(t, b, ins, fonte=48):
    f = lambda x, y: f'{x:.0f} {y:.0f}'
    moldura = f'M{f(xl(t)+ins, t)} L{f(xr(t)-ins, t)} L{f(xr(b)-ins, b)} L{f(xl(b)+ins, b)} Z'
    k = 12
    t2, b2, i2 = t + k, b - k, ins + k + 4
    tela = f'M{f(xl(t2)+i2, t2)} L{f(xr(t2)-i2, t2)} L{f(xr(b2)-i2, b2)} L{f(xl(b2)+i2, b2)} Z'
    cx = (xl((t + b) / 2) + xr((t + b) / 2)) / 2
    return (f'<path d="{moldura}" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="14" stroke-linejoin="round"/>'
            f'<path d="{tela}" fill="#0B2A5C" stroke="#0B2A5C" stroke-width="8" stroke-linejoin="round"/>'
            f'<text x="{cx:.0f}" y="{(t + b) / 2 + fonte * 0.36:.0f}" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" '
            f'font-weight="900" font-size="{fonte}" letter-spacing="3" fill="#FFD43B">R$</text>')


OPC_Z = {'z1': ('visor um pouco menor', 346, 454, 46, 50), 'z2': ('visor bem menor', 362, 446, 70, 42), 'z3': ('visor menor mais abaixo, no vão do A', 430, 540, 92, 46)}
nome_x2, tip2, r2, by2, fim2, alt2 = OPC_X['x2']
cards6 = []
for k, (nome, t, b, ins, fonte) in OPC_Z.items():
    vz = visor_trap(t, b, ins, fonte)
    for sufixo, nome_ic, fundo in (('', '', None),):
        pass
    logo = svg3(logo_x(tip2, r2, by2, fim2, alt2).replace(visor_topo(), vz))
    icone = svg3(logo_x(tip2, r2, by2, fim2, alt2, False).replace(visor_topo(), vz), VB_ICONE, AMARELO)
    open(os.path.join(SAI3, f'logo_{k}.svg'), 'w', encoding='utf-8').write(logo)
    open(os.path.join(SAI3, f'icone_{k}.svg'), 'w', encoding='utf-8').write(icone)
    cards6.append(f'<section id="{k}"><h2>{k.upper()} · formato do X2, {nome}</h2><div class="lado">'
                  f'<img class="logo" src="logo_{k}.svg">'
                  f'<div class="ics"><img class="ic" src="icone_{k}.svg"><img class="ic p" src="icone_{k}.svg">'
                  f'<img class="ic pp" src="icone_{k}.svg"></div></div></section>')
open(os.path.join(SAI3, 'comparar_z.html'), 'w', encoding='utf-8').write(html.split('</style>')[0] + '</style>' + ''.join(cards6))
print('ok rodada Z')


# --- rodada Z-b: mesma Z, com a barra mais alta na gota (perto da ponta), parando em 3/4 da largura ---
cards7 = []
for k, (nome, t, b, ins, fonte) in OPC_Z.items():
    vz = visor_trap(t, b, ins, fonte)
    kb = k + 'b'
    by_b, fim_b = 640, 634
    logo = svg3(logo_x(tip2, r2, by_b, fim_b, alt2).replace(visor_topo(), vz))
    icone = svg3(logo_x(tip2, r2, by_b, fim_b, alt2, False).replace(visor_topo(), vz), VB_ICONE, AMARELO)
    open(os.path.join(SAI3, f'logo_{kb}.svg'), 'w', encoding='utf-8').write(logo)
    open(os.path.join(SAI3, f'icone_{kb}.svg'), 'w', encoding='utf-8').write(icone)
    cards7.append(f'<section id="{kb}"><h2>{k.upper()} · {nome}, barra mais alta</h2><div class="lado">'
                  f'<img class="logo" src="logo_{kb}.svg">'
                  f'<div class="ics"><img class="ic" src="icone_{kb}.svg"><img class="ic p" src="icone_{kb}.svg">'
                  f'<img class="ic pp" src="icone_{kb}.svg"></div></div></section>')
open(os.path.join(SAI3, 'comparar_zb.html'), 'w', encoding='utf-8').write(html.split('</style>')[0] + '</style>' + ''.join(cards7))
print('ok rodada Z-b')


# --- FINAL: Z3 escolhido por Robson em 20/11/2026 -------------------------------------------------
FINAL = os.path.join(AQUI, 'final')
os.makedirs(FINAL, exist_ok=True)
_n, _t, _b, _ins, _f = OPC_Z['z3']
_vz = visor_trap(_t, _b, _ins, _f)
def final_svg(com_nome, vb, fundo=None):
    return svg3(logo_x(tip2, r2, by2, fim2, alt2, com_nome).replace(visor_topo(), _vz), vb, fundo)
arquivos_finais = {
    'abastecer-logo.svg': final_svg(True, '20 150 1214 900'),            # símbolo + nome, fundo transparente
    'abastecer-simbolo.svg': final_svg(False, '190 160 860 680'),       # só o símbolo, transparente
    'abastecer-icone.svg': final_svg(False, '113 24 940 940', AMARELO),         # ícone do app (fundo amarelo)
    'abastecer-icone-maskable.svg': final_svg(False, '-47 -136 1260 1260', AMARELO),  # zona segura do Android
}
for nome_arq, conteudo in arquivos_finais.items():
    open(os.path.join(FINAL, nome_arq), 'w', encoding='utf-8').write(conteudo)
print('ok final')
