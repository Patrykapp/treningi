/**
 * Pobiera GIF-y ExerciseDB dla ćwiczeń z bazy (po exerciseDbId) do
 * public/exercise-gifs/<exerciseDbId>.gif, żeby apka NIE zależała od zewnętrznego
 * hosta w runtime.
 *
 * Uruchom (lokalnie — potrzebny dostęp do bazy i internet):
 *   npx ts-node --project tsconfig.scripts.json prisma/download-gifs.ts
 *
 * Wznawialny: pomija już pobrane pliki. Przy błędach sieci/limitach uruchom
 * ponownie — dokończy brakujące.
 *
 * Uwaga: pliki trafiają do public/ i MUSZĄ być scommitowane, żeby Vercel je
 * serwował. Media © AscendAPI / ExerciseDB — użytek niekomercyjny + atrybucja.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const HOST = 'https://static.exercisedb.dev/media';
const OUT = path.resolve(process.cwd(), 'public', 'exercise-gifs');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

type Result = 'ok' | 'notfound' | 'error';

async function download(url: string, dest: string, retries = 4): Promise<Result> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return 'notfound';
      if (!res.ok) {
        if ([429, 500, 502, 503, 504].includes(res.status)) { await sleep(1000 * attempt); continue; }
        return 'error';
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) return 'error';
      fs.writeFileSync(dest, buf);
      return 'ok';
    } catch {
      await sleep(1000 * attempt);
    }
  }
  return 'error';
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const exercises = await prisma.exercise.findMany({
    where: { exerciseDbId: { not: null } },
    select: { exerciseDbId: true },
  });
  const ids = [...new Set(exercises.map(e => e.exerciseDbId).filter(Boolean))] as string[];
  console.log(`Ćwiczeń z exerciseDbId: ${ids.length}\n`);

  let ok = 0, skip = 0, notfound = 0, err = 0;
  const failed: string[] = [];

  for (const id of ids) {
    const dest = path.join(OUT, `${id}.gif`);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { skip++; continue; }
    const r = await download(`${HOST}/${id}.gif`, dest);
    if (r === 'ok') { ok++; console.log(`  ✓ ${id}`); }
    else if (r === 'notfound') { notfound++; console.log(`  – ${id} (brak GIF-a, 404)`); }
    else { err++; failed.push(id); console.log(`  ! ${id} (błąd sieci)`); }
    await sleep(200);
  }

  console.log(`\nGotowe. Pobrano ${ok}, pominięto ${skip}, brak (404) ${notfound}, błędy ${err}.`);
  console.log(`GIF-y w: ${OUT}`);
  if (err > 0) console.log('Były błędy sieci — uruchom skrypt ponownie, dokończy brakujące.');
  console.log('\nPamiętaj: scommituj folder public/exercise-gifs, żeby Vercel serwował pliki.');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
