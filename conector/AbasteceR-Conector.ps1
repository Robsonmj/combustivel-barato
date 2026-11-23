# Conector AbasteceR
# Lê os XML das NFC-e emitidas pelo PRÓPRIO posto (na pasta onde o sistema do posto guarda as notas)
# e envia ao AbasteceR só o preço por litro de cada combustível e a hora da última venda.
# Nada mais sai do computador: nem a nota, nem dados de clientes, nem valores totais.
#
# Uso normal: roda sozinho a cada 15 minutos (Agendador de Tarefas, criado pelo instalador).
# Para conferir sem enviar nada:  powershell -ExecutionPolicy Bypass -File AbasteceR-Conector.ps1 -Teste
param(
  [switch]$Teste,          # mostra o que seria enviado, sem enviar
  [string]$Pasta,          # opcional: outra pasta (para testes)
  [int]$Horas = 0          # opcional: olhar as notas das últimas N horas (padrão: desde a última leitura)
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$VERSAO = '1.0.0'
$URL = 'https://xubjrcujwtzgtjpbzjml.supabase.co'
$CHAVE_PUBLICA = 'sb_publishable_1rz0U7QsJZzm6uy8BY0sSQ_gM7YUvG7'  # chave pública do app (a mesma do site)

$base = Join-Path $env:LOCALAPPDATA 'AbasteceR'
New-Item -ItemType Directory -Force -Path $base | Out-Null
$arqCfg = Join-Path $base 'conector.json'
$arqLog = Join-Path $base 'conector.log'

function Registrar([string]$texto) {
  $linha = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $texto
  if ($Teste) { Write-Host $linha }
  try {
    Add-Content -Path $arqLog -Value $linha -Encoding UTF8
    $todas = Get-Content -Path $arqLog -Encoding UTF8
    if ($todas.Count -gt 1000) { $todas | Select-Object -Last 500 | Set-Content -Path $arqLog -Encoding UTF8 }
  } catch { }
}

# ---------- tipo de combustível ----------
# Pelo código ANP do produto (cProdANP) e, para separar comum/aditivada e S10/S500, pela descrição do produto.
function Get-Combustivel([string]$codigoAnp, [string]$descricao) {
  $d = ($descricao + '').ToUpperInvariant()
  $c = ($codigoAnp + '').Trim()
  $familia = $null
  if ($c -match '^32') { $familia = 'gasolina' }
  elseif ($c -match '^81') { $familia = 'etanol' }
  elseif ($c -match '^82') { $familia = 'diesel' }
  elseif ($c -match '^22') { $familia = 'gnv' }
  if (-not $familia) {
    # sem código ANP reconhecido: tenta pela descrição
    if ($d -match 'GASOL') { $familia = 'gasolina' }
    elseif ($d -match 'ETANOL|ALCOOL|ÁLCOOL') { $familia = 'etanol' }
    elseif ($d -match 'DIESEL') { $familia = 'diesel' }
    elseif ($d -match '\bGNV\b|GAS NATURAL') { $familia = 'gnv' }
    else { return $null }
  }
  switch ($familia) {
    'gasolina' {
      if ($c -eq '320102002' -or $c -eq '320102003' -or $d -match 'ADIT|PREMIUM|PODIUM|V-?POWER|GRID|ACTIVE|SUPRA') { return 'gasolina_aditivada' }
      return 'gasolina'
    }
    'etanol' { if ($d -match 'ANIDRO') { return $null }; return 'etanol' }
    'diesel' {
      if ($d -match 'S-?\s?10(\D|$)') { return 'diesel_s10' }
      if ($d -match 'S-?\s?500') { return 'diesel' }
      if ($c -eq '820101034' -or $c -eq '820101033') { return 'diesel_s10' }
      if ($d -match 'ARLA|ADITIVO') { return $null }
      return 'diesel'
    }
    'gnv' { return 'gnv' }
  }
  return $null
}

# ---------- leitura de uma nota ----------
function Read-Nota([string]$arquivo) {
  $xml = New-Object System.Xml.XmlDocument
  $xml.XmlResolver = $null
  $xml.Load($arquivo)
  $inf = $xml.SelectSingleNode("//*[local-name()='infNFe']")
  if (-not $inf) { return $null }
  $ide = $inf.SelectSingleNode("*[local-name()='ide']")
  $modelo = $ide.SelectSingleNode("*[local-name()='mod']").InnerText
  $ambiente = $ide.SelectSingleNode("*[local-name()='tpAmb']").InnerText
  if ($modelo -ne '65' -or $ambiente -ne '1') { return $null }   # só NFC-e de produção (venda ao consumidor)
  $quando = $ide.SelectSingleNode("*[local-name()='dhEmi']").InnerText
  $cnpj = $inf.SelectSingleNode("*[local-name()='emit']/*[local-name()='CNPJ']").InnerText
  $itens = @()
  foreach ($det in $inf.SelectNodes("*[local-name()='det']")) {
    $prod = $det.SelectSingleNode("*[local-name()='prod']")
    $comb = $prod.SelectSingleNode("*[local-name()='comb']")
    $anp = if ($comb) { $comb.SelectSingleNode("*[local-name()='cProdANP']").InnerText } else { '' }
    $desc = $prod.SelectSingleNode("*[local-name()='xProd']").InnerText
    if (-not $comb -and $desc -notmatch 'GASOL|ETANOL|ALCOOL|DIESEL|GNV') { continue }  # loja de conveniência etc.
    $tipo = Get-Combustivel $anp $desc
    if (-not $tipo) { continue }
    $valor = [double]::Parse($prod.SelectSingleNode("*[local-name()='vUnCom']").InnerText, [Globalization.CultureInfo]::InvariantCulture)
    if ($valor -lt 1 -or $valor -gt 20) { continue }
    $itens += [pscustomobject]@{ combustivel = $tipo; valor = [math]::Round($valor, 3); descricao = $desc }
  }
  return [pscustomobject]@{ cnpj = $cnpj; quando = [datetimeoffset]::Parse($quando, [Globalization.CultureInfo]::InvariantCulture); itens = $itens }
}

# ---------- configuração ----------
if (-not (Test-Path $arqCfg)) {
  if (-not $Teste) { Registrar 'Conector sem configuração. Rode o instalador.'; exit 1 }
  $cfg = [pscustomobject]@{ pasta = $Pasta; chave = ''; ultima = $null }
} else {
  $cfg = Get-Content -Path $arqCfg -Raw -Encoding UTF8 | ConvertFrom-Json
}
$pastaNotas = if ($Pasta) { $Pasta } else { $cfg.pasta }
if (-not $pastaNotas -or -not (Test-Path $pastaNotas)) { Registrar "Pasta das notas não encontrada: $pastaNotas"; exit 1 }

$agora = Get-Date
if ($Horas -gt 0) { $desde = $agora.AddHours(-$Horas) }
elseif ($cfg.ultima) { $desde = ([datetime]$cfg.ultima).AddMinutes(-5) }   # pequena sobra para notas gravadas com atraso
else { $desde = $agora.AddHours(-24) }

# ---------- leitura das notas novas ----------
$arquivos = Get-ChildItem -Path $pastaNotas -Recurse -File -Include *.xml -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -ge $desde }
$ultimo = @{}   # chave "cnpj|combustivel" -> venda mais recente
$lidas = 0; $erros = 0
foreach ($a in $arquivos) {
  try {
    $n = Read-Nota $a.FullName
    if (-not $n) { continue }
    $lidas++
    foreach ($it in $n.itens) {
      $k = $n.cnpj + '|' + $it.combustivel
      if (-not $ultimo.ContainsKey($k) -or $n.quando -gt $ultimo[$k].quando) {
        $ultimo[$k] = [pscustomobject]@{ cnpj = $n.cnpj; combustivel = $it.combustivel; valor = $it.valor; quando = $n.quando; descricao = $it.descricao }
      }
    }
  } catch { $erros++ }
}

