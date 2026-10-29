[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$orderCases = @(
    @{Id=123; Status='CONDITIONAL'; Days=7; Policy='cn-standard-2026'},
    @{Id=124; Status='OUTSIDE_WINDOW'; Days=7; Policy='cn-standard-2026'},
    @{Id=125; Status='CONDITIONAL'; Days=14; Policy='eu-standard-2026'},
    @{Id=126; Status='INSUFFICIENT_EVIDENCE'; Days=0; Policy=$null},
    @{Id=129; Status='CONDITIONAL'; Days=5; Policy='cn-standard-2025'}
)
$orderResults = @()
foreach ($case in $orderCases) {
    $answer = & (Join-Path $PSScriptRoot 'Invoke-OrderTutorial.ps1') -OrderId $case.Id
    if ($answer.output.eligibility.status -ne $case.Status -or $answer.output.eligibility.returnDays -ne $case.Days) { throw "Order $($case.Id): unexpected decision" }
    $traceFolder = Join-Path $PSScriptRoot "../.runtime/order-demo/$($answer.runId)"
    foreach ($stage in @('keyword','vector','rerank')) {
        $packet = Get-Content (Join-Path $traceFolder "$stage.json") -Raw | ConvertFrom-Json
        foreach ($hit in $packet.output.hits) { if ($hit.documentId -ne $case.Policy) { throw "Order $($case.Id): $stage crossed policy scope" } }
    }
    if ($null -eq $case.Policy) {
        if ($answer.output.generationMode -ne 'NO_EVIDENCE_NO_MODEL_CALL') { throw 'No-evidence case invoked chat' }
    } elseif (-not $answer.output.citationNumbersValid) { throw "Order $($case.Id): answer missing valid policy citations" }
    $orderResults += @{order=$case.Id;status=$case.Status;returnDays=$case.Days;policy=$case.Policy;passed=$true;runId=$answer.runId;answer=$answer.output.answer}
}
$denied = $false
try { & (Join-Path $PSScriptRoot 'Invoke-OrderTutorial.ps1') -OrderId 999 -Through sql | Out-Null }
catch { if ($_.Exception.Response.StatusCode -eq 404) { $denied=$true } else { throw } }
if (-not $denied) { throw 'Another customer order must be denied' }
$report = @{checkedAt=[DateTimeOffset]::Now.ToString('o');cases=$orderResults;foreignOrderDenied=$denied;note='Live cloud models and Qdrant; fictional orders and policies. Structural and business-rule assertions, not sentence-level answer certification.'}
$report | ConvertTo-Json -Depth 20 | Set-Content (Join-Path $PSScriptRoot '../.runtime/order-demo/validation.json') -Encoding utf8
Write-Host 'PASS: five live end-to-end scenarios, both retrieval scope checks, citations and foreign-order denial.'
