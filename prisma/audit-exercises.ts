/**
 * PODGLĄD listy ćwiczeń — nic nie usuwa (read-only).
 *
 * Dzieli ćwiczenia na kategorie:
 *   • Z HISTORIĄ  — mają wpisy treningowe (NIGDY nie do usunięcia)
 *   • Ulubione    — ktoś dodał do ulubionych (bez historii)
 *   • W szablonie — użyte w szablonie treningu (bez historii)
 *   • Nieużywane  — brak historii, ulubionych i szablonu → kandydaci do usunięcia
 *
 * Pełną listę nieużywanych zapisuje do pliku unused-exercises.txt do przejrzenia.
 *
 * Uruchom:
 *   npx ts-node --project tsconfig.scripts.json prisma/audit-exercises.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TemplateEntry { exerciseId?: string }

async function main() {
  // Zbiór ID ćwiczeń użytych w jakimkolwiek szablonie (entries to JSON).
  const templates = await prisma.workoutTemplate.findMany({ select: { entries: true } });
  const inTemplate = new Set<string>();
  for (const t of templates) {
    const arr = Array.isArray(t.entries) ? (t.entries as unknown as TemplateEntry[]) : [];
    for (const item of arr) if (item && typeof item.exerciseId === 'string') inTemplate.add(item.exerciseId);
  }

  const exercises = await prisma.exercise.findMany({
    select: {
      id: true,
      name: true,
      muscleGroup: true,
      _count: { select: { entries: true, favorites: true } },
    },
    orderBy: { name: 'asc' },
  });

  const withHistory: typeof exercises = [];
  const favorites: typeof exercises = [];
  const templateOnly: typeof exercises = [];
  const unused: typeof exercises = [];

  for (const ex of exercises) {
    if (ex._count.entries > 0) withHistory.push(ex);
    else if (ex._count.favorites > 0) favorites.push(ex);
    else if (inTemplate.has(ex.id)) templateOnly.push(ex);
    else unused.push(ex);
  }

  console.log('\n=== PODGLĄD LISTY ĆWICZEŃ (nic nie usuwam) ===\n');
  console.log(`Wszystkich ćwiczeń:        ${exercises.length}`);
  console.log(`  • z historią (wpisy):   ${withHistory.length}  ← NIGDY nie do usunięcia`);
  console.log(`  • ulubione (bez hist.): ${favorites.length}`);
  console.log(`  • w szablonie:          ${templateOnly.length}`);
  console.log(`  • NIEUŻYWANE:           ${unused.length}  ← kandydaci do usunięcia`);

  const outPath = path.resolve(process.cwd(), 'unused-exercises.txt');
  const lines = unused.map(e => `${e.name}${e.muscleGroup ? `  [${e.muscleGroup}]` : ''}`);
  fs.writeFileSync(
    outPath,
    `Nieużywane ćwiczenia (brak historii, ulubionych i szablonu): ${unused.length}\n` +
    `Te ćwiczenia proponuje usunąć skrypt delete-unused-exercises.ts\n\n` +
    lines.join('\n') + '\n',
    'utf8'
  );
  console.log(`\nPełna lista nieużywanych zapisana do:\n  ${outPath}`);
  console.log('\nGdy przejrzysz listę, uruchom (najpierw suchy przebieg):');
  console.log('  npx ts-node --project tsconfig.scripts.json prisma/delete-unused-exercises.ts');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
