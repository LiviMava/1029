[CmdletBinding()]
param(
    [int]$OrderId = 123,
    [ValidateSet('documents','prepare','question','sql','api','filter','keyword','vector','fusion','rerank','prompt','answer')]
    [string]$Through = 'answer',
    [string]$BaseUrl = 'http://127.0.0.1:8090'
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Local-Common.ps1')
Import-LocalEnvironment
$orderHeaders = @{}
if ($env:RAG_API_KEY) { $orderHeaders.Authorization = 'Bearer ' + $env:RAG_API_KEY }
$endpoint = "$BaseUrl/api/v1/tutorial/orders"
$body = @{question="我的订单 $OrderId 现在能退货吗？如果可以，该怎么操作？"} | ConvertTo-Json
$created = Invoke-RestMethod "$endpoint/runs" -Method Post -Headers $orderHeaders -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -SessionVariable orderSession
$orderOutput = Join-Path $PSScriptRoot "../.runtime/order-demo/$($created.runId)"
New-Item -ItemType Directory -Path $orderOutput -Force | Out-Null
try {
    foreach ($node in @('documents','prepare','question','sql','api','filter','keyword','vector','fusion','rerank','prompt','answer')) {
        $trace = Invoke-RestMethod "$endpoint/runs/$($created.runId)/$node" -Method Post -Headers $orderHeaders -WebSession $orderSession -TimeoutSec 180
        $trace | ConvertTo-Json -Depth 50 | Set-Content (Join-Path $orderOutput "$node.json") -Encoding utf8
        Write-Host "$node : $($trace.sender) -> $($trace.receiver) [$($trace.mode), $($trace.elapsedMs) ms]"
        if ($node -eq $Through) { break }
    }
    Write-Host "输入、输出及实际 Java 源码保存于 $orderOutput"
    return $trace
} finally {
    Invoke-RestMethod "$endpoint/runs/$($created.runId)" -Method Delete -Headers $orderHeaders -WebSession $orderSession | Out-Null
}
