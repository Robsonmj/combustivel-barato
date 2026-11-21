# Rodada "fundo amarelo": base = bomba 2, R entrando na frente da bomba, perna do R virando seta
# (preço caindo) e outras formas de bomba. Reaproveita os traçados de gerar_ref.py.
# Uso: python -I marca/gerar_amarelo.py   (gera marca/amarelo/*.svg e comparar.html)
import math
import os

AQUI = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(AQUI, 'gerar_ref.py'), encoding='utf-8').read())  # define R_VERDE, GOTA, NOME, bomba(), etc.

SAI2 = os.path.join(AQUI, 'amarelo')
os.makedirs(SAI2, exist_ok=True)
AMARELO = '#FFD43B'

# perna do R (medida no modelo): centro x = 812.5 + 0.88*(y-640), direção da perna d, normal n
D = (0.66, 0.75)
N = (0.75, -0.66)


def centro(y):
    return 812.5 + 0.88 * (y - 640), y


def seta(largura, cor, corte=690, comp=125):
    """Corta a perna do R numa linha perpendicular e põe uma ponta de seta no lugar."""
    cx, cy = centro(corte)
    a = (cx + N[0] * largura / 2, cy + N[1] * largura / 2)
    b = (cx - N[0] * largura / 2, cy - N[1] * largura / 2)
    tip = (cx + D[0] * comp, cy + D[1] * comp)
    # máscara: esconde o pedaço da perna além da linha de corte (um pouco antes, para encaixar na seta)
    e = 4
    p1 = (cx + N[0] * 400 - D[0] * e, cy + N[1] * 400 - D[1] * e)
    p2 = (cx - N[0] * 400 - D[0] * e, cy - N[1] * 400 - D[1] * e)
    p3 = (p2[0] + D[0] * 600, p2[1] + D[1] * 600)
    p4 = (p1[0] + D[0] * 600, p1[1] + D[1] * 600)
    f = lambda p: f'{p[0]:.1f} {p[1]:.1f}'
    mascara = (f'<mask id="mSeta" maskUnits="userSpaceOnUse" x="-2000" y="-2000" width="6000" height="6000">'
               f'<rect x="-2000" y="-2000" width="6000" height="6000" fill="#fff"/>'
               f'<path d="M{f(p1)} L{f(p2)} L{f(p3)} L{f(p4)} Z" fill="#000"/></mask>')
    ponta = f'<path d="M{f(a)} L{f(tip)} L{f(b)} Z" fill="{cor}" stroke="{cor}" stroke-width="10" stroke-linejoin="round"/>'
    return mascara, ponta


GRAD_SETA = ('<linearGradient id="gSeta" x1="760" y1="600" x2="960" y2="800" gradientUnits="userSpaceOnUse">'
             '<stop offset="0" stop-color="#22CA26"/><stop offset="1" stop-color="#74E10A"/></linearGradient>')


def corpo_forma(forma, c):
    if forma == 'arco':
        d = 'M452 800 V430 C452 352 514 308 598 308 C682 308 744 352 744 430 V800 Z'
    elif forma == 'moderna':
        d = 'M452 800 V408 C452 348 492 308 552 308 H744 V800 Z'
    elif forma == 'tampa':
        return (f'<path d="M462 800 V336 H734 V800 Z" fill="{c["corpo"]}"/>'
                f'<rect x="440" y="306" width="316" height="38" rx="14" fill="{AZUL}"/>')
    else:
        d = 'M452 800 V342 Q452 308 486 308 H710 Q744 308 744 342 V800 Z'
    return f'<path d="{d}" fill="{c["corpo"]}"/>'


def bomba_forma(forma):
    """Bomba 2 (visor R$), trocando só o contorno do corpo."""
    if forma == 'arco':
        b = bomba(7)          # retrô já tem bico mais baixo e visor redondo
    else:
        b = bomba(2)
    if forma in ('moderna', 'tampa'):
        velho = corpo(CLARO, 2)
        b = b.replace(velho, corpo_forma(forma, CLARO))
        b = b.replace('<path d="M470 356 Q470 328 496 326 H522"', '<path d="M0 0"')  # tira o friso do canto arredondado
    return b


def logo_am(seta_cfg=None, forma='reta', com_nome=True, gota=True):
    defs, ponta = '', ''
    r = R_VERDE
    if seta_cfg:
        largura, cor = seta_cfg
        mascara, ponta = seta(largura, cor)
        defs = mascara
        r = f'<g mask="url(#mSeta)">{R_VERDE}</g>'
    # ordem: bomba, depois o R (a ponta de dentro do R entra NA FRENTE da bomba), depois a gota
    partes = [defs, bomba_forma(forma), r, ponta] + ([GOTA] if gota else [])
    if com_nome:
        partes.append(NOME)
    return '\n'.join(partes)


