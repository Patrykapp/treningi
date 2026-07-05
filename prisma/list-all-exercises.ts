/**
 * Wypisuje CAŁĄ aktualną listę ćwiczeń (read-only), pogrupowaną wg partii
 * mięśniowej i posortowaną alfabetycznie. Oznacza (historia) te, które mają
 * wpisy treningowe. Zapisuje do pliku exercises-all.txt i wypisuje na ekran.
 *
 * Uruchom:
 *   npx ts-node --project tsconfig.scripts.json prisma/list-all-exercises.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const exercises = await prisma.exercise.findMany({
    select: { name: true, muscleGroup: true, _count: { select: { entries: true } } },
    orderBy: [{ muscleGroup: 'asc' }, { name: 'asc' }],
  });

  // Grupowanie wg partii
  const groups = new Map<string, { name: string; entries: number }[]>();
  for (const e of exercises) {
    const g = e.muscleGroup || 'Bez grupy';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push({ name: e.name, entries: e._count.entries });
  }

  const out: string[] = [`Wszystkich ćwiczeń: ${exercises.length}`, ''];
  for (const [group, items] of groups) {
    out.push(`### ${group} (${items.length})`);
    for (const it of items) {
      out.push(`  - ${it.name}${it.entries > 0 ? '  (historia)' : ''}`);
    }
    out.push('');
  }

  const text = out.join('\n');
  const outPath = path.resolve(process.cwd(), 'exercises-all.txt');
  fs.writeFileSync(outPath, text + '\n', 'utf8');

  console.log(text);
  console.log(`\nZapisano do: ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