if (-not $ultimo.Count) {
  Registrar "Nenhuma venda de combustível nova ($($arquivos.Count) arquivos olhados, $lidas NFC-e, $erros com erro)."
  if (-not $Teste) { $cfg.ultima = $agora.ToString('o'); $cfg | ConvertTo-Json | Set-Content -Path $arqCfg -Encoding UTF8 }
  exit 0
}

# ---------- envio (um pacote por CNPJ) ----------
$falhou = $false
foreach ($grupo in ($ultimo.Values | Group-Object cnpj)) {
  $itens = @($grupo.Group | ForEach-Object {
    @{ combustivel = $_.combustivel; valor = $_.valor; vendido_em = $_.quando.ToString('yyyy-MM-ddTHH:mm:sszzz') }
  })
  $resumo = ($grupo.Group | ForEach-Object { "$($_.combustivel) R$ $($_.valor.ToString('0.00#', [Globalization.CultureInfo]'pt-BR')) ($($_.quando.ToString('dd/MM HH:mm')), ""$($_.descricao)"")" }) -join '; '
  if ($Teste) { Registrar "[TESTE] CNPJ $($grupo.Name): $resumo"; continue }
  $corpo = @{ chave = $cfg.chave; cnpj = $grupo.Name; itens = $itens } | ConvertTo-Json -Depth 5 -Compress
  try {
    $r = Invoke-RestMethod -Method Post -Uri "$URL/rest/v1/rpc/conector_enviar" -ContentType 'application/json; charset=utf-8' `
      -Headers @{ apikey = $CHAVE_PUBLICA; 'User-Agent' = "AbasteceR-Conector/$VERSAO" } -Body ([Text.Encoding]::UTF8.GetBytes($corpo))
    Registrar "Enviado CNPJ $($grupo.Name): $($r.gravados) preço(s) novo(s). $resumo"
  } catch {
    $falhou = $true
    $msg = $_.ErrorDetails.Message
    if (-not $msg -and $_.Exception.Response) {
      try { $msg = (New-Object IO.StreamReader($_.Exception.Response.GetResponseStream(), [Text.Encoding]::UTF8)).ReadToEnd() } catch { }
    }
    if (-not $msg) { $msg = $_.Exception.Message }
    Registrar "ERRO ao enviar CNPJ $($grupo.Name): $msg"
  }
}

# só avança a "última leitura" se deu certo (senão tenta de novo na próxima rodada)
if (-not $Teste -and -not $falhou) {
  $cfg.ultima = $agora.ToString('o')
  $cfg | ConvertTo-Json | Set-Content -Path $arqCfg -Encoding UTF8
}
