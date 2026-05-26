// npx tsx prisma/search-exercise.ts
// Dodaje ćwiczenia ręcznie (bez GIFa) których brakuje w ExerciseDB
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MANUAL_EXERCISES = [
  { name: 'Wyciskanie sztangi na ławce poziomej', muscleGroup: 'Klatka piersiowa' },
  { name: 'Wyciskanie sztangi na ławce skośnej w dół', muscleGroup: 'Klatka piersiowa' },
  { name: 'Martwy ciąg', muscleGroup: 'Plecy' },
  { name: 'Martwy ciąg rumuński', muscleGroup: 'Uda' },
  { name: 'Przysiad ze sztangą', muscleGroup: 'Uda' },
  { name: 'Wiosłowanie sztangą', muscleGroup: 'Plecy' },
  { name: 'Wyciskanie żołnierskie (OHP)', muscleGroup: 'Barki' },
];

async function main() {
  let added = 0;
  let skipped = 0;

  for (const ex of MANUAL_EXERCISES) {
    try {
      await prisma.exercise.create({ data: ex });
      console.log(`✓ Dodano: ${ex.name}`);
      added++;
    } catch {
      console.log(`– Już istnieje: ${ex.name}`);
      skipped++;
    }
  }

  console.log(`\nDodano: ${added}, pominięto (już były): ${skipped}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
