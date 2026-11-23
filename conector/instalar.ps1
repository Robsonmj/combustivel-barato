# Instalador do Conector AbasteceR (não precisa de administrador)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName Microsoft.VisualBasic

$TITULO = 'Conector AbasteceR'
$origem = Split-Path -Parent $MyInvocation.MyCommand.Path
$base = Join-Path $env:LOCALAPPDATA 'AbasteceR'
New-Item -ItemType Directory -Force -Path $base | Out-Null

function Aviso([string]$texto, [string]$icone = 'Information') {
  [System.Windows.Forms.MessageBox]::Show($texto, $TITULO, 'OK', $icone) | Out-Null
}

# 1) chave do conector (gerada na Área do posto)
$chave = [Microsoft.VisualBasic.Interaction]::InputBox(
  "Cole a chave do conector.`n`nEla aparece na Área do posto do AbasteceR, no botão ""Gerar chave do conector"". Começa com abr_",
  $TITULO, '')
$chave = $chave.Trim()
if ($chave -notmatch '^abr_[0-9a-f]{48}$') { Aviso 'Chave inválida. Copie de novo na Área do posto e rode o instalador outra vez.' 'Warning'; exit 1 }

# 2) pasta onde o sistema do posto guarda os XML das NFC-e
$dlg = New-Object System.Windows.Forms.FolderBrowserDialog
$dlg.Description = 'Escolha a pasta onde o sistema do posto guarda os XML das NFC-e (notas de venda). Na dúvida, pergunte ao suporte do seu sistema.'
$dlg.ShowNewFolderButton = $false
if ($dlg.ShowDialog() -ne 'OK') { exit 1 }
$pasta = $dlg.SelectedPath

# 3) copia o conector e grava a configuração
Copy-Item -Path (Join-Path $origem 'AbasteceR-Conector.ps1') -Destination $base -Force
$script = Join-Path $base 'AbasteceR-Conector.ps1'
[pscustomobject]@{ pasta = $pasta; chave = $chave; ultima = $null } | ConvertTo-Json |
  Set-Content -Path (Join-Path $base 'conector.json') -Encoding UTF8

# 4) teste: lê as notas das últimas 24 h sem enviar
$saida = & powershell -NoProfile -ExecutionPolicy Bypass -File $script -Teste -Horas 24 2>&1 | Out-String
if ($saida -notmatch '\[TESTE\]') {
  Aviso ("Não encontrei vendas de combustível nas notas das últimas 24 horas dessa pasta.`n`n" + $saida.Trim() +
    "`n`nConfira se é a pasta certa (ela deve ter arquivos .xml das NFC-e) e rode o instalador de novo.") 'Warning'
  exit 1
}
$linhas = ($saida -split "`n" | Where-Object { $_ -match '\[TESTE\]' } | ForEach-Object { ($_ -replace '^.*\[TESTE\]\s*', '').Trim() }) -join "`n`n"
$ok = [System.Windows.Forms.MessageBox]::Show("Encontrei estes preços nas notas:`n`n$linhas`n`nEstão certos? Se sim, o conector passa a enviar só esses preços a cada 15 minutos.",
  $TITULO, 'YesNo', 'Question')
if ($ok -ne 'Yes') { Aviso 'Instalação cancelada. Nada foi enviado. Fale com o AbasteceR para ajustarmos.'; exit 1 }

# 5) agenda a cada 15 minutos (usuário atual, sem senha, sem administrador)
$acao = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
$gatilho = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 3650)
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName 'AbasteceR Conector' -Action $acao -Trigger $gatilho -Settings $ajustes -Force | Out-Null

# 6) primeiro envio agora
& powershell -NoProfile -ExecutionPolicy Bypass -File $script -Horas 24 | Out-Null
$ultimaLinha = Get-Content (Join-Path $base 'conector.log') -Encoding UTF8 | Select-Object -Last 1
if ($ultimaLinha -match 'ERRO') { Aviso "O conector foi instalado, mas o primeiro envio falhou:`n`n$ultimaLinha`n`nFale com o AbasteceR." 'Warning'; exit 1 }
Aviso "Pronto! O conector está instalado e envia os preços a cada 15 minutos enquanto este computador estiver ligado.`n`nÚltimo registro:`n$ultimaLinha"
