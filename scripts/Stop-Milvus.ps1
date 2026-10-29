[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
wsl -d codex-milvus -u root -- docker stop codex-milvus
if($LASTEXITCODE -ne 0){throw 'Cannot stop Milvus'}
