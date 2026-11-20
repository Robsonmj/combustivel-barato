# Gera as propostas de logo do AbasteceR (SVG) e a página de comparação.
# Uso: python marca/gerar.py  → marca/propostas/*.svg e marca/propostas.html
import os

AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(AQUI, 'propostas')
os.makedirs(SAIDA, exist_ok=True)

FONTE = "'Poppins', 'Segoe UI', Arial, sans-serif"

# ---------- peças ----------
# R com tronco largo (gabinete da bomba); viewBox 512
R_PATH = ('M150 96 H318 C384 96 428 140 428 204 C428 258 392 298 342 306 '
          'L438 424 H332 L276 336 V424 H150 Z')
# só a perna do R (para colorir à parte)
PERNA = 'M330 300 L342 306 L438 424 H332 L276 336 Z'


def gota(cx, cy, h, cor, brilho=True):
    """Gota com a ponta para cima; h = altura total."""
    s = h / 2.0
    d = (f'M{cx} {cy - s} C{cx + .62 * s} {cy - .25 * s} {cx + .78 * s} {cy + .1 * s} {cx + .78 * s} {cy + .38 * s} '
         f'A{.78 * s} {.78 * s} 0 1 1 {cx - .78 * s} {cy + .38 * s} '
         f'C{cx - .78 * s} {cy + .1 * s} {cx - .62 * s} {cy - .25 * s} {cx} {cy - s} Z')
    out = f'<path d="{d}" fill="{cor}"/>'
    if brilho:
        out += (f'<path d="M{cx - .38 * s} {cy + .05 * s} C{cx - .5 * s} {cy + .3 * s} {cx - .45 * s} {cy + .55 * s} {cx - .28 * s} {cy + .7 * s}" '
                f'stroke="#fff" stroke-opacity=".55" stroke-width="{max(3, s * .1):.1f}" fill="none" stroke-linecap="round"/>')
    return out


def bico(cor, x=112, y=170, ang=26, mang=True, fim=(150, 404)):
    """Bico da bomba pendurado à esquerda + mangueira descendo até a base."""
    g = (f'<g transform="translate({x} {y}) rotate({ang})">'
         f'<rect x="-15" y="-52" width="30" height="92" rx="11" fill="{cor}"/>'
         f'<rect x="-6.5" y="-84" width="13" height="40" rx="5" fill="{cor}"/>'
         f'<rect x="-4.5" y="-30" width="9" height="34" rx="4.5" fill="#fff" fill-opacity=".9"/>'
         f'</g>')
    if mang:
        g = (f'<path d="M97 206 C70 268 66 372 112 398 C126 406 140 406 {fim[0]} {fim[1]}" '
             f'stroke="{cor}" stroke-width="15" fill="none" stroke-linecap="round"/>') + g
    return g


def defs(id_, c1, c2, x2=1, y2=1):
    return (f'<linearGradient id="{id_}" x1="0" y1="0" x2="{x2}" y2="{y2}">'
            f'<stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient>')


# ---------- símbolos (viewBox 0 0 512 512) ----------
def s1_posto(fundo_escuro=False):
    """1. Bomba-R clássica: R vermelho de bomba, visor branco, gota amarela."""
    verm, ama, graf = '#D7262E', '#FFC20E', '#1E2430'
    if fundo_escuro:
        graf = '#FFFFFF'
    return (bico(graf) +
            f'<path d="{R_PATH}" fill="{verm}"/>'
            f'<rect x="186" y="134" width="150" height="104" rx="16" fill="#fff"/>'
            f'<rect x="206" y="160" width="62" height="12" rx="6" fill="{verm}" fill-opacity=".25"/>'
            f'<rect x="206" y="186" width="98" height="12" rx="6" fill="{verm}" fill-opacity=".25"/>'
            f'<rect x="206" y="212" width="44" height="12" rx="6" fill="{verm}" fill-opacity=".25"/>'
            + gota(213, 338, 92, ama) +
            f'<rect x="132" y="424" width="164" height="22" rx="8" fill="{graf}"/>')


