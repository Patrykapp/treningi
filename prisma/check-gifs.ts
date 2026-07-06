/**
 * KONTROLA (read-only): czy każde ćwiczenie ma dobrze dopasowany GIF.
 *
 * GIF-y wiążą się po exerciseDbId (nie po nazwie), więc zmiana nazwy nie psuje
 * dopasowania. Ten skrypt pokazuje, na jakie ANGIELSKIE ćwiczenie z ExerciseDB
 * wskazuje ID danego (polskiego) ćwiczenia oraz czy plik GIF jest pobrany —
 * dzięki temu jednym rzutem oka sprawdzisz, że GIF przedstawia właściwy ruch.
 *
 * Uruchom (najlepiej PO download-gifs.ts):
 *   npx ts-node --project tsconfig.scripts.json prisma/check-gifs.ts
 *
 * Zapisuje pełne mapowanie do gif-mapping.txt.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EDB = 'https://oss.exercisedb.dev';
const GIF_DIR = path.resolve(process.cwd(), 'public', 'exercise-gifs');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Katalog ExerciseDB: exerciseDbId → angielska nazwa (do weryfikacji, co jest na GIF-ie).
async function buildCatalog(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let cursor: string | null = null;
  for (let page = 0; page < 120; page++) {
    const url: string = cursor
      ? `${EDB}/api/v1/exercises?limit=100&after=${encodeURIComponent(cursor)}`
      : `${EDB}/api/v1/exercises?limit=100`;
    let res: Response;
    try { res = await fetch(url, { headers: { Accept: 'application/json' } }); } catch { break; }
    if (!res.ok) break;
    const json = (await res.json()) as { meta?: { hasNextPage?: boolean; nextCursor?: string }; data?: { exerciseId?: string; name?: string }[] };
    const data = json?.data ?? [];
    if (data.length === 0) break;
    for (const e of data) if (e?.exerciseId && e?.name) map.set(e.exerciseId, e.name);
    if (json?.meta?.hasNextPage && json?.meta?.nextCursor) cursor = json.meta.nextCursor;
    else break;
    await sleep(150);
  }
  return map;
}

function fileOk(id: string): boolean {
  const p = path.join(GIF_DIR, `${id}.gif`);
  return fs.existsSync(p) && fs.statSync(p).size > 0;
}

async function main() {
  console.log('Pobieram katalog nazw z ExerciseDB (do weryfikacji)...');
  const catalog = await buildCatalog();
  console.log(`  katalog: ${catalog.size} nazw\n`);

  const exercises = await prisma.exercise.findMany({
    select: { name: true, exerciseDbId: true, _count: { select: { entries: true } } },
    orderBy: { name: 'asc' },
  });

  const lines: string[] = [];
  let withGif = 0, noId = 0, missingFile = 0, notInCatalog = 0;
  const historyNoGif: string[] = [];

  for (const e of exercises) {
    const hist = e._count.entries > 0 ? ' (historia)' : '';
    if (!e.exerciseDbId) {
      noId++;
      lines.push(`—  ${e.name}${hist}  →  BRAK exerciseDbId (nie pokaże GIF-a)`);
      if (hist) historyNoGif.push(e.name);
      continue;
    }
    const english = catalog.get(e.exerciseDbId);
    const file = fileOk(e.exerciseDbId);
    if (file) withGif++; else missingFile++;
    if (!english) notInCatalog++;
    const gifMark = file ? '✓ plik jest' : '✗ brak pliku';
    const engMark = english ? `→ „${english}"` : '→ ID spoza katalogu (możliwe złe/nieaktualne powiązanie!)';
    lines.push(`${file ? '✓' : '✗'}  ${e.name}${hist}  ${engMark}  [${e.exerciseDbId}]  ${gifMark}`);
    if (hist && (!file || !english)) historyNoGif.push(e.name);
  }

  const out = path.resolve(process.cwd(), 'gif-mapping.txt');
  fs.writeFileSync(out,
    `Mapowanie GIF-ów (polska nazwa → angielskie ćwiczenie ExerciseDB)\n` +
    `Wszystkich: ${exercises.length} | z plikiem GIF: ${withGif} | bez ID: ${noId} | ID bez pliku: ${missingFile} | ID spoza katalogu: ${notInCatalog}\n\n` +
    lines.join('\n') + '\n', 'utf8');

  console.log(`Wszystkich ćwiczeń:              ${exercises.length}`);
  console.log(`  ✓ z plikiem GIF:              ${withGif}`);
  console.log(`  – bez exerciseDbId:           ${noId}`);
  console.log(`  ✗ ID jest, ale brak pliku:    ${missingFile}  (uruchom download-gifs.ts)`);
  console.log(`  ⚠ ID spoza katalogu:          ${notInCatalog}  (możliwe złe/nieaktualne powiązanie)`);
  console.log(`\nPełne mapowanie zapisano do: ${out}`);

  if (historyNoGif.length) {
    console.log(`\n⚠ Ćwiczenia z HISTORIĄ bez poprawnego GIF-a (${historyNoGif.length}) — warto zerknąć:`);
    historyNoGif.forEach(n => console.log('   ' + n));
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
