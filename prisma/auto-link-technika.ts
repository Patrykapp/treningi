/**
 * Auto-linkuje ćwiczenia do ExerciseDB (nowe API /api/v1).
 * Uruchom: npx tsx prisma/auto-link-technika.ts
 *
 * Strategia:
 * 1. Pobiera WSZYSTKIE ćwiczenia z ExerciseDB (cursor pagination, ~1500)
 * 2. Pobiera free-exercise-db z GitHub (900 ćwiczeń, standardowe nazwy angielskie)
 * 3. Dla każdego polskiego ćwiczenia: szuka w obu źródłach najlepszego dopasowania
 * 4. Zapisuje exerciseDbId (z ExerciseDB) do bazy
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE = 'https://oss.exercisedb.dev';
const FREE_DB_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';

interface ApiExercise {
  exerciseId: string;
  name: string;
  gifUrl: string;
  bodyParts: string[];
  equipments: string[];
  targetMuscles: string[];
  secondaryMuscles: string[];
}

interface FreeExercise {
  name: string;
  category: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string;
  instructions: string[];
  level: string;
}

// ─── Pobierz WSZYSTKIE ćwiczenia z ExerciseDB (cursor pagination) ─────────────
async function fetchAllExerciseDb(): Promise<ApiExercise[]> {
  const all: ApiExercise[] = [];
  let cursor: string | null = null;
  let page = 0;

  do {
    const url = cursor
      ? `${BASE}/api/v1/exercises?limit=100&cursor=${cursor}`
      : `${BASE}/api/v1/exercises?limit=100`;

    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) { console.error(`\nBłąd HTTP ${res.status} na stronie ${page + 1}`); break; }

      const json = await res.json() as {
        success: boolean;
        meta: { total: number; hasNextPage: boolean; nextCursor?: string };
        data: ApiExercise[];
      };

      const pageData = json.data || [];
      all.push(...pageData);
      cursor = json.meta?.hasNextPage && json.meta?.nextCursor ? json.meta.nextCursor : null;
      page++;

      const total = json.meta?.total || '?';
      process.stdout.write(`\r  ExerciseDB: pobrano ${all.length}/${total} (strona ${page})...   `);

      // Małe opóźnienie żeby nie przeciążyć API
      if (cursor) await new Promise(r => setTimeout(r, 80));
    } catch (e) {
      console.error(`\nBłąd na stronie ${page + 1}:`, e);
      break;
    }
  } while (cursor);

  return all;
}

// ─── Pobierz free-exercise-db z GitHub ───────────────────────────────────────
async function fetchFreeDb(): Promise<FreeExercise[]> {
  try {
    const res = await fetch(FREE_DB_URL);
    if (!res.ok) return [];
    return await res.json() as FreeExercise[];
  } catch { return []; }
}

// ─── Mapowanie: polska grupa mięśniowa → ExerciseDB bodyPart ─────────────────
function getBodyPart(muscleGroup: string): string {
  const mg = muscleGroup.toLowerCase();
  if (mg.includes('klat') || mg.includes('klatka')) return 'chest';
  if (mg.includes('plec')) return 'back';
  if (mg.includes('bark') || mg.includes('ramion')) return 'shoulders';
  if (mg === 'biceps' || mg.includes('biceps')) return 'upper arms';
  if (mg === 'triceps' || mg.includes('triceps')) return 'upper arms';
  if (mg.includes('nogi') || mg.includes('uda')) return 'upper legs';
  if (mg.includes('brzuch') || mg.includes('abs')) return 'waist';
  if (mg.includes('przedrami')) return 'lower arms';
  if (mg.includes('lydka') || mg.includes('calves')) return 'lower legs';
  if (mg.includes('kalistenst') || mg.includes('kalenist')) return 'upper arms';
  if (mg.includes('extra') || mg.includes('cardio')) return 'cardio';
  return 'back';
}

// ─── Mapa: polska nazwa → angielskie słowa kluczowe do szukania ──────────────
// Kluczem jest fragment shortName (lowercase), wartością angielskie terminy
const MANUAL_MAP: [string, string[]][] = [
  // Barki
  ['face pull',                    ['face pull']],
  ['unoszenie hantli przodem',     ['front raise', 'front dumbbell raise']],
  ['unoszenie hantli w bok',       ['lateral raise dumbbell', 'dumbbell lateral']],
  ['unoszenie boczne na lince',    ['cable lateral raise', 'lateral raise cable']],
  ['odwrotne rozpiętki w opadzie', ['reverse fly', 'rear delt fly', 'bent over fly']],
  ['odwrotne rozpiętki na maszyn', ['rear delt machine', 'reverse fly machine']],
  ['wyciskanie arnolda',           ['arnold press', 'arnold']],
  ['wyciskanie hantlami siedząc',  ['dumbbell shoulder press', 'seated shoulder press']],
  ['wyciskanie sztangi',           ['barbell shoulder press', 'overhead press barbell', 'military press']],
  ['upright row ze sztangą',       ['barbell upright row', 'upright row barbell']],
  ['upright row z hantlami',       ['dumbbell upright row', 'upright row dumbbell']],
  ['szrugsy ze sztangą',           ['barbell shrug', 'shrug barbell']],
  ['szrugsy na maszynie',          ['machine shrug', 'shrug machine']],
  ['szrugsy',                      ['dumbbell shrug', 'shrug dumbbell']],
  ['pikowane pompki',              ['pike push', 'pike pushup']],
  ['wznosy kettlem',               ['kettlebell upright row', 'kettlebell shrug']],
  // Biceps
  ['uginanie ze sztangą prostą',   ['barbell curl', 'barbell bicep curl']],
  ['uginanie z hantlami stojąc',   ['dumbbell curl', 'dumbbell bicep curl standing']],
  ['uginanie naprzemienne',        ['alternating curl', 'alternate dumbbell curl']],
  ['uginanie na lince',            ['cable curl', 'cable bicep curl']],
  ['uginanie na maszynie',         ['machine curl', 'bicep machine']],
  ['uginanie na skosie',           ['incline curl', 'incline dumbbell curl']],
  ['spider curl',                  ['spider curl']],
  ['uginanie koncentryczne',       ['concentration curl']],
  ['modlitewnik',                  ['preacher curl', 'preacher']],
  ['uginanie gryfem łamanym',      ['ez bar curl', 'ez curl']],
  ['uginanie z supinacją',         ['supination curl', 'dumbbell supination']],
  ['chwyt młotkowy',               ['hammer curl']],
  ['wersja 21',                    ['21s', '21 curl']],
  // Brzuch
  ['deska (plank)',                ['plank']],
  ['deska bokiem',                 ['side plank']],
  ['brzuszki klasyczne',           ['crunch', 'sit-up', 'situp']],
  ['brzuszki skośne',              ['oblique crunch', 'oblique situp']],
  ['russian twist',                ['russian twist']],
  ['mountain climbers',            ['mountain climber']],
  ['kółko brzuszne',               ['ab wheel', 'ab rollout', 'wheel rollout']],
  ['nożyce',                       ['scissors', 'leg scissors', 'flutter kick']],
  ['wznos nóg na poręczach',       ['hanging leg raise', 'leg raise hanging']],
  ['crunch na lince',              ['cable crunch', 'kneeling cable crunch']],
  ['dead bug',                     ['dead bug']],
  ['v-up',                         ['v-up', 'v up']],
  ['pallof press',                 ['pallof press', 'anti rotation press']],
  ['hollow body',                  ['hollow body', 'hollow hold']],
  ['wojskowe brzuszki',            ['sit up', 'situp', 'full sit up']],
  ['unoszenie bioder',             ['hip raise', 'bridge', 'glute bridge']],
  ['unoszenie nóg w zwisie',       ['hanging leg raise', 'hanging knee raise']],
  ['odpoczynek komandosa',         ['commando plank', 'plank up down']],
  // Klata
  ['wyciskanie sztangi skos dodatn', ['incline bench press barbell', 'incline barbell press']],
  ['wyciskanie sztangi skos ujemny', ['decline bench press barbell', 'decline barbell press']],
  ['wyciskanie hantlami płasko',   ['flat dumbbell press', 'dumbbell bench press flat']],
  ['wyciskanie hantlami skos ujemn', ['decline dumbbell press']],
  ['wyciskanie hantlami skos',     ['incline dumbbell press', 'incline dumbbell bench']],
  ['rozpiętki na lince',           ['cable fly', 'cable crossover', 'cable chest fly']],
  ['rozpiętki na maszynie',        ['pec deck', 'machine fly', 'chest fly machine']],
  ['wyciskanie na maszynie',       ['chest press machine', 'machine chest press', 'shoulder press machine', 'machine press']],
  ['pullover ze sztangielką',      ['pullover dumbbell', 'dumbbell pullover']],
  ['pompki diamentowe',            ['diamond push', 'close grip push up']],
  ['pompki szeroki rozstaw',       ['wide push up', 'wide grip push']],
  ['landmine press',               ['landmine press']],
  // Klatka piersiowa
  ['ławka płaska',                 ['barbell bench press', 'flat bench press barbell']],
  ['ławka skos',                   ['incline bench press', 'incline barbell']],
  ['ława sztangielki',             ['dumbbell bench press']],
  ['rozpiętki',                    ['dumbbell fly', 'chest fly dumbbell']],
  ['dipy',                         ['chest dip', 'dip chest', 'tricep dip']],
  // Nogi
  ['przysiady goblet',             ['goblet squat']],
  ['przysiady frontalne',          ['front squat', 'barbell front squat']],
  ['przysiady bułgarskie',         ['bulgarian split squat', 'split squat']],
  ['przysiady sumo',               ['sumo squat']],
  ['wypady z hantlami',            ['dumbbell lunge', 'lunge dumbbell']],
  ['wypady kroczące',              ['walking lunge', 'lunge walking']],
  ['wypady ze sztangą',            ['barbell lunge', 'lunge barbell']],
  ['martwy ciąg rumuński',         ['romanian deadlift', 'rdl', 'stiff leg deadlift']],
  ['martwy ciąg sumo',             ['sumo deadlift']],
  ['martwy ciąg na prostych nogach', ['stiff leg deadlift', 'straight leg deadlift']],
  ['hip thrust ze sztangą',        ['barbell hip thrust', 'hip thrust barbell']],
  ['hip thrust na maszynie',       ['machine hip thrust', 'hip thrust machine']],
  ['uginanie nóg leżąc',           ['lying leg curl', 'leg curl lying']],
  ['uginanie nóg siedząc',         ['seated leg curl', 'leg curl seated']],
  ['wspięcia na palce stojąc',     ['standing calf raise', 'calf raise standing']],
  ['wspięcia na palce siedząc',    ['seated calf raise', 'calf raise seated']],
  ['hack squat na maszynie',       ['hack squat', 'machine hack squat']],
  ['step-up z hantlami',           ['step up dumbbell', 'dumbbell step up']],
  ['przywodziciele na maszynie',   ['adductor machine', 'hip adduction machine']],
  ['odwodziciele na maszynie',     ['abductor machine', 'hip abduction machine']],
  ['glute kickback na maszynie',   ['glute kickback', 'cable kickback']],
  ['nordic curl',                  ['nordic curl', 'nordic hamstring', 'leg curl nordic']],
  ['box squat',                    ['box squat']],
  ['sissy squat',                  ['sissy squat']],
  ['leg extension',                ['leg extension', 'knee extension']],
  ['wypychanie na maszynie',       ['leg press', 'sled leg press']],
  ['wznosy stóp',                  ['donkey calf raise', 'calf raise']],
  // Plecy
  ['martwy ciąg klasyczny',        ['barbell deadlift', 'conventional deadlift', 'deadlift barbell']],
  ['wiosłowanie hantlą',           ['dumbbell row', 'bent over dumbbell row', 'one arm row']],
  ['wiosłowanie na maszynie',      ['machine row', 'seated machine row']],
  ['wiosłowanie w siedzie na lince', ['seated cable row', 'cable seated row']],
  ['ściąganie drążka nachwytem',   ['lat pulldown', 'pulldown overhand', 'lat pulldown overhand']],
  ['ściąganie drążka podchwytem',  ['underhand pulldown', 'reverse grip pulldown', 'chin grip pulldown']],
  ['ściąganie drążka neutralnie',  ['neutral grip pulldown', 'close grip pulldown']],
  ['ściąganie na prostych rękach', ['straight arm pulldown', 'pullover cable']],
  ['hipersekstensja',              ['back extension', 'hyperextension', 'roman chair back']],
  ['t-bar row',                    ['t-bar row', 'tbar row']],
  ['good morning',                 ['good morning barbell', 'barbell good morning']],
  ['wiosłowanie odwróconym',       ['reverse grip row', 'underhand row']],
  ['snatch grip deadlift',         ['snatch grip deadlift', 'snatch deadlift']],
  ['ławka rzymska',                ['roman chair', 'roman chair back extension']],
  ['wyciąg dolny',                 ['seated cable row', 'low row cable', 'low pulley row']],
  ['pull up challenge',            ['pull up', 'pullup']],
  // Podciągania
  ['podciąganie nachwytem',        ['pull up', 'pullup overhand', 'chin up']],
  ['podciąganie podchwytem',       ['chin up', 'underhand pull up', 'chinup']],
  // Triceps
  ['prostowanie na lince (v-bar)', ['tricep pushdown v', 'v-bar pushdown', 'tricep pushdown']],
  ['prostowanie na lince',         ['tricep pushdown', 'cable pushdown tricep']],
  ['prostowanie jednorącz',        ['one arm tricep', 'single arm tricep', 'one arm pushdown']],
  ['prostowanie nad głową',        ['overhead tricep extension', 'tricep overhead extension']],
  ['prostowanie odwrotnym',        ['reverse grip pushdown', 'reverse tricep pushdown']],
  ['skull crushers',               ['skull crusher', 'lying tricep extension', 'ez bar skull']],
  ['francuskie wyciskanie leżąc',  ['french press', 'lying tricep extension', 'skull crusher']],
  ['francuskie wyciskanie siedząc', ['seated french press', 'overhead tricep dumbbell']],
  ['francuskie jednorącz',         ['overhead tricep dumbbell', 'single arm tricep overhead']],
  ['kickback z hantlem',           ['tricep kickback', 'dumbbell kickback']],
  ['wyciskanie wąskim chwytem',    ['close grip bench press', 'narrow grip bench']],
  ['dipy na poręczach',            ['dip', 'parallel bar dip', 'tricep dip']],
  ['wyciąg górny',                 ['cable overhead extension', 'overhead cable tricep']],
  // Kalenistyka
  ['pompki klasyczne',             ['push up', 'pushup']],
  ['pompki',                       ['push up', 'pushup']],
  ['muscle-up',                    ['muscle up', 'muscle-up']],
  ['l-sit',                        ['l-sit', 'l sit']],
  ['front lever',                  ['front lever']],
  ['handstand',                    ['handstand push up', 'handstand']],
  ['pistol squat',                 ['pistol squat', 'single leg squat']],
  ['pike push-up',                 ['pike push', 'pike pushup']],
  ['dragon flag',                  ['dragon flag']],
  ['crow pose',                    ['planche', 'crow pose']],
  // Przedramię
  ['uginanie nadgarstka podchwytem', ['wrist curl', 'barbell wrist curl']],
  ['uginanie nadgarstka nachwytem',  ['reverse wrist curl', 'wrist extension']],
  ['dead hang',                    ['dead hang', 'bar hang']],
  ["farmer's carry",               ['farmers walk', 'farmer carry']],
  ['spacer farmera',               ['farmers walk', 'farmer carry']],
  ['zwijanie taśmy',               ['wrist roller']],
  ['unoszenie',                    ['wrist extension', 'forearm raise']],
  // Extra
  ['kettlebell swing',             ['kettlebell swing']],
  ['kettlebell clean',             ['kettlebell clean', 'kettlebell press']],
  ['box jump',                     ['box jump', 'jump box']],
  ['burpees',                      ['burpee', 'burpees']],
  ['battle ropes',                 ['battle rope', 'rope wave']],
  ['rzuty piłką',                  ['medicine ball', 'wall ball']],
  ['skakanka',                     ['jump rope', 'rope jumping', 'skipping']],
  ['bieg na bieżni',               ['treadmill', 'running treadmill']],
  ['ergometr wioślarski',          ['rowing machine', 'rower ergometer']],
  ['rower stacjonarny',            ['stationary bike', 'exercise bike', 'cycling']],
];

// ─── Scoring ─────────────────────────────────────────────────────────────────
function score(queries: string[], candidate: string): number {
  const c = candidate.toLowerCase().trim();
  let best = 0;

  for (const query of queries) {
    const q = query.toLowerCase().trim();
    if (c === q) return 100;
    if (c.includes(q) || q.includes(c)) { best = Math.max(best, 85); continue; }
    const words = q.split(/\s+/).filter(w => w.length >= 3);
    if (words.length === 0) continue;
    const matches = words.filter(w => c.includes(w));
    if (matches.length > 0) {
      const s = Math.round((matches.length / words.length) * 70);
      best = Math.max(best, s);
    }
  }
  return best;
}

async function main() {
  console.log('\n🔍 Auto-linkowanie techniki ExerciseDB (v1 API + free-exercise-db)\n');

  const exercises = await prisma.exercise.findMany({
    orderBy: [{ muscleGroup: 'asc' }, { name: 'asc' }],
  });
  const toLink = exercises.filter(e => !e.exerciseDbId || e.exerciseDbId.trim() === '');
  console.log(`Do linkowania: ${toLink.length} / ${exercises.length}\n`);

  // ─── Pobierz dane ───────────────────────────────────────────────────────────
  console.log('Pobieranie ExerciseDB (wszystkie strony)...');
  const dbExercises = await fetchAllExerciseDb();
  console.log(`\n  → Pobrano: ${dbExercises.length} ćwiczeń z ExerciseDB\n`);

  console.log('Pobieranie free-exercise-db (GitHub)...');
  const freeExercises = await fetchFreeDb();
  console.log(`  → Pobrano: ${freeExercises.length} ćwiczeń z free-exercise-db\n`);

  if (dbExercises.length === 0) {
    console.error('❌ ExerciseDB zwrócił 0 ćwiczeń. Sprawdź połączenie.');
    return;
  }

  // ─── Zbuduj indeks wg bodyPart ─────────────────────────────────────────────
  const byBodyPart: Record<string, ApiExercise[]> = {};
  const bpNames = new Set<string>();
  for (const ex of dbExercises) {
    for (const bp of (ex.bodyParts || [])) {
      bpNames.add(bp);
      if (!byBodyPart[bp]) byBodyPart[bp] = [];
      byBodyPart[bp].push(ex);
    }
  }
  console.log(`Grupy mięśniowe w ExerciseDB: ${[...bpNames].sort().join(', ')}\n`);

  // ─── Dopasuj każde ćwiczenie ───────────────────────────────────────────────
  const results: {
    id: string; name: string; matched: ApiExercise | null; scoreVal: number;
  }[] = [];

  for (const ex of toLink) {
    const shortName = ex.name.includes(' - ')
      ? ex.name.split(' - ').slice(1).join(' - ')
      : ex.name;
    const nameLC = shortName.toLowerCase();

    // 1. Szukaj w MANUAL_MAP
    let queries: string[] = [];
    for (const [key, vals] of MANUAL_MAP) {
      if (nameLC.includes(key.toLowerCase())) { queries = vals; break; }
    }
    // Fallback: użyj też polskiej nazwy transliterowanej jako query
    if (queries.length === 0) queries = [shortName];

    const bodyPart = getBodyPart(ex.muscleGroup || '');
    // Kandydaci: najpierw właściwa grupa, potem cały zbiór
    const candidates: ApiExercise[] =
      byBodyPart[bodyPart]?.length
        ? [...(byBodyPart[bodyPart] || []), ...(byBodyPart['upper arms'] || [])]
        : dbExercises;

    let bestMatch: ApiExercise | null = null;
    let bestScore = 0;

    for (const c of candidates) {
      const s = score(queries, c.name);
      if (s > bestScore) { bestScore = s; bestMatch = c; }
    }

    // Fallback: przeszukaj CAŁY zbiór jeśli wynik słaby
    if (bestScore < 40) {
      for (const c of dbExercises) {
        const s = score(queries, c.name);
        if (s > bestScore) { bestScore = s; bestMatch = c; }
      }
    }

    results.push({ id: ex.id, name: shortName, matched: bestMatch, scoreVal: bestScore });
  }

  // ─── Wyniki ────────────────────────────────────────────────────────────────
  const good    = results.filter(r => r.scoreVal >= 50);
  const medium  = results.filter(r => r.scoreVal >= 25 && r.scoreVal < 50);
  const missing = results.filter(r => r.scoreVal < 25);

  console.log(`✅ Pewne dopasowania (score ≥ 50): ${good.length}`);
  good.forEach(r => console.log(
    `   ${r.name.padEnd(42)} → ${r.matched?.name ?? 'BRAK'}`
  ));

  console.log(`\n⚠️  Słabe dopasowania (score 25-49): ${medium.length}`);
  medium.forEach(r => console.log(
    `   ${r.name.padEnd(42)} → ${r.matched?.name ?? 'BRAK'} [${r.scoreVal}]`
  ));

  console.log(`\n❌ Brak dopasowania (score < 25): ${missing.length}`);
  missing.forEach(r => console.log(
    `   ${r.name.padEnd(42)} → ${r.matched?.name ?? 'BRAK'} [${r.scoreVal}]`
  ));

  console.log(`\n${'─'.repeat(60)}`);
  const toSave = good; // zapisujemy TYLKO pewne dopasowania
  console.log(`Zostanie zapisane tylko pewne (score ≥ 50): ${toSave.length}`);
  console.log(`Pominięte słabe: ${medium.length} (możesz je ręcznie powiązać)`);
  console.log(`Bez powiązania: ${missing.length}\n`);

  if (toSave.length === 0) {
    console.log('Brak pewnych dopasowań. Sprawdź ile ćwiczeń pobrano z ExerciseDB.');
    return;
  }

  console.log('Naciśnij ENTER aby zapisać pewne dopasowania, Ctrl+C aby anulować...');
  await new Promise<void>(resolve => { process.stdin.once('data', () => resolve()); });

  let saved = 0;
  for (const r of toSave) {
    if (!r.matched) continue;
    await prisma.exercise.update({
      where: { id: r.id },
      data: { exerciseDbId: r.matched.exerciseId },
    });
    saved++;
  }

  console.log(`\n✅ Zapisano ${saved} pewnych powiązań.`);
  console.log(`⚠️  ${missing.length + medium.length} ćwiczeń bez pewnego powiązania — powiąż je ręcznie w aplikacji.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
