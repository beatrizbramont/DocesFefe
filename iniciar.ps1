# Liga o site do DoceFefe.
#
# Como usar: abra o PowerShell nesta pasta e rode  .\iniciar.ps1
# (ou use o atalho iniciar.bat, que faz isso sozinho)
#
# ATENCAO: este arquivo e escrito so com letras sem acento de proposito.
# O PowerShell 5.1 do Windows le o arquivo como ANSI, e acentos ou travessoes
# viram caracteres estranhos que quebram o script na hora de rodar.

Set-Location $PSScriptRoot

if (-not (Test-Path ".venv")) {
    Write-Host "Primeira vez por aqui: preparando tudo, aguarde..." -ForegroundColor Yellow
    python -m venv .venv
    .\.venv\Scripts\python.exe -m pip install --upgrade pip --quiet
    .\.venv\Scripts\python.exe -m pip install -r requirements.txt --quiet
}

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Criei o arquivo .env. Abra ele e preencha o WhatsApp e a senha!" -ForegroundColor Red
}

$ip = (Get-NetIPAddress -AddressFamily IPv4 |
       Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL' -and $_.IPAddress -notlike '169.*' } |
       Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "  ====================================" -ForegroundColor Yellow
Write-Host "   DoceFefe no ar!" -ForegroundColor Yellow
Write-Host "  ====================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "   Site do cliente:  http://localhost:8003"
Write-Host "   Painel:           http://localhost:8003/admin"
if ($ip) {
    Write-Host "   Do celular:       http://${ip}:8003  (mesmo Wi-Fi)"
}
Write-Host ""
Write-Host "   Para desligar, aperte Ctrl + C nesta janela." -ForegroundColor DarkGray
Write-Host ""

.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8003
