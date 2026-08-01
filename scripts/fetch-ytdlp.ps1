<#
.SYNOPSIS
Downloads the yt-dlp binary the desktop app bundles as a Tauri resource.

.DESCRIPTION
`tauri.conf.json` lists `resources/yt-dlp.exe`, but the 18 MB binary is gitignored, so a
fresh clone cannot build without fetching it first. This script is idempotent: it skips
the download when the file is already there unless -Force is passed.

yt-dlp also rots — social sites change and break extraction — so re-run with -Force to
pick up the current release.

.EXAMPLE
pwsh scripts/fetch-ytdlp.ps1
pwsh scripts/fetch-ytdlp.ps1 -Force
#>
[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$targetDir = Join-Path $repoRoot "apps/desktop/src-tauri/resources"
$target = Join-Path $targetDir "yt-dlp.exe"
$releaseUrl = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"

if ((Test-Path $target) -and (-not $Force)) {
    $sizeMb = [math]::Round((Get-Item $target).Length / 1MB, 1)
    Write-Output "yt-dlp.exe already present ($sizeMb MB). Pass -Force to refresh it."
    exit 0
}

if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
}

Write-Output "Downloading yt-dlp from $releaseUrl"

# Download beside the target and swap it in, so an interrupted download never leaves a
# truncated binary that would fail only at runtime.
$temp = "$target.download"
Invoke-WebRequest -Uri $releaseUrl -OutFile $temp -UseBasicParsing
Move-Item -Path $temp -Destination $target -Force

$version = & $target --version 2>$null
$sizeMb = [math]::Round((Get-Item $target).Length / 1MB, 1)
Write-Output "Installed yt-dlp $version ($sizeMb MB) at $target"
