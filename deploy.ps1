# deploy.ps1 - install + commit + push (Vercel deployuje automatycznie po push)
# Uruchom (domyslnie wszystkie zmiany):
#   .\deploy.ps1
#   .\deploy.ps1 -Message "moj opis commitu"
#   .\deploy.ps1 -Only "app/page.tsx","app/historia/page.tsx"   # tylko wybrane pliki
#   .\deploy.ps1 -SkipBuild      # pomin lokalny 'npm run build'
#   .\deploy.ps1 -SkipInstall    # pomin 'npm install'

param(
    [string]$Message = "refresh UI: ikony lucide-react, hover/focus states, skeletony, responsywnosc md/lg na wszystkich podstronach",
    [string[]]$Only,       # jesli podane -> commit tylko tych plikow (git add -- <lista>)
    [switch]$SkipBuild,    # pomin lokalny 'npm run build' przed commitem
    [switch]$SkipInstall   # pomin 'npm install' (np. gdy node_modules juz aktualne)
)

$ErrorActionPreference = 'Stop'

# Katalog repo = folder, w ktorym lezy ten skrypt
Set-Location -Path $PSScriptRoot
Write-Host "Repo: $(Get-Location)" -ForegroundColor Cyan

if (-not (Test-Path ".git")) {
    Write-Host "BLAD: brak .git w tym folderze." -ForegroundColor Red
    exit 1
}

if (-not $SkipInstall) {
    Write-Host ""
    Write-Host "npm install (aktualizacja node_modules / package-lock.json)..." -ForegroundColor Cyan
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "BLAD: npm install sie nie powiodl." -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "Zmiany przed commitem:" -ForegroundColor Cyan
git status --short

if ($Only) {
    git add -- $Only
} else {
    git add -A
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

git commit -m $Message

$branch = git rev-parse --abbrev-ref HEAD

Write-Host ""
Write-Host "Pull --rebase z origin/$branch" -ForegroundColor Cyan
git pull --rebase origin $branch

Write-Host ""
Write-Host "Push do origin/$branch" -ForegroundColor Cyan
git push origin $branch

Write-Host ""
Write-Host "Gotowe. Vercel zacznie deploy automatycznie." -ForegroundColor Green
