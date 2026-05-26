// Aplikuje przetłumaczone nazwy z exercise-names.json do bazy
// npx tsx prisma/apply-names.ts

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function main() {
  const rows = JSON.parse(
    readFileSync(join(process.cwd(), 'prisma', 'exercise-names.json'), 'utf-8')
  ) as { exerciseDbId: string; english: string; polish: string; group: string }[];

  let updated = 0, skipped = 0;

  for (const row of rows) {
    if (!row.polish.trim()) { skipped++; continue; }
    try {
      await prisma.exercise.updateMany({
        where: { exerciseDbId: row.exerciseDbId },
        data: { name: row.polish.trim() },
      });
      updated++;
    } catch {
      skipped++;
    }
  }

  console.log(`Zaktualizowano: ${updated}, pominięto: ${skipped}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