def s2_reforma(fundo_escuro=False):
    """2. Reforma da referência: tronco = gabinete azul-marinho, bojo e perna verdes, visor = miolo do R, gota âmbar."""
    navy = '#FFFFFF' if fundo_escuro else '#0D2B4E'
    visor = '#0D2B4E' if fundo_escuro else '#FFFFFF'
    return ('<defs>' + defs('g2v', '#0FA14A', '#8FD32B') + defs('g2a', '#FFC400', '#FF7A00', 0, 1) + '</defs>' +
            bico(navy) +
            f'<path d="{R_PATH}" fill="url(#g2v)"/>'
            f'<path d="M150 118 A22 22 0 0 1 172 96 H276 V424 H150 Z" fill="{navy}"/>'
            f'<rect x="184" y="132" width="156" height="104" rx="16" fill="{visor}"/>'
            + gota(213, 338, 96, 'url(#g2a)') +
            f'<rect x="132" y="424" width="164" height="22" rx="8" fill="{navy}"/>')


def s3_dois_r(fundo_escuro=False):
    """3. Dois R: R da bomba + 'R$' no visor (o preço), verde petróleo e amarelo."""
    verde, ama, lar, esc = '#0B6B4A', '#FFC20E', '#F57C00', '#0A2A20'
    corpo = verde
    return ('<defs>' + defs('g3', ama, lar, 0, 1) + '</defs>' +
            bico('#FFFFFF' if fundo_escuro else esc) +
            f'<path d="{R_PATH}" fill="{corpo}"/>'
            f'<path d="{PERNA}" fill="url(#g3)"/>'
            f'<rect x="182" y="130" width="160" height="112" rx="16" fill="{esc}"/>'
            f'<rect x="182" y="130" width="160" height="112" rx="16" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="6"/>'
            f'<text x="262" y="214" text-anchor="middle" font-family="\'Poppins\', Arial" font-weight="800" font-size="80" '
            f'fill="{ama}" letter-spacing="-2">R$</text>'
            + gota(213, 340, 88, 'url(#g3)') +
            f'<rect x="132" y="424" width="164" height="22" rx="8" fill="{"#FFFFFF" if fundo_escuro else esc}"/>')


def s4_mangueira(fundo_escuro=False):
    """4. Mangueira-R: R desenhado por uma mangueira contínua que termina no bico; gota laranja."""
    azul = '#FFFFFF' if fundo_escuro else '#0A3A5C'
    lar = '#FF8A00'
    return ('<defs>' + defs('g4', '#FFB300', '#FF6A00', 0, 1) + '</defs>'
            f'<path d="M178 428 V128 H296 C352 128 388 164 388 212 C388 260 352 294 296 294 H178" '
            f'stroke="{azul}" stroke-width="58" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
            # bico (perna do R)
            f'<g transform="translate(292 286) rotate(-36)">'
            f'<rect x="-36" y="-6" width="72" height="150" rx="20" fill="{lar}"/>'
            f'<rect x="-13" y="132" width="26" height="62" rx="9" fill="{lar}"/>'
            f'<rect x="-7" y="26" width="14" height="70" rx="7" fill="#fff" fill-opacity=".85"/>'
            f'</g>'
            + gota(418, 470, 60, 'url(#g4)'))


def s5_gota(fundo_escuro=False):
    """5. Gota-R: gota de combustível com o R vazado e um bico estilizado no topo."""
    cor_r = '#0D2B4E' if not fundo_escuro else '#0D2B4E'
    return ('<defs>' + defs('g5', '#FFC400', '#FF6A00', 0, 1) + defs('g5v', '#0FA14A', '#8FD32B') + '</defs>' +
            gota(256, 268, 400, 'url(#g5)', brilho=False) +
            f'<text x="256" y="390" text-anchor="middle" font-family="{FONTE}" font-weight="900" font-size="250" fill="{cor_r}">R</text>'
            f'<path d="M196 168 C206 140 230 128 256 128" stroke="#fff" stroke-opacity=".6" stroke-width="14" fill="none" stroke-linecap="round"/>')