def svg2(conteudo, vb='0 0 1254 1254', fundo=None):
    f = f'<rect x="-2000" y="-2000" width="6000" height="6000" fill="{fundo}"/>' if fundo else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">'
            f'<defs>{DEFS}{NEG_DEFS}{GRAD_SETA}</defs>{f}{conteudo}</svg>')


OPCOES = [
    ('a', 'R entrando na frente da bomba (sem seta)', None, 'reta'),
    ('b', 'Seta verde', (175, 'url(#gSeta)'), 'reta'),
    ('c', 'Seta verde larga', (235, 'url(#gSeta)'), 'reta'),
    ('d', 'Seta na cor da bomba', (200, AZUL), 'reta'),
    ('e', 'Bomba retrô (topo em arco) + seta verde', (200, 'url(#gSeta)'), 'arco'),
    ('f', 'Bomba moderna (canto assimétrico) + seta verde', (200, 'url(#gSeta)'), 'moderna'),
    ('g', 'Bomba com tampa + seta verde', (200, 'url(#gSeta)'), 'tampa'),
]
cards = []
for k, nome, cfg, forma in OPCOES:
    open(os.path.join(SAI2, f'logo_{k}.svg'), 'w', encoding='utf-8').write(svg2(logo_am(cfg, forma, gota=True)))
    open(os.path.join(SAI2, f'icone_{k}.svg'), 'w', encoding='utf-8').write(svg2(logo_am(cfg, forma, False, gota=True), VB_ICONE, AMARELO))
    cards.append(f'<section id="am_{k}"><h2>{k.upper()} · {nome}</h2><div class="lado">'
                 f'<img class="logo" src="logo_{k}.svg">'
                 f'<div class="ics"><img class="ic" src="icone_{k}.svg"><img class="ic p" src="icone_{k}.svg">'
                 f'<img class="ic pp" src="icone_{k}.svg"></div></div></section>')
html = ('<!doctype html><meta charset="utf-8"><title>AbasteceR · fundo amarelo</title><style>'
        'body{margin:0;padding:20px;background:#eef1f5;font-family:Arial;display:flex;flex-wrap:wrap;gap:20px}'
        'section{background:#fff;border-radius:16px;padding:18px;width:620px} h2{margin:0 0 8px;font-size:20px;color:#001B44}'
        '.lado{display:flex;gap:14px;align-items:center} img{display:block} .logo{width:380px;height:380px}'
        '.ics{display:flex;flex-direction:column;gap:12px;align-items:center}'
        '.ic{width:180px;height:180px;border-radius:40px;box-shadow:0 2px 8px rgba(0,0,0,.18)}'
        '.ic.p{width:64px;height:64px;border-radius:15px} .ic.pp{width:40px;height:40px;border-radius:10px}</style>'
        + ''.join(cards))
open(os.path.join(SAI2, 'comparar.html'), 'w', encoding='utf-8').write(html)
cards = []
for k, nome, cfg, forma in OPCOES:
    open(os.path.join(SAI2, f'logo_{k}_sg.svg'), 'w', encoding='utf-8').write(svg2(logo_am(cfg, forma, gota=False)))
    open(os.path.join(SAI2, f'icone_{k}_sg.svg'), 'w', encoding='utf-8').write(svg2(logo_am(cfg, forma, False, gota=False), VB_ICONE, AMARELO))
    cards.append(f'<section id="am_{k}_sg"><h2>{k.upper()} · {nome} (sem gota)</h2><div class="lado">'
                 f'<img class="logo" src="logo_{k}_sg.svg">'
                 f'<div class="ics"><img class="ic" src="icone_{k}_sg.svg"><img class="ic p" src="icone_{k}_sg.svg">'
                 f'<img class="ic pp" src="icone_{k}_sg.svg"></div></div></section>')
html = ('<!doctype html><meta charset="utf-8"><title>AbasteceR · fundo amarelo</title><style>'
        'body{margin:0;padding:20px;background:#eef1f5;font-family:Arial;display:flex;flex-wrap:wrap;gap:20px}'
        'section{background:#fff;border-radius:16px;padding:18px;width:620px} h2{margin:0 0 8px;font-size:20px;color:#001B44}'
        '.lado{display:flex;gap:14px;align-items:center} img{display:block} .logo{width:380px;height:380px}'
        '.ics{display:flex;flex-direction:column;gap:12px;align-items:center}'
        '.ic{width:180px;height:180px;border-radius:40px;box-shadow:0 2px 8px rgba(0,0,0,.18)}'
        '.ic.p{width:64px;height:64px;border-radius:15px} .ic.pp{width:40px;height:40px;border-radius:10px}</style>'
        + ''.join(cards))
open(os.path.join(SAI2, 'comparar_sg.html'), 'w', encoding='utf-8').write(html)
print('ok amarelo')
