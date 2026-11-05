# Task 0 (Windows): record real `claude` output as ccpm test fixtures.
# ASCII-only on purpose: Windows PowerShell 5.1 misreads BOM-less UTF-8 scripts.
# Prereq: marketplace "ai-efficiency" already added (check: claude plugin marketplace list).
# NOTE: uninstalls and reinstalls <Plugin>@ai-efficiency (default sonarqube-mcp, which has a required sensitive "token") with that config left empty.
#       Afterwards restore it: claude plugin configure sonarqube-mcp@ai-efficiency
# Usage: powershell -ExecutionPolicy Bypass -File record.ps1 [-Plugin name]
# Run it from an EMPTY folder: the redaction check scans every file in that folder.
# Output files are written next to this script.

param([string]$Plugin = "sonarqube-mcp")

[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8
Set-Location $PSScriptRoot
$M = 'ai-efficiency'
$P = "$Plugin@$M"
$utf8 = New-Object Text.UTF8Encoding($false)   # no BOM, so JSON.parse works

function Save($file, $lines) {
  [IO.File]::WriteAllText((Join-Path $PSScriptRoot $file), (($lines | Out-String).TrimEnd() + "`n"), $utf8)
}

Write-Host '== (a) non-interactive install of a plugin missing a required sensitive config'
claude plugin uninstall $P -y *> $null
$out = $null | claude plugin install $P -y --json 2>&1
Save 'install-missing-secret.out' (@($out) + "exit=$LASTEXITCODE")
Get-Content install-missing-secret.out

Write-Host '== recording JSON output'
Save 'list.json' (claude plugin list --json 2>&1)

$full = (claude plugin list --available --json 2>&1 | Out-String) | ConvertFrom-Json
$ours  = @($full.available | Where-Object { $_.marketplaceName -eq $M })
$other = @($full.available | Where-Object { $_.marketplaceName -ne $M } | Select-Object -First 1)
Save 'list-available.json' ([pscustomobject]@{ installed = $full.installed; available = $ours + $other } | ConvertTo-Json -Depth 20)

Save 'marketplace-list.json' (claude plugin marketplace list --json 2>&1)
Save 'configure-unset.json'  (claude plugin configure $P --json 2>&1)
Save 'prune-dry-run.txt'     (claude plugin prune --dry-run 2>&1)
Save 'mcp-list.txt'          (claude mcp list 2>&1)

Write-Host '== redaction check: replace any REAL token below with REDACTED by hand'
$hits = Select-String -Path *.json, *.txt, *.out -Pattern 'token|password|secret|bearer'
if ($hits) { $hits | ForEach-Object { "$($_.Filename):$($_.LineNumber): $($_.Line)" } } else { 'no suspicious fields found' }
Write-Host ("done. files: " + ((Get-ChildItem -File).Name -join ', '))
