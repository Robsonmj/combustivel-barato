# Combustível Barato na Google Play: passo a passo

Tudo o que dá para fazer sem você já está pronto. O que falta são as etapas que só o dono da conta pode fazer: pagar, verificar a identidade e clicar em "Publicar".

## O que já está pronto

| Item | Onde está |
|---|---|
| App Android assinado, para enviar à Play | `play-store/arquivos/combustivel-barato.aab` |
| App para instalar direto no seu celular e testar | `play-store/arquivos/combustivel-barato.apk` |
| Chave de assinatura e senha (**guarde cópia num pendrive**) | `android-chave/` (não vai para o GitHub) |
| Verificação site ↔ app (o app abre em tela cheia, sem barra de endereço) | https://robsonmj.github.io/.well-known/assetlinks.json |
| 5 capturas de tela 1080×1920 e gráfico de destaque 1024×500 | `play-store/imagens/` |
| Ícone 512×512 | `public/icone-512.png` |
| Política de privacidade | https://robsonmj.github.io/combustivel-barato/privacidade.html |
| Página de exclusão de conta | https://robsonmj.github.io/combustivel-barato/excluir-conta.html |

Nome do pacote, que não pode mudar depois: `io.github.robsonmj.combustivelbarato`

---

## Passo 1: criar a conta de desenvolvedor (só você pode)

1. Acesse https://play.google.com/console/signup com o seu Gmail.
2. Escolha o tipo de conta:
   - **Pessoal** (CPF): mais rápida de abrir. Contas pessoais novas precisam fazer um **teste fechado com pelo menos 12 testadores durante 14 dias seguidos** antes de liberar o app para o público (Passo 4).
   - **Organização** (CNPJ): exige o número D-U-N-S da empresa, que é gratuito e leva alguns dias. Não exige o teste com 12 pessoas. Só vale a pena se a empresa já existir; lembre da questão do seu estatuto.
3. Pague a taxa única de **US$ 25** com cartão.
4. Envie o documento com foto e confirme o telefone. O Google costuma levar de 1 a 3 dias para verificar.

## Passo 2: criar o app no Console

Em "Criar app":

- **Nome do app:** Combustível Barato
- **Idioma padrão:** Português (Brasil)
- **App ou jogo:** App
- **Gratuito ou pago:** Gratuito. Essa escolha não pode virar "pago" depois, mas você pode vender destaque e patrocínio fora do app normalmente.
- Marque as duas declarações e clique em **Criar app**.

## Passo 3: enviar o app para o teste fechado

1. Menu **Testar e lançar → Testes → Teste fechado → Criar faixa** (ou use a faixa "Alpha").
2. Em **Testadores**, crie uma lista com os e-mails (Gmail) de pelo menos 12 pessoas.
3. **Criar nova versão**. Aceite a **Assinatura de apps do Google Play**, que é o padrão.
4. Envie o arquivo `play-store/arquivos/combustivel-barato.aab`.
5. **Nome da versão:** 1.0.0. **Notas:** "Primeira versão: preços de combustíveis dos postos de Toledo-PR no mapa."
6. Salve, revise e envie para análise. A primeira análise leva de 1 a 7 dias.

### ⚠️ Importante logo depois do envio

Vá em **Configuração → Integridade do app → Assinatura de apps** e copie o **SHA-256 da chave de assinatura do app**. É uma sequência como `AB:CD:12:...`.
**Mande esse código para o Claude.** Ele precisa entrar no arquivo de verificação. Sem isso, o app baixado da Play abre com a barra de endereço do navegador no topo.

## Passo 4: os 12 testadores por 14 dias (só conta pessoal)

- Na faixa do teste fechado, copie o **link de participação** e mande para os testadores.
- Cada pessoa abre o link, toca em "Tornar-se testador" e instala pela Play.
- Elas precisam **manter o app instalado por 14 dias seguidos**. Peça que abram de vez em quando.
- Depois disso, em **Painel → Solicitar acesso à produção**, responda ao questionário. Os textos prontos estão no fim deste guia.

## Passo 5: preencher "Conteúdo do app"

Fica no menu **Política → Conteúdo do app**. Respostas prontas:

| Pergunta | Resposta |
|---|---|
| Política de privacidade | https://robsonmj.github.io/combustivel-barato/privacidade.html |
| Detalhes do login (antigo "Acesso ao app") | **Não**, nenhuma parte é restrita. No app da Play o link "Área do posto" não aparece; os donos de posto usam a área pelo site, no navegador. |
| Anúncios | **Sim, o app contém anúncios** (faixa de patrocinadores e postos patrocinados) |
| Classificação de conteúdo | Categoria "Todos os outros tipos de app". Responda **Não** a tudo: violência, sexo, linguagem, drogas, apostas, compras digitais, interação entre usuários e compartilhamento de localização com outros usuários. Resultado esperado: **Livre (L)** |
| Público-alvo | **18 anos ou mais**, para evitar as regras de apps para crianças |
| App de notícias | Não |
| Apps governamentais | **Não** é app do governo (o app já diz que é independente) |
| Recursos financeiros | O app não oferece recursos financeiros |
| Saúde | Não |
| Segurança dos dados | Ver a tabela abaixo |

