/**
 * Wypisuje wszystkie ćwiczenia BEZ HISTORII (0 wpisów treningowych) — read-only.
 * Oznacza te, które są czyimiś ulubionymi. Zapisuje listę do pliku
 * exercises-no-history.txt i wypisuje ją na ekran.
 *
 * Uruchom (najlepiej po usunięciu 45 pozycji):
 *   npx ts-node --project tsconfig.scripts.json prisma/list-no-history.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const exercises = await prisma.exercise.findMany({
    select: {
      name: true,
      muscleGroup: true,
      _count: { select: { entries: true, favorites: true } },
    },
    orderBy: [{ muscleGroup: 'asc' }, { name: 'asc' }],
  });

  const noHistory = exercises.filter(e => e._count.entries === 0);

  const lines = noHistory.map(e => {
    const grp = e.muscleGroup ? `  [${e.muscleGroup}]` : '';
    const fav = e._count.favorites > 0 ? '  (ulubione)' : '';
    return `${e.name}${grp}${fav}`;
  });

  const outPath = path.resolve(process.cwd(), 'exercises-no-history.txt');
  fs.writeFileSync(
    outPath,
    `Ćwiczenia bez historii: ${noHistory.length} (z ${exercises.length} wszystkich)\n\n` +
    lines.join('\n') + '\n',
    'utf8'
  );

  console.log(`\nBez historii: ${noHistory.length} z ${exercises.length} wszystkich.`);
  console.log(`Lista zapisana do:\n  ${outPath}\n`);
  console.log(lines.join('\n'));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