def s6_seta(fundo_escuro=False):
    """6. R-Seta: bomba-R verde cuja perna é uma seta para baixo (preço caindo)."""
    verde, ama, esc = '#0FA14A', '#FFC20E', '#123326'
    corpo_sem_perna = 'M150 96 H318 C384 96 428 140 428 204 C428 258 392 298 342 306 L330 300 L276 336 V424 H150 Z'
    return (bico('#FFFFFF' if fundo_escuro else esc) +
            f'<path d="{corpo_sem_perna}" fill="{verde}"/>'
            # seta
            f'<path d="M300 300 L352 300 L420 386 L446 360 L452 452 L362 444 L388 420 Z" fill="{ama}"/>'
            f'<rect x="186" y="134" width="150" height="104" rx="16" fill="#fff"/>'
            f'<path d="M206 170 L240 196 L262 182 L314 214" stroke="{verde}" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
            + gota(213, 340, 88, ama) +
            f'<rect x="132" y="424" width="164" height="22" rx="8" fill="{"#FFFFFF" if fundo_escuro else esc}"/>')


CONCEITOS = [
    ('1-bomba-r-posto', 'Bomba-R Posto', 'Vermelho de bomba, amarelo de combustível e grafite: as cores clássicas de pista de posto. O gabinete da bomba É o R; o visor é o miolo da letra.', s1_posto, '#1E2430', '#D7262E', '#1E2430'),
    ('2-reforma', 'Reforma da sua referência', 'Mesma ideia da imagem que você mandou, redesenhada: formas mais limpas, sem sobreposição confusa, um só R (verde) abraçando a bomba azul-marinho e a gota âmbar.', s2_reforma, '#0D2B4E', '#14A84A', '#0D2B4E'),
    ('3-dois-r', 'Dois R (R da bomba + R$)', 'A bomba forma o R grande e o visor mostra "R$": o segundo R é o do preço, que é o assunto do app. O R em destaque continua só no nome.', s3_dois_r, '#0A2A20', '#F57C00', '#0A2A20'),
    ('4-mangueira', 'Mangueira-R', 'Traço único: a mangueira desenha o R e a perna da letra é o bico, pingando a gota. Moderno e fácil de ler pequeno.', s4_mangueira, '#0A3A5C', '#FF8A00', '#0A3A5C'),
    ('5-gota', 'Gota-R', 'Símbolo mais simples: gota de combustível com o R. Funciona muito bem como ícone pequeno no celular.', s5_gota, '#0D2B4E', '#FF7A00', '#0D2B4E'),
    ('6-seta', 'R-Seta (preço caindo)', 'Bomba-R com a perna virando uma seta para baixo e um gráfico descendo no visor: comunica "combustível mais barato".', s6_seta, '#123326', '#0FA14A', '#123326'),
]


def svg(conteudo, w=512, h=512, vb=None, fundo=None):
    vb = vb or f'0 0 {w} {h}'
    bg = f'<rect width="100%" height="100%" fill="{fundo}"/>' if fundo else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w}" height="{h}">'
            f'<style>@import url("https://fonts.googleapis.com/css2?family=Poppins:wght@700;800;900&amp;display=swap");</style>'
            f'{bg}{conteudo}</svg>')


def marca_txt(x, y, tam, cor, cor_r, anchor='start'):
    return (f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-family="{FONTE}" font-weight="800" font-size="{tam}" '
            f'fill="{cor}" letter-spacing="-1">Abastece<tspan fill="{cor_r}" font-weight="900" font-size="{tam * 1.12:.0f}">R</tspan></text>')


def icone(fn, fundo):
    """Ícone de app: quadrado arredondado com o símbolo."""
    escuro = fundo not in ('#FFFFFF',)
    return (f'<rect width="512" height="512" rx="112" fill="{fundo}"/>'
            f'<g transform="translate(51 51) scale(.8)">{fn(fundo_escuro=escuro)}</g>')


