/**
 * Usuwa NIEUŻYWANE ćwiczenia — bezpiecznie.
 *
 * Usuwa TYLKO te, które jednocześnie:
 *   • nie mają żadnych wpisów treningowych (0 historii)  ← twardy warunek
 *   • nie są niczyimi ulubionymi
 *   • nie są użyte w żadnym szablonie
 *
 * Ćwiczenia z historią NIGDY nie są ruszane (dodatkowo zablokowałby to klucz
 * obcy w bazie).
 *
 * DOMYŚLNIE robi tylko suchy przebieg (pokazuje, co by usunął — nic nie kasuje).
 * Aby NAPRAWDĘ usunąć, dodaj flagę --delete:
 *
 *   npx ts-node --project tsconfig.scripts.json prisma/delete-unused-exercises.ts            (podgląd)
 *   npx ts-node --project tsconfig.scripts.json prisma/delete-unused-exercises.ts --delete   (usuwa)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DO_DELETE = process.argv.includes('--delete');

interface TemplateEntry { exerciseId?: string }

async function main() {
  const templates = await prisma.workoutTemplate.findMany({ select: { entries: true } });
  const inTemplate = new Set<string>();
  for (const t of templates) {
    const arr = Array.isArray(t.entries) ? (t.entries as unknown as TemplateEntry[]) : [];
    for (const item of arr) if (item && typeof item.exerciseId === 'string') inTemplate.add(item.exerciseId);
  }

  const exercises = await prisma.exercise.findMany({
    select: { id: true, name: true, _count: { select: { entries: true, favorites: true } } },
    orderBy: { name: 'asc' },
  });

  // Kandydaci: 0 wpisów + 0 ulubionych + brak w szablonie.
  const unused = exercises.filter(
    e => e._count.entries === 0 && e._count.favorites === 0 && !inTemplate.has(e.id)
  );

  console.log(`\nWszystkich ćwiczeń: ${exercises.length}`);
  console.log(`Do usunięcia (nieużywane): ${unused.length}`);
  console.log(`Zachowane (historia / ulubione / szablon): ${exercises.length - unused.length}\n`);

  if (unused.length === 0) {
    console.log('Brak nieużywanych ćwiczeń do usunięcia.');
    return;
  }

  console.log('Ćwiczenia do usunięcia:');
  for (const e of unused) console.log(`  - ${e.name}`);

  if (!DO_DELETE) {
    console.log('\n[SUCHY PRZEBIEG] Nic nie usunięto.');
    console.log('Aby NAPRAWDĘ usunąć powyższe, uruchom ponownie z flagą --delete.');
    return;
  }

  // Zabezpieczenie: usuwamy wyłącznie po wcześniej wyliczonych, bezpiecznych ID.
  const ids = unused.map(e => e.id);
  const res = await prisma.exercise.deleteMany({ where: { id: { in: ids } } });
  console.log(`\n✓ Usunięto ${res.count} nieużywanych ćwiczeń. Historia i ulubione nietknięte.`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
