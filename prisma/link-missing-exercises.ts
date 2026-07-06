/**
 * Dowiązuje ćwiczenia bez GIF-a do odpowiedników w ExerciseDB (ustawia
 * exerciseDbId). Dla każdego mamy angielski termin wyszukiwania; skrypt szuka
 * w oss.exercisedb.dev i wybiera najlepsze trafienie.
 *
 * DOMYŚLNIE suchy przebieg (pokazuje: polska nazwa → dopasowane „angielskie" [ID]).
 * Zapisuje realnie dopiero z --apply. Po --apply uruchom download-gifs.ts.
 *
 *   npx ts-node --project tsconfig.scripts.json prisma/link-missing-exercises.ts           (podgląd)
 *   npx ts-node --project tsconfig.scripts.json prisma/link-missing-exercises.ts --apply    (zapis)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const EDB = 'https://oss.exercisedb.dev';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Polska nazwa (dokładnie jak w bazie) → angielski termin do wyszukania w ExerciseDB.
const MAP: { name: string; query: string }[] = [
  { name: 'Abdukcja na maszynie', query: 'hip abduction' },
  { name: 'Dipy na maszynie siedząc', query: 'seated dip machine' },
  { name: 'French press (hantle)', query: 'dumbbell lying triceps extension' },
  { name: 'Hip extension przywodziciele', query: 'hip extension' },
  { name: 'Hip thrust na maszynie', query: 'hip thrust' },
  { name: 'Jednorącz odwrotne uginanie nadgarstka oparte o ławkę', query: 'reverse wrist curl' },
  { name: 'Kickback z hantlem', query: 'dumbbell triceps kickback' },
  { name: 'Martwy ciąg', query: 'barbell deadlift' },
  { name: 'Odwrotne rozpiętki z hantlami (tył barku)', query: 'dumbbell rear delt fly' },
  { name: 'Podciąganie na drążku (nachwytem)', query: 'pull up' },
  { name: 'Pompki', query: 'push up' },
  { name: 'Prostowanie nóg na maszynie (Leg extension)', query: 'leg extension' },
  { name: 'Prostowanie ramion hantlami leżąc (triceps)', query: 'lying dumbbell triceps extension' },
  { name: 'Prostowanie ramion na wyciągu (triceps pushdown)', query: 'cable pushdown' },
  { name: 'Przyciąganie hantli wzdłuż tułowia oburącz', query: 'dumbbell upright row' },
  { name: 'Rozciągający wykrok z obciążeniem', query: 'dumbbell lunge' },
  { name: 'Rozpiętki z hantlami na ławce poziomej', query: 'dumbbell fly' },
  { name: 'Ściąganie drążka na maszynie z przodu', query: 'lat pulldown' },
  { name: 'Ściąganie drążka wyciągu do klatki (szerokim nachwytem)', query: 'wide grip lat pulldown' },
  { name: 'Skłony boczne tułowia z obciążeniem', query: 'dumbbell side bend' },
  { name: 'Szrugi', query: 'barbell shrug' },
  { name: 'Uginanie młotkowe na ławce skośnej', query: 'incline hammer curl' },
  { name: 'Uginanie nadgarstków nachwytem ze sztangą z tyłu', query: 'barbell reverse wrist curl' },
  { name: 'Uginanie nóg leżąc na maszynie', query: 'lying leg curl' },
  { name: 'Uginanie ramion na drążku', query: 'ez barbell curl' },
  { name: 'Uginanie ramion na modlitewniku (Scott curl)', query: 'preacher curl' },
  { name: 'Uginanie ramion na modlitewniku ze sztangą - chwyt szeroki', query: 'ez barbell preacher curl' },
  { name: 'Uginanie ramion na modlitewniku ze sztangą - chwyt wąski', query: 'preacher curl' },
  { name: 'Uginanie ramion sztangielkami z supinacją nadgarstka', query: 'dumbbell biceps curl' },
  { name: 'Uginanie ramion z hantlami (jednocześnie)', query: 'dumbbell biceps curl' },
  { name: 'Uginanie ramion ze sztangą (biceps)', query: 'barbell curl' },
  { name: 'Unoszenie barków w zwisie na drążku', query: 'scapular pull up' },
  { name: 'Unoszenie kolan do klatki w zwisie', query: 'hanging knee raise' },
  { name: 'Unoszenie prostych nóg w zwisie na podwyższeniu', query: 'hanging leg raise' },
  { name: 'Wiosłowanie na maszynie (siedząc)', query: 'seated cable row' },
  { name: 'Wiosłowanie sztangą w opadzie tułowia', query: 'barbell bent over row' },
  { name: 'Wspięcia na palce stojąc na Maszynie Smitha', query: 'smith machine calf raise' },
  { name: 'Wyciskanie hantli na barki jednorącz', query: 'one arm dumbbell shoulder press' },
  { name: 'Wyciskanie hantli na ławce skośnej (górnej)', query: 'incline dumbbell bench press' },
  { name: 'Wyciskanie na maszynie siedząc', query: 'machine chest press' },
  { name: 'Wyciskanie sztangi na ławce poziomej', query: 'barbell bench press' },
  { name: 'Wypychanie ciężaru palcami na maszynie', query: 'calf press' },
  { name: 'Wypychanie nóg na maszynie (Leg press)', query: 'leg press' },
];

interface Hit { exerciseId: string; name: string }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

async function search(query: string): Promise<Hit[]> {
  try {
    const res = await fetch(`${EDB}/api/v1/exercises/search?search=${encodeURIComponent(query)}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: Hit[] };
    return Array.isArray(json?.data) ? json.data : [];
  } catch { return []; }
}

function bestHit(query: string, hits: Hit[]): Hit | null {
  if (hits.length === 0) return null;
  const qt = norm(query).split(' ').filter(Boolean);
  let best = hits[0]; let bestScore = -Infinity;
  for (const h of hits) {
    const ht = new Set(norm(h.name).split(' ').filter(Boolean));
    const overlap = qt.filter(t => ht.has(t)).length;
    // im więcej wspólnych słów, tym lepiej; kara za nadmiar dodatkowych słów
    const score = overlap * 10 - Math.abs(ht.size - qt.length);
    if (score > bestScore) { bestScore = score; best = h; }
  }
  return best;
}

async function main() {
  let linked = 0, notFoundEx = 0, noMatch = 0;

  for (const { name, query } of MAP) {
    const ex = await prisma.exercise.findFirst({ where: { name } });
    if (!ex) { notFoundEx++; console.log(`  ? brak w bazie: „${name}"`); continue; }

    const hits = await search(query);
    const hit = bestHit(query, hits);
    await sleep(250);

    if (!hit) { noMatch++; console.log(`  ! brak trafienia dla „${name}" (szukano: ${query})`); continue; }

    console.log(`  ${ex.exerciseDbId ? '↻' : '+'} „${name}"  →  „${hit.name}"  [${hit.exerciseId}]${ex.exerciseDbId ? `  (było: ${ex.exerciseDbId})` : ''}`);
    if (APPLY) {
      await prisma.exercise.update({ where: { id: ex.id }, data: { exerciseDbId: hit.exerciseId } });
      linked++;
    }
  }

  console.log(`\n${APPLY ? `Powiązano: ${linked}.` : '[SUCHY PRZEBIEG] Nic nie zapisano.'}  Brak w bazie: ${notFoundEx}, bez trafienia: ${noMatch}.`);
  if (!APPLY) console.log('Sprawdź dopasowania powyżej i uruchom ponownie z --apply.');
  else console.log('Teraz uruchom: npx ts-node --project tsconfig.scripts.json prisma/download-gifs.ts');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
