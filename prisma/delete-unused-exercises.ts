/**
 * Usuwa DOKŁADNIE wskazaną listę ćwiczeń (poniżej TO_DELETE) — nic więcej.
 *
 * Twarda blokada bezpieczeństwa: jeśli którekolwiek z tych ćwiczeń MA historię
 * (jakikolwiek wpis treningowy), zostaje POMINIĘTE i nieusunięte. Cokolwiek z
 * historią jest nietykalne (dodatkowo zablokowałby to klucz obcy w bazie).
 *
 * DOMYŚLNIE tylko suchy przebieg (pokazuje, co zniknie — nic nie kasuje).
 * Aby NAPRAWDĘ usunąć, dodaj flagę --delete:
 *
 *   npx ts-node --project tsconfig.scripts.json prisma/delete-unused-exercises.ts            (podgląd)
 *   npx ts-node --project tsconfig.scripts.json prisma/delete-unused-exercises.ts --delete   (usuwa)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DO_DELETE = process.argv.includes('--delete');

// Dokładna lista ćwiczeń do usunięcia (nazwy jak w bazie).
const TO_DELETE = [
  // 1. Bieg/skoki w miejscu
  'Bieg w miejscu przy ścianie z wysokim unoszeniem kolan',
  'Bieg z krótkim krokiem',
  'Krok naprzemienny przód-tył',
  'Krok narciarski',
  'Pajacyk w miejscu',
  'Pajacyki',
  'Przeskoki nożycowe',
  'Wyskok w kształcie gwiazdy',
  'Nożyce',
  // 2. Akrobacje / piłka
  'Uginanie bicepsa na piłce gimnastycznej z uniesioną nogą',
  'Uginanie bicepsa z wykrokiem i ruchem na kręgle (bowling motion)',
  'Uginanie przedramion z hantlami w klęku przed piłką gimnastyczną',
  'Pompki na piłce BOSU',
  'Wąskie pompki na piłce gimnastycznej',
  'Lekkie skręty tułowia w oparciu klatką o piłkę gimnastyczną',
  'Skręty tułowia w oparciu klatką o piłkę gimnastyczną',
  // 3. Rozciąganie / joga / mobilność
  'Pies z głową w górę (joga)',
  'Dynamiczne rozciąganie klatki piersiowej',
  'Rozciąganie biodra i boku na wałku',
  'Rozciąganie boku tułowia stojąc',
  'Rozciąganie łydki w siadzie',
  'Rozciąganie łydki za pomocą liny lub taśmy',
  'Rozciąganie mięśnia piszczelowego tylnego',
  'Rozciąganie mięśnia prostego uda leżąc przodem ze wsparciem',
  'Rozciąganie szyi w bok',
  'Rozciąganie szyi z naciskiem dłoni',
  'Rozciąganie w pozycji żaby z kołysaniem',
  'Rozciąganie w wykroku (dla biegaczy)',
  'Rozciąganie zginaczy bioder na piłce gimnastycznej',
  // 4. Zbędne opisy / duplikaty
  'Głęboki przysiad z zatrzymaniem (słowiański przykuc)',
  'Lekkie ściąganie wyciągu górnego z szerokim drążkiem',
  'Padnij-powstań (Burpee)',
  'Skakanie na skakance',
  'Marsz na orbitreku (wersja rozszerzona)',
  'Marsz pulsacyjny na orbitreku',
  'Intensywna jazda na rowerze stacjonarnym',
  'Spokojna jazda na rowerze stacjonarnym',
  'Uginanie nadgarstków ze sztangą podchwytem (wersja 2)',
  // 5. Plener / lekkoatletyka
  'Bieg',
  'Bieg 3km',
  'Start do biegu / Wykrok biegowy',
  // 6. Kalistenika ekstremalna / nisza
  'Niemożliwe pompki na poręczach (Impossible dips - na przedramionach)',
  'Żelazny krzyż z hantlami (izometria barków)',
  'Izometryczne wycieraczki',
  'Wiosłowanie z masą własnego ciała w przysiadzie',

  // ══ PARTIA 2 ══════════════════════════════════════════════════════════════
  // Duble/klony — usuwamy jedną wersję z pary (drugą zostawiamy):
  'Wyciskanie żołnierskie (OHP)',                         // zostaje: Wyciskanie sztangi nad głowę (OHP)
  'Upright row ze sztangą',                               // zostaje: Przyciąganie sztangi wzdłuż tułowia stojąc (wersja 2)
  'Wyciskanie hantli na barki siedząc na ławce',          // zostaje: Wyciskanie hantli nad głowę (siedząc)
  'Wyciskanie sztangi na ławce skośnej w dół',            // zostaje: ...na ławce skośnej (dolnej)
  'Wyciskanie sztangi na ławce skośnej w górę',           // zostaje: ...na ławce skośnej (górnej)
  'Unoszenie hantli przodem',                             // zostaje: Wznosy przodem z hantlami
  'Francuskie wyciskanie sztangi leżąc na ławce (triceps)', // zostaje: French press (sztanga)
  'Uginanie przedramion z hantlami chwytem młotkowym',    // zostaje: Uginanie ramion z hantlem (Hammer curl)

  // Przekombinowana gimnastyka / wynalazki:
  'Krok z klęku z wymachem z obciążeniem',
  'Przyciąganie sztangi wzdłuż tułowia z silnym napięciem tułowia',
  'Rozpiętki na wyciągu ze skosem w górę (na piłce gimnastycznej)',
  'Wyciskanie jednorącz na wyciągu ze skosem w górę (na piłce gimnastycznej)',
  'Skłony boczne tułowia z obciążeniem na piłce gimnastycznej',
  'Wychylenia w przód na sztandze w klęku (Barbell rollout)',
  'Zaawansowany martwy ciąg na prostych nogach z hantlami',
  'Pompki z wykopem nogi do wewnątrz',
  'Pompki z wyciągnięciem ramion (Superman)',
  'Przysiad z wyciągnięciem rąk nad głowę i rotacją tułowia',

  // Nisza / gumy oporowe:
  'Unoszenie hantli bokiem z kciukami w górę (Full Can)',
  'Unoszenie ramion w kształt litery Y z gumą oporową',
  'Wyciskanie Bradforda sztangą siedząc (Rocky Press)',
  'Wyciskanie hantli chwytem Scotta (Scott Press)',
  'Naprzemienne uginanie przedramion z gumą oporową',
  'Pompki z przedramion (Sfinks) - wersja z gumą',
  'Wąskie scyzoryki z gumą oporową (Jackknife)',
  'Skręty tułowia w klęku z gumą oporową z góry',
  'Wyciskanie na klatkę z gumą oporową siedząc',
  'Odwodzenie nóg siedząc z gumą oporową',

  // Przedramiona — zostają tylko: Uginanie nadgarstków ze sztangą podchwytem
  //                              + Odwrotne uginanie nadgarstków ze sztangą nachwytem
  'Jednorącz odwrotne uginanie nadgarstka z hantlą (nachwytem)',
  'Jednorącz uginanie nadgarstka oparte o ławkę (wersja siłowa)',
  'Jednorącz uginanie nadgarstka podchwytem oparte o ławkę',
  'Odwrotne uginanie nadgarstków na wyciągu (nachwytem)',
  'Odwrotne uginanie nadgarstków z gumą oporową',
  'Odwrotne uginanie nadgarstków z hantlami',
  'Odwrotne uginanie nadgarstków z hantlami oparte o ławkę (nachwytem)',
  'Uginanie nadgarstków na wyciągu (podchwytem)',
  'Uginanie nadgarstków podchwytem siedząc na Maszynie Smitha',
  'Uginanie nadgarstków z hantlami oparte o ławkę (podchwytem)',
  'Uginanie nadgarstków z hantlami podchwytem siedząc',
  'Uginanie nadgarstków z tyłu stojąc na Maszynie Smitha',
  'Uginanie nadgarstków ze sztangą z tyłu stojąc',
  'Pompki z przejściem na przedramiona (Plank Press)',
  'Zaciskanie dłoni z obciążeniem stojąc (wzmacnianie chwytu)',
  'Zwijanie palców (wzmacnianie chwytu)',

  // Łydki — zostają tylko: Wspięcia na palce (Calf raises, stojąc)
  //                       + Wspięcia na palce na maszynie (siedząc)
  'Izolowane wspięcia na palce jednonóż na hantli',
  'Wspięcia na palce jednonóż na podłodze',
  'Wspięcia na palce jednonóż na podłodze na Maszynie Smitha',
  'Wspięcia na palce jednonóż siedząc na Maszynie Smitha',
  'Wspięcia na palce jednonóż stojąc na uchwycie hantli',
  'Wspięcia na palce jednonóż stojąc z wyciągiem dolnym',
  'Wspięcia na palce jednonóż w opadzie (Ośle wspięcia)',
  'Wspięcia na palce jednonóż z gumą oporową',
  'Wspięcia na palce jednonóż z hantlą',
  'Wspięcia na palce na maszynie Hack',
  'Wspięcia na palce siedząc na maszynie',
  'Wspięcia na palce stojąc na schodach',
  'Wspięcia na palce stojąc z hantlami',
  'Wspięcia na palce stojąc z masą własnego ciała',
  'Wspięcia na palce w opadzie na maszynie (Ośle wspięcia)',
  'Wspięcia na palce ze sztangą stojąc na podłodze',
  'Wspięcia na palce ze sztangą stojąc na podwyższeniu',
  'Wspięcia na palce ze sztangą z przejściem na pięty (kołysanie)',

  // Podłogowe cardio:
  'Burpee',
  'Burpee z hantlami',
  'Burpee z pajacykiem',
  'Mountain climbers',
  'Niedźwiedzi chód (bear crawl)',
  'Niedźwiedzi chód naprzemienny (bear crawl)',
  'Półprzysiady',
  'Półprzysiad z wyskokiem',
  'Wykroki chodzone z wysokim unoszeniem kolana',
];

const norm = (s: string) => s.trim().toLowerCase();

async function main() {
  const all = await prisma.exercise.findMany({
    select: { id: true, name: true, _count: { select: { entries: true } } },
  });
  const byName = new Map(all.map(e => [norm(e.name), e]));

  const matched: { id: string; name: string; entries: number }[] = [];
  const notFound: string[] = [];
  for (const name of TO_DELETE) {
    const e = byName.get(norm(name));
    if (e) matched.push({ id: e.id, name: e.name, entries: e._count.entries });
    else notFound.push(name);
  }

  const withHistory = matched.filter(e => e.entries > 0);   // NIE ruszamy
  const toDelete = matched.filter(e => e.entries === 0);

  console.log(`\nNa liście do usunięcia:            ${TO_DELETE.length}`);
  console.log(`  • znalezione w bazie:            ${matched.length}`);
  console.log(`  • DO USUNIĘCIA (0 historii):     ${toDelete.length}`);
  console.log(`  • POMINIĘTE (mają historię):     ${withHistory.length}`);
  console.log(`  • nie znaleziono (inna nazwa?):  ${notFound.length}`);

  if (withHistory.length) {
    console.log('\n⚠ Pominięte, bo mają historię (NIE usuwam):');
    withHistory.forEach(e => console.log(`   ! ${e.name}`));
  }
  if (notFound.length) {
    console.log('\n? Nie znaleziono w bazie (może już usunięte lub inna pisownia):');
    notFound.forEach(n => console.log(`   ? ${n}`));
  }

  console.log('\nDo usunięcia:');
  if (toDelete.length === 0) console.log('   (nic)');
  else toDelete.forEach(e => console.log(`   - ${e.name}`));

  if (!DO_DELETE) {
    console.log('\n[SUCHY PRZEBIEG] Nic nie usunięto. Aby usunąć, uruchom ponownie z flagą --delete.');
    return;
  }
  if (toDelete.length === 0) {
    console.log('\nNic do usunięcia.');
    return;
  }
  const res = await prisma.exercise.deleteMany({ where: { id: { in: toDelete.map(e => e.id) } } });
  console.log(`\n✓ Usunięto ${res.count} ćwiczeń. Historia i pozostałe ćwiczenia nietknięte.`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
