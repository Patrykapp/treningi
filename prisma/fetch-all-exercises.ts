// Pobiera WSZYSTKIE ćwiczenia z ExerciseDB (cursor pagination) i dodaje brakujące do DB
// npx tsx prisma/fetch-all-exercises.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE = 'https://oss.exercisedb.dev';

const BODY_PART_PL: Record<string, string> = {
  chest: 'Klatka piersiowa',
  back: 'Plecy',
  shoulders: 'Barki',
  'upper arms': 'Ramiona',
  'lower arms': 'Przedramiona',
  'upper legs': 'Uda',
  'lower legs': 'Łydki',
  waist: 'Brzuch',
  neck: 'Szyja',
  cardio: 'Cardio',
};

interface ExerciseDBItem {
  exerciseId: string;
  name: string;
  bodyParts: string[];
}

async function fetchAll(): Promise<ExerciseDBItem[]> {
  const all: ExerciseDBItem[] = [];
  let cursor: string | null = null;
  let page = 0;

  console.log('Pobieram wszystkie ćwiczenia z ExerciseDB...');

  do {
    // Parametr paginacji to `after` (nie `cursor`). Z `cursor=` API ignorowało go
    // i w kółko zwracało pierwszą stronę → skrypt nigdy nie pobierał całej listy.
    const url = cursor
      ? `${BASE}/api/v1/exercises?limit=100&after=${encodeURIComponent(cursor)}`
      : `${BASE}/api/v1/exercises?limit=100`;

    const res = await fetch(url);
    if (!res.ok) {
      console.error(`HTTP ${res.status} na stronie ${page}`);
      break;
    }

    const json = await res.json();
    const data: ExerciseDBItem[] = Array.isArray(json) ? json : (json?.data ?? []);
    const meta = json?.meta ?? {};

    all.push(...data);
    page++;
    console.log(`  Strona ${page}: +${data.length} ćwiczeń (łącznie: ${all.length})`);

    cursor = meta.nextCursor ?? null;

    if (cursor) await new Promise(r => setTimeout(r, 400));
  } while (cursor);

  return all;
}

async function main() {
  // 1. Pobierz wszystkie z API
  const apiExercises = await fetchAll();
  console.log(`\nPobrano ${apiExercises.length} ćwiczeń z ExerciseDB`);

  // 2. Pobierz istniejące z DB (po exerciseDbId)
  const dbExercises = await prisma.exercise.findMany({
    select: { exerciseDbId: true },
  });
  const existingIds = new Set(dbExercises.map(e => e.exerciseDbId).filter(Boolean));
  console.log(`W bazie: ${existingIds.size} ćwiczeń z exerciseDbId`);

  // 3. Filtruj nowe
  const newExercises = apiExercises.filter(e => !existingIds.has(e.exerciseId));
  console.log(`Nowych do dodania: ${newExercises.length}`);

  if (newExercises.length === 0) {
    console.log('Brak nowych ćwiczeń do dodania.');
    return;
  }

  // 4. Dodaj nowe
  let inserted = 0;
  let skipped = 0;

  for (const ex of newExercises) {
    const bodyPart = ex.bodyParts?.[0] ?? '';
    const muscleGroup = BODY_PART_PL[bodyPart] ?? bodyPart;

    // Próbuj pod angielską nazwą, potem z ID jako fallback
    const candidates = [
      ex.name,
      `${ex.name} [${ex.exerciseId}]`,
    ];

    let ok = false;
    for (const candidateName of candidates) {
      try {
        await prisma.exercise.create({
          data: {
            name: candidateName,
            muscleGroup,
            exerciseDbId: ex.exerciseId,
          },
        });
        inserted++;
        ok = true;
        break;
      } catch {
        // duplicate name, try next candidate
      }
    }
    if (!ok) skipped++;
  }

  console.log(`\nDodano: ${inserted}, pominięto (duplikaty): ${skipped}`);
  console.log('\nTeraz uruchom: npx tsx prisma/export-names.ts');
  console.log('aby wyeksportować nową listę do tłumaczenia.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