### Segurança dos dados (Data safety)

- **O app coleta ou compartilha dados?** **Não**. No app da Play não há login nem formulário; a localização é usada só no aparelho para calcular distâncias e não é enviada a nenhum servidor.
- **Os dados são criptografados em trânsito?** Sim.
- O cadastro dos donos de posto acontece só no site, fora do app. Se um dia a "Área do posto" voltar ao app, refaça esta seção declarando e-mail, nome e telefone (só de donos de posto) e a URL https://robsonmj.github.io/combustivel-barato/excluir-conta.html.

## Passo 6: página da loja (Presença na loja → Página principal)

**Nome do app** (até 30 caracteres):
```
Combustível Barato
```

**Descrição breve** (até 80 caracteres; esta tem 76):
```
Posto mais barato em Toledo, Cascavel, Foz do Iguaçu, Guarapuava e Marechal.
```

**Descrição completa:**
```
Encontre o combustível mais barato perto de você.

O Combustível Barato mostra no mapa o preço da gasolina, etanol, diesel S10 e diesel S500 nos postos de cinco cidades do Paraná, com os preços mais recentes de cada posto:

• Toledo
• Cascavel
• Foz do Iguaçu
• Guarapuava
• Marechal Cândido Rondon

Os distritos e postos de beira de estrada em volta de cada cidade também aparecem. Se o GPS estiver ligado, o app abre direto na sua cidade. Para ver outra, é só tocar no nome da cidade no topo.

• Mapa com o preço de cada posto
• Lista ordenada por mais barato, mais perto ou custo-benefício (preço + distância até lá)
• Etanol ou gasolina? O app calcula a regra dos 70% para o seu carro flex
• Rota até o posto pelo Google Maps ou Waze, com um toque
• Sem cadastro e sem login para motoristas
• Sua localização é usada só no seu celular, para calcular distâncias

De onde vêm os preços
Os preços vêm das informações públicas do Nota Paraná / Menor Preço (valores registrados nas notas fiscais eletrônicas de venda) e dos próprios postos parceiros, que aparecem com o selo "Confirmado pelo posto". O horário mostrado é o da última venda registrada. Confira sempre o preço na bomba.

É dono de posto?
Pelo site do Combustível Barato, na "Área do posto", você atualiza os preços do seu posto gratuitamente e ganha o selo de preço confirmado. Também é possível anunciar com destaque no app.

O Combustível Barato é um app independente, sem vínculo com o Governo do Paraná, a Secretaria da Fazenda ou o programa Nota Paraná.
```

**Imagens:**
- Ícone do app (512×512): `public/icone-512.png`
- Gráfico de destaque (1024×500): `play-store/imagens/grafico-destaque-1024x500.png`
- Capturas de tela do telefone, na ordem: `play-store/imagens/1-...` até `5-outras-cidades.png` (a antiga `5-area-do-posto.png` saiu, porque o app da Play não mostra mais essa área)

**Categoria:** Mapas e navegação. **Tags:** Postos de combustível, Economia.
**E-mail de contato:** robsonmj@gmail.com. **Site:** https://robsonmj.github.io/combustivel-barato/

## Questionário de acesso à produção (só conta pessoal), com respostas sugeridas

- *Como você recrutou os testadores?* "Amigos, familiares e motoristas de Toledo-PR convidados pessoalmente e pelo WhatsApp."
- *Como foi o engajamento?* "Os testadores usaram o mapa para comparar preços antes de abastecer e testaram a rota até o posto e a troca de combustível."
- *Que mudanças você fez com base no retorno?* Descreva o que mudou de fato. Exemplo: "Ajustamos o botão 'Perto de mim' para não cobrir a lista e deixamos mais claro de onde vêm os preços."
- *Público do app:* "Motoristas de Toledo, Cascavel, Foz do Iguaçu, Guarapuava e Marechal Cândido Rondon (PR) que querem economizar no combustível."

---

## Depois de publicado: como ficam as atualizações

- **Quase tudo se atualiza sozinho.** O app da Play abre o site, então preços, telas e correções chegam a todos na hora, sem enviar versão nova à loja. Isso vale também para quem instalou pelo navegador.
- **Só precisa gerar um `.aab` novo** se mudar o nome, o ícone ou as cores do app. O Claude faz isso com:
  ```
  node ferramentas/gerar-android.js 2 1.0.1
  bash ferramentas/compilar-android.sh
  ```
  O primeiro número (código da versão) precisa aumentar a cada envio.

## Preços: atualização automática, sem depender do seu PC

A coleta roda dentro do Supabase, num servidor em São Paulo, de hora em hora. Seu computador pode ficar desligado. O app lê os preços direto de lá. Se o Supabase falhar, o app mostra os últimos preços publicados no site.

- **Ver se está funcionando:** no rodapé do app aparece "Última coleta há X min".
- **Pausar a coleta:** no Supabase, em SQL Editor, rode `select cron.unschedule('mp_coleta');`.
- **Se o Menor Preço recusar o acesso:** a coleta para sozinha até o ciclo seguinte e o rodapé avisa. A solução definitiva continua sendo a resposta da Secretaria da Fazenda (SEFA).
