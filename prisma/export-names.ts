// Eksportuje listę ćwiczeń do edycji: angielska nazwa + aktualne tłumaczenie
// npx tsx prisma/export-names.ts

import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();
const BASE = 'https://oss.exercisedb.dev';
const BODY_PARTS = [
  'chest','back','shoulders','upper arms','lower arms',
  'upper legs','lower legs','waist','neck','cardio',
];

async function main() {
  // Pobierz aktualne ćwiczenia z DB
  const dbExercises = await prisma.exercise.findMany({ orderBy: { muscleGroup: 'asc' } });

  // Zbuduj mapę exerciseDbId → polishName
  const dbMap = new Map(dbExercises.map(e => [e.exerciseDbId, e.name]));

  // Pobierz oryginalne angielskie nazwy z ExerciseDB
  const allEn: { exerciseId: string; name: string; bodyParts: string[] }[] = [];
  for (const bp of BODY_PARTS) {
    const res = await fetch(`${BASE}/api/v1/exercises?limit=25&bodyParts=${encodeURIComponent(bp)}`);
    const json = await res.json();
    const data = Array.isArray(json) ? json : (json?.data ?? []);
    allEn.push(...data);
    await new Promise(r => setTimeout(r, 300));
  }

  // Zbuduj listę do edycji
  const rows: { exerciseDbId: string; english: string; polish: string; group: string }[] = [];
  for (const ex of allEn) {
    const polish = dbMap.get(ex.exerciseId) ?? '';
    rows.push({
      exerciseDbId: ex.exerciseId,
      english: ex.name,
      polish,
      group: ex.bodyParts?.[0] ?? '',
    });
  }

  // Sortuj po grupie i angielskiej nazwie
  rows.sort((a, b) => a.group.localeCompare(b.group) || a.english.localeCompare(b.english));

  // Zapisz jako JSON
  const outPath = join(process.cwd(), 'prisma', 'exercise-names.json');
  writeFileSync(outPath, JSON.stringify(rows, null, 2), 'utf-8');
  console.log(`\nZapisano ${rows.length} ćwiczeń do prisma/exercise-names.json`);
  console.log('Edytuj pole "polish" i uruchom: npx tsx prisma/apply-names.ts');
}

main().catch(console.error).finally(() => prisma.$disconnect());
