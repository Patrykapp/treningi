# sprawdz-adrian.ps1 - jednorazowy ODCZYT danych Adriana (nic nie zmienia w bazie)
# Uruchom (z dowolnego miejsca), wklejajac do PowerShell:
#   & "C:\Users\patry\Desktop\apki\apka\Workout app\sprawdz-adrian.ps1"

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot
Write-Host "Czytam dane Adriana z bazy..." -ForegroundColor Cyan
Write-Host ""

$js = @'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ws = (() => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-((d.getDay()+6)%7)); return d.getTime(); })();
(async () => {
  const users = await prisma.user.findMany();
  const u = users.find(x => /adrian/i.test(x.name));
  if (!u) { console.log('Nie znaleziono Adriana. Uzytkownicy:', users.map(x=>x.name).join(', ')); return; }
  console.log('Poczatek biezacego tygodnia:', new Date(ws).toISOString().slice(0,10));
  console.log('');
  const since = new Date('2026-06-15');
  const [s, r, a] = await Promise.all([
    prisma.workoutSession.findMany({ where:{ userId:u.id, date:{gte:since} }, orderBy:{date:'desc'} }),
    prisma.runSession.findMany({ where:{ userId:u.id, date:{gte:since} }, orderBy:{date:'desc'} }),
    prisma.otherActivity.findMany({ where:{ userId:u.id, date:{gte:since} }, orderBy:{date:'desc'} }),
  ]);
  const t = d => new Date(d).getTime() >= ws ? '   <== TEN TYDZIEN' : '';
  console.log('SESJE SILOWE:'); s.forEach(x=>console.log('  '+new Date(x.date).toISOString().slice(0,10)+t(x.date)));
  console.log(''); console.log('BIEGI:'); r.forEach(x=>console.log('  '+new Date(x.date).toISOString().slice(0,10)+'  '+x.distance+'km'+t(x.date)));
  console.log(''); console.log('INNE AKTYWNOSCI:'); a.forEach(x=>console.log('  '+new Date(x.date).toISOString().slice(0,10)+'  '+x.type+'  (podpieta do treningu: '+(x.sessionId?'TAK':'nie')+')'+t(x.date)));
  const wk = arr => arr.filter(x=>new Date(x.date).getTime()>=ws).length;
  console.log(''); console.log('=== W TYM TYGODNIU: sesje='+wk(s)+'  biegi='+wk(r)+'  inne='+wk(a)+'  RAZEM='+(wk(s)+wk(r)+wk(a))+' ===');
})().catch(e=>console.error(e)).finally(()=>prisma.$disconnect());
'@

$tmp = Join-Path $PSScriptRoot "_sprawdz_tmp.cjs"
Set-Content -Path $tmp -Value $js -Encoding UTF8
try {
    node --env-file=.env $tmp
} finally {
    Remove-Item $tmp -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Gotowe. Skopiuj powyzszy wynik i wklej w czacie." -ForegroundColor Green
