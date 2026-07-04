/**
 * Uzupełnia ćwiczenia o media z ExerciseDB V2 (RapidAPI) i zapisuje je w bazie
 * (pola v2Id / v2ImageUrl / v2VideoUrl / v2Checked). Dzięki temu aplikacja w
 * runtime NIE woła płatnego API — czyta gotowe adresy z bazy.
 *
 * Uruchom:
 *   npx ts-node --project tsconfig.scripts.json prisma/link-v2-media.ts
 *   npx ts-node --project tsconfig.scripts.json prisma/link-v2-media.ts --limit 100
 *
 * Skrypt jest WZNAWIALNY: pomija ćwiczenia już sprawdzone (v2Checked = true).
 * Gdy RapidAPI zwróci limit zapytań (429), zatrzymuje się czysto — uruchom
 * ponownie później (darmowy limit odnawia się miesięcznie).
 *
 * Wymaga w .env: RAPIDAPI_KEY (oraz opcjonalnie RAPIDAPI_HOST).
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { resolveV2Media, V2RateLimitError, hasV2Key } from '../lib/exercisedbV2';

// ── Wczytaj .env do process.env (ts-node nie robi tego automatycznie) ─────────
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const keyName = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[keyName] === undefined) process.env[keyName] = val;
  }
}
loadEnv();

const prisma = new PrismaClient();
const EDB_V1 = 'https://oss.exercisedb.dev';
const DELAY_MS = 450; // odstęp między ćwiczeniami — ostrożnie wobec limitów

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Katalog V1: exerciseDbId → angielska nazwa (do dopasowania w V2) ──────────
async function buildV1Catalog(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let cursor: string | null = null;
  console.log('Pobieram katalog nazw z ExerciseDB V1...');
  for (let page = 0; page < 120; page++) {
    const url: string = cursor
      ? `${EDB_V1}/api/v1/exercises?limit=100&after=${encodeURIComponent(cursor)}`
      : `${EDB_V1}/api/v1/exercises?limit=100`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { Accept: 'application/json' } });
    } catch {
      break;
    }
    if (!res.ok) break;
    const json = (await res.json()) as {
      meta?: { hasNextPage?: boolean; nextCursor?: string };
      data?: { exerciseId?: string; name?: string }[];
    };
    const data = json?.data ?? [];
    if (data.length === 0) break;
    for (const e of data) if (e?.exerciseId && e?.name) map.set(e.exerciseId, e.name);
    if (json?.meta?.hasNextPage && json?.meta?.nextCursor) cursor = json.meta.nextCursor;
    else break;
    await sleep(150);
  }
  console.log(`  katalog: ${map.size} nazw`);
  return map;
}

function argLimit(): number | null {
  const i = process.argv.indexOf('--limit');
  if (i >= 0 && process.argv[i + 1]) {
    const n = parseInt(process.argv[i + 1], 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return null;
}

async function main() {
  if (!hasV2Key()) {
    console.error('BŁĄD: brak RAPIDAPI_KEY w .env. Dodaj klucz i uruchom ponownie.');
    process.exit(1);
  }

  const limit = argLimit();
  const todo = await prisma.exercise.findMany({
    where: { v2Checked: false },
    orderBy: { name: 'asc' },
    ...(limit ? { take: limit } : {}),
  });
  console.log(`Do sprawdzenia: ${todo.length} ćwiczeń${limit ? ` (limit ${limit})` : ''}\n`);
  if (todo.length === 0) {
    console.log('Wszystko już sprawdzone. Nic do zrobienia.');
    return;
  }

  const catalog = await buildV1Catalog();

  let withMedia = 0;
  let noMatch = 0;
  let processed = 0;

  for (const ex of todo) {
    const english = (ex.exerciseDbId && catalog.get(ex.exerciseDbId)) || ex.name;
    try {
      const media = await resolveV2Media(english);
      if (media) {
        await prisma.exercise.update({
          where: { id: ex.id },
          data: {
            v2Id: media.v2Id,
            v2ImageUrl: media.imageUrl || null,
            v2VideoUrl: media.videoUrl || null,
            v2Checked: true,
          },
        });
        withMedia++;
        console.log(`  ✓ ${ex.name}  →  ${english}  ${media.videoUrl ? '[wideo]' : '[obraz]'}`);
      } else {
        await prisma.exercise.update({ where: { id: ex.id }, data: { v2Checked: true } });
        noMatch++;
        console.log(`  – ${ex.name}  (brak trafienia dla "${english}")`);
      }
    } catch (e) {
      if (e instanceof V2RateLimitError) {
        console.warn('\n⏳ Osiągnięto limit zapytań RapidAPI (429). Zatrzymuję się.');
        console.warn('   Uruchom skrypt ponownie później — ruszy od miejsca, w którym skończył.');
        break;
      }
      console.error(`  ! błąd dla ${ex.name}:`, e);
      // nie oznaczaj jako sprawdzone — spróbujemy ponownie następnym razem
    }
    processed++;
    await sleep(DELAY_MS);
  }

  console.log(`\nGotowe. Przetworzono ${processed}: ${withMedia} z mediami, ${noMatch} bez trafienia.`);
  const left = await prisma.exercise.count({ where: { v2Checked: false } });
  if (left > 0) console.log(`Pozostało do sprawdzenia: ${left} (uruchom skrypt ponownie).`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