cards = []
for slug, nome, desc, fn, cor_txt, cor_r, fundo_icone in CONCEITOS:
    simbolo = fn()
    open(os.path.join(SAIDA, f'{slug}-simbolo.svg'), 'w', encoding='utf-8').write(svg(simbolo))
    vertical = svg(f'<g transform="translate(244 30) scale(1.0)">{simbolo}</g>' + marca_txt(500, 680, 150, cor_txt, cor_r, 'middle'), 1000, 760)
    open(os.path.join(SAIDA, f'{slug}-vertical.svg'), 'w', encoding='utf-8').write(vertical)
    horizontal = svg(f'<g transform="translate(10 20) scale(.72)">{simbolo}</g>' + marca_txt(390, 255, 128, cor_txt, cor_r), 1180, 400)
    open(os.path.join(SAIDA, f'{slug}-horizontal.svg'), 'w', encoding='utf-8').write(horizontal)
    ic = svg(icone(fn, fundo_icone))
    open(os.path.join(SAIDA, f'{slug}-icone.svg'), 'w', encoding='utf-8').write(ic)
    escuro = svg(f'<g transform="translate(10 20) scale(.72)">{fn(fundo_escuro=True)}</g>' + marca_txt(390, 255, 128, '#FFFFFF', cor_r if cor_r != cor_txt else '#FFC20E'), 1180, 400, fundo='#111827')
    cards.append((slug, nome, desc, vertical, horizontal, ic, escuro))

html = ['<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>AbasteceR — propostas de logo</title>',
        '<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800;900&display=swap" rel="stylesheet">',
        '<style>body{margin:0;background:#eef1f4;font-family:Poppins,Arial;color:#1e2430}'
        '.card{width:1400px;background:#fff;margin:0;padding:40px 48px;box-sizing:border-box}'
        'h2{margin:0 0 6px;font-size:34px}p{margin:0 0 24px;font-size:19px;color:#4b5563;max-width:1200px}'
        '.linha{display:flex;gap:32px;align-items:center}.v svg{width:520px;height:auto}.h svg{width:700px;height:auto}'
        '.col{display:flex;flex-direction:column;gap:20px}.icones{display:flex;gap:24px;align-items:end}'
        '.icones div{text-align:center;font-size:14px;color:#6b7280}.esc{border-radius:16px;overflow:hidden}'
        '.esc svg{width:700px;height:auto;display:block}</style></head><body>']
html.append('<section class="card" id="0-resumo"><h2>AbasteceR: 6 propostas de logo</h2><p>Visão geral. Cada proposta tem a sua página com versão horizontal, fundo escuro e ícone do app.</p>'
            '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:28px">'
            + ''.join(f'<div style="border:1px solid #e5e7eb;border-radius:18px;padding:18px;text-align:center">'
                      f'<div style="width:100%">{c[3].replace("width=\"1000\" height=\"760\"", "width=\"100%\"", 1)}</div>'
                      f'<div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-top:6px">{c[5].replace("width=\"512\" height=\"512\"", "width=\"64\" height=\"64\"", 1)}'
                      f'<strong style="font-size:20px">{c[1]}</strong></div></div>' for c in cards)
            + '</div></section>')
for slug, nome, desc, vertical, horizontal, ic, escuro in cards:
    html.append(f'<section class="card" id="{slug}"><h2>{nome}</h2><p>{desc}</p><div class="linha">'
                f'<div class="v">{vertical}</div><div class="col"><div class="h">{horizontal}</div>'
                f'<div class="esc">{escuro}</div>'
                f'<div class="icones"><div>{ic.replace("width=\"512\" height=\"512\"", "width=\"192\" height=\"192\"", 1)}<br>ícone do app</div>'
                f'<div>{ic.replace("width=\"512\" height=\"512\"", "width=\"96\" height=\"96\"", 1)}<br>96 px</div>'
                f'<div>{ic.replace("width=\"512\" height=\"512\"", "width=\"48\" height=\"48\"", 1)}<br>48 px</div></div>'
                f'</div></div></section>')
html.append('</body></html>')
open(os.path.join(AQUI, 'propostas.html'), 'w', encoding='utf-8').write('\n'.join(html))
print('ok', len(cards))
