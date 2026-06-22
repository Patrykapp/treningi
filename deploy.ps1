# deploy.ps1 - commit i push zmian
# Uruchom:  .\deploy.ps1
# Vercel zdeployuje automatycznie po push na branch main.

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
    "app/api/dashboard/route.ts",
    "app/page.tsx",
    "app/historia/page.tsx"
)
git add -- $files

# Aby wrzucic WSZYSTKIE zmiany, zamiast powyzszego uzyj:
# git add -A

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host ""
    Write-Host "Brak zmian do commitu. Koniec." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Do commitu:" -ForegroundColor Cyan
$staged

$msg = "feat: inne aktywnosci licza sie do wyniku tygodnia i historii; przywrocony kafelek Challenge"
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
