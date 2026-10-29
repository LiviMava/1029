[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$keepers=Get-CimInstance Win32_Process -Filter "Name='wsl.exe'" | Where-Object { $_.CommandLine -match 'codex-milvus.*sleep infinity' }
if(-not $keepers){Start-Process wsl.exe -ArgumentList '-d codex-milvus -u root -- sleep infinity' -WindowStyle Hidden | Out-Null}
wsl -d codex-milvus -u root -- systemctl start docker
if($LASTEXITCODE -ne 0){throw 'Cannot start Docker in codex-milvus WSL'}
wsl -d codex-milvus -u root -- docker start codex-milvus
if($LASTEXITCODE -ne 0){throw 'Cannot start Milvus'}
Write-Host 'Milvus: http://127.0.0.1:19530; health: http://127.0.0.1:9091/healthz'
