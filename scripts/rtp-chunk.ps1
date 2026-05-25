# rtp-chunk.ps1 — kick off ONE chunk of the ready-to-print CGAL golden regen,
# split across 2 machines (this laptop + the desktop, sharing one OneDrive).
#
#   laptop :  powershell -File scripts\rtp-chunk.ps1 1     # chunk 1 of 2
#   desktop:  powershell -File scripts\rtp-chunk.ps1 2     # chunk 2 of 2
#
# Paths are derived from $env:OneDrive so the same script works on both machines
# no matter the Windows username. Each chunk writes its own
# <designer>\tests\rtp\golden-stl\cgal-chunks\chunk-k-of-2.json (resumable: just rerun).
# When both are done, merge with:  powershell -File scripts\rtp-chunk.ps1 merge
param(
  [Parameter(Mandatory = $true)][string]$Chunk,
  [int]$Of = 2
)
$ErrorActionPreference = "Stop"

$designer = Join-Path $env:OneDrive "4 T-Z\Volksswitch\Keyguard\My SCAD files\keyguard designer"
$rtp      = Join-Path $designer "tests\rtp"
if (-not (Test-Path $rtp))      { throw "RTP folder not found: $rtp" }
if (-not (Test-Path $designer)) { throw "Designer project not found: $designer" }
$env:KEYGUARD_RTP_ROOT      = $rtp
$env:KEYGUARD_DESIGNER_ROOT = $designer
$py = Join-Path $PSScriptRoot "build-rtp-cgal-golden.py"

if ($Chunk -eq "merge") {
  Write-Host "Merging RTP chunk files -> golden-rtp-cgal-stats.json"
  python $py --merge
  return
}

Write-Host "RTP chunk $Chunk/$Of   RTP=$rtp"
python $py --chunk "$Chunk/$Of"
