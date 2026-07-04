# =============================================================================
#  setup-gify-v2.ps1
#  Podłącza animowane media z ExerciseDB V2 do aplikacji:
#    1. dodaje kolumny V2 do bazy (prisma db push)
#    2. uzupełnia media dla ćwiczeń (skrypt backfill, wznawialny)
#    3. (opcjonalnie) uruchamia aplikację w trybie dev
#
#  Uruchomienie (w folderze "Workout app"):
#    Prawy klik na pliku  ->  "Uruchom w programie PowerShell"
#  albo w terminalu:
#    powershell -ExecutionPolicy Bypass -File .\setup-gify-v2.ps1
#
#  Parametry (opcjonalne):
#    -Limit 30     tylko pierwsze 30 ćwiczeń (test, oszczędza limit RapidAPI)
#    -SkipPush     pomiń dodawanie kolumn (gdy baza już zaktualizowana)
#    -Dev          po zakończeniu uruchom "npm run dev"
#
#  Przyklady:
#    .\setup-gify-v2.ps1 -Limit 30
#    .\setup-gify-v2.ps1
#    .\setup-gify-v2.ps1 -Dev
# =============================================================================

param(
  [int]$Limit = 0,
  [switch]$SkipPush,
  [switch]$Dev
)

# Uwaga: npm/npx pisza ostrzezenia na stderr, wiec NIE ustawiamy 'Stop'
# (w Windows PowerShell 5.1 przerwaloby to na falszywym bledzie).
# Powodzenie kazdego kroku sprawdzamy recznie przez $LASTEXITCODE.
$ErrorActionPreference = 'Continue'

function Info($m)  { Write-Host $m -ForegroundColor Cyan }
function Ok($m)    { Write-Host $m -ForegroundColor Green }
function Warn($m)  { Write-Host $m -ForegroundColor Yellow }
function Fail($m)  { Write-Host $m -ForegroundColor Red }

# Pracuj zawsze w folderze skryptu (czyli w "Workout app")
Set-Location -Path $PSScriptRoot

Write-Host ""
Info "=== Konfiguracja animacji ExerciseDB V2 ==="
Write-Host "Folder: $PSScriptRoot"
Write-Host ""

# --- 1. Sprawdzenia wstepne -------------------------------------------------
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Fail "Nie znaleziono 'npm'. Zainstaluj Node.js (https://nodejs.org) i sprobuj ponownie."
  exit 1
}
if (-not (Test-Path ".\package.json")) {
  Fail "Nie widze package.json. Uruchom skrypt z folderu 'Workout app'."
  exit 1
}

# --- 2. Klucz RapidAPI w .env ----------------------------------------------
if (-not (Test-Path ".\.env")) {
  Fail "Brak pliku .env. Dodaj go z RAPIDAPI_KEY i uruchom ponownie."
  exit 1
}
$envText = Get-Content ".\.env" -Raw
$m = [regex]::Match($envText, '(?m)^\s*RAPIDAPI_KEY\s*=\s*"?([^"\r\n]*)"?\s*$')
if (-not $m.Success -or [string]::IsNullOrWhiteSpace($m.Groups[1].Value)) {
  Fail "W pliku .env brakuje klucza. Ustaw linie:  RAPIDAPI_KEY=""twoj_klucz"""
  Warn "Klucz skopiujesz z RapidAPI (pole X-RapidAPI-Key)."
  exit 1
}
Ok "Klucz RAPIDAPI_KEY znaleziony w .env."

# --- 3. Kolumny w bazie (prisma db push) -----------------------------------
if (-not $SkipPush) {
  Write-Host ""
  Info "[1/3] Dodaje kolumny V2 do bazy (prisma db push)..."
  npm run db:push
  if ($LASTEXITCODE -ne 0) { Fail "prisma db push nie powiodl sie. Sprawdz polaczenie z baza (DIRECT_URL w .env)."; exit 1 }
  Ok "Baza zaktualizowana."
} else {
  Warn "[1/3] Pomijam prisma db push (-SkipPush)."
}

# --- 4. Backfill mediow -----------------------------------------------------
Write-Host ""
if ($Limit -gt 0) {
  Info "[2/3] Uzupelniam media dla pierwszych $Limit cwiczen (test)..."
  npx ts-node --project tsconfig.scripts.json prisma/link-v2-media.ts --limit $Limit
} else {
  Info "[2/3] Uzupelniam media dla wszystkich cwiczen..."
  npx ts-node --project tsconfig.scripts.json prisma/link-v2-media.ts
}
if ($LASTEXITCODE -ne 0) {
  Fail "Backfill zakonczyl sie bledem."
  Warn "Jesli to byl limit zapytan (429), uruchom skrypt ponownie pozniej - ruszy od miejsca, gdzie skonczyl."
  exit 1
}
Ok "Media uzupelnione."

# --- 5. Restart / dev -------------------------------------------------------
Write-Host ""
if ($Dev) {
  Info "[3/3] Uruchamiam aplikacje (npm run dev)... Zatrzymasz ja przez Ctrl+C."
  npm run dev
} else {
  Ok "[3/3] Gotowe. Zrestartuj aplikacje (npm run dev) albo wdroz (deploy.ps1), zeby zobaczyc animacje."
  Warn "Uwaga: na darmowym planie RapidAPI media maja znak wodny."
}
