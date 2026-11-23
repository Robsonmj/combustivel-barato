# AbasteceR — Toledo-PR (protótipo)

App web que mostra no mapa os postos de Toledo-PR com o preço atual de gasolina, etanol e diesel,
para achar o posto mais barato e mais perto e traçar a rota.

## Site publicado

**https://robsonmj.github.io/combustivel-barato/** (abre no celular; "Perto de mim" funciona).

Os preços vêm do Supabase (pesquisa semanal da ANP, coletada no próprio servidor, e preços informados por
postos e motoristas). O GitHub Actions só monta e publica as telas.

**Menor Preço / Nota Paraná: desligado de vez em 23/11/2026.** A SEFA-PR indeferiu o pedido de acesso e informou que
não autoriza coleta automatizada, replicação, armazenamento ou redistribuição desses dados. Não religar
(`supabase/coleta.sql`, `supabase/menor_preco_volta.sql`, `publicar.bat` e `src/adapters/menorPreco.js` ficam só como histórico).

## Como usar no PC

1. Dê dois cliques em **`iniciar.bat`** (precisa do Node.js 22.13 ou mais novo — já instalado neste PC).
2. O navegador abre em **http://localhost:3000**. Deixe a janela preta aberta enquanto usa o app.
3. Para abrir no celular (mesma rede Wi-Fi): descubra o IP do PC (`ipconfig`) e acesse `http://IP-DO-PC:3000`.
   Obs.: o botão "Perto de mim" só funciona no celular quando o app estiver publicado com `https`.

Comandos (no terminal, dentro desta pasta):

| Comando | O que faz |
|---|---|
| `npm start` | Liga o servidor (o mesmo que o `iniciar.bat`) |
| `npm run coletar` | Faz uma coleta de preços agora |
| `npm run teste` | Roda os testes automáticos |

## O que o app faz

- Mapa com todos os postos (pino com o preço; verde = barato, laranja = médio, vermelho = caro).
- Escolha do combustível: gasolina, etanol, diesel S10, diesel S500, gasolina aditivada.
- Lista por **mais barato**, **mais perto** ou **custo-benefício** (preço + gasto para ir até o posto).
- Tela do posto: todos os preços, "há quanto tempo", fonte do dado, rota no Google Maps ou Waze,
  gráfico do preço nos últimos dias e formulário "O preço mudou? Informe aqui" (aceita a chave da NFC-e).
- Dica **etanol x gasolina** (regra dos 70%).

## De onde vêm os preços

| Fonte | Situação |
|---|---|
| **ANP** | Ligada. Pesquisa semanal de preços (dados abertos), coletada no Supabase. |
| Menor Preço (Nota Paraná) | **Desligada** em 23/11/2026 (SEFA-PR não autoriza). |
| Motoristas | Ligada. Formulário na tela do posto (limite de 20 envios por hora). |
| Painel do posto | Prevista (fonte `posto` já existe no banco). |


## Estrutura

```
config.js                 cidade piloto, fontes ligadas/desligadas, intervalos
src/server.js             servidor e API (/api/postos, /api/postos/:id, /api/precos, /api/status)
src/db.js                 banco SQLite (tabelas postos, precos, fontes_status)
src/coletor.js            coleta agendada (a cada hora)
src/adapters/menorPreco.js  leitura do Menor Preço (isolado, com "liga/desliga")
src/adapters/manual.js    preços informados por motoristas/postos + validação da chave NFC-e
public/                   telas (mapa com Leaflet + OpenStreetMap)
dados/combustivel.db      banco de dados (criado automaticamente)
```

Os postos vêm do cadastro de revendedores da ANP (dados abertos).

## Próximos passos

- Publicar na internet (com `https`) para usar no celular.
- Pedido formal à Sefa-PR / Celepar (LAI ou parceria) para acesso autorizado aos dados.
- Leitura do QR Code da NFC-e pela câmera; painel do dono do posto; alertas de preço.
- Agrupar pinos muito próximos no mapa; expandir para outras cidades (basta mudar `config.js`).
