# deploy.ps1 - commit i push zmian
# Uruchom:        .\deploy.ps1
#   wszystkie:    .\deploy.ps1 -All
#   bez buildu:   .\deploy.ps1 -SkipBuild
# Vercel zdeployuje automatycznie po push na branch main.

param(
    [switch]$All,        # dodaj wszystkie zmiany (git add -A) zamiast listy ponizej
    [switch]$SkipBuild   # pomin lokalny 'npm run build' przed commitem
)

$ErrorActionPreference = 'Stop'

# Katalog repo = folder, w ktorym lezy ten skrypt
Set-Location -Path $PSScriptRoot
Write-Host "Repo: $(Get-Location)" -ForegroundColor Cyan

if (-not (Test-Path ".git")) {
    Write-Host "BLAD: brak .git w tym folderze." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Zmiany przed commitem:" -ForegroundColor Cyan
git status --short

# Pliki tej poprawki
$files = @(
    "app/historia/page.tsx",
    "app/page.tsx"
)

if ($All) {
    git add -A
} else {
    git add -- $files
}

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host ""
    Write-Host "Brak zmian do commitu. Koniec." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Do commitu:" -ForegroundColor Cyan
$staged

# Bramka jakosci: lokalny build musi przejsc, zanim cokolwiek wypchniemy
if (-not $SkipBuild) {
    Write-Host ""
    Write-Host "Lokalny build (npm run build)..." -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "BLAD: build sie nie powiodl. Nic nie zostalo wypchniete." -ForegroundColor Red
        exit 1
    }
    Write-Host "Build OK." -ForegroundColor Green
}

$msg = "fix: biegi w historii + aktywnosc podpieta do treningu nie liczy sie jako osobny trening (spojnosc dashboardu z historia)"
git commit -m $msg

$branch = git rev-parse --abbrev-ref HEAD

Write-Host ""
Write-Host "Pull --rebase z origin/$branch" -ForegroundColor Cyan
git pull --rebase origin $branch

Write-Host ""
Write-Host "Push do origin/$branch" -ForegroundColor Cyan
git push origin $branch

Write-Host ""
Write-Host "Gotowe. Vercel zacznie deploy automatycznie." -ForegroundColor Green
