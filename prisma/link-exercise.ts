/**
 * Ręczne powiązanie JEDNEGO ćwiczenia z ExerciseDB (ustawia exerciseDbId)
 * + dociągnięcie GIF-a do public/exercise-gifs/<exerciseDbId>.gif.
 *
 * Kandydatów szuka w LOKALNYM katalogu prisma/.exercisedb-cache.json (1500
 * ćwiczeń, zapisany przez auto-link-technika.ts) — więc nie zależy od limitów
 * oss.exercisedb.dev. Jeśli cache nie istnieje, pobiera katalog z API.
 *
 * Użycie:
 *   # 1) podgląd — pokazuje stan ćwiczenia i propozycje z ExerciseDB
 *   npx ts-node --project tsconfig.scripts.json prisma/link-exercise.ts "ławce poziomej"
 *
 *   # 2) zapis — wybrane ID (albo najlepsze trafienie, gdy pominiesz --id)
 *   npx ts-node --project tsconfig.scripts.json prisma/link-exercise.ts "wyciskanie sztangi na ławce poziomej" --id EIeI8Vf --apply
 *
 * Opcje:
 *   --id <exerciseId>   konkretne ID z ExerciseDB (pomija automatyczny wybór)
 *   --query "<ang>"     własna fraza angielska do szukania (np. "barbell bench press")
 *   --apply             faktycznie zapisz do bazy (bez tego: suchy przebieg)
 *   --unlink            usuń powiązanie (exerciseDbId = null)
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CACHE_FILE = path.join(__dirname, '.exercisedb-cache.json');
const GIF_DIR = path.resolve(process.cwd(), 'public', 'exercise-gifs');
const GIF_HOST = 'https://static.exercisedb.dev/media';
const EDB = 'https://oss.exercisedb.dev';

interface Catalog {
  exerciseId: string;
  name: string;
  bodyParts?: string[];
  equipments?: string[];
  targetMuscles?: string[];
  instructions?: string[];
}

// ── Argumenty ────────────────────────────────────────────────────────────────
function flag(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : null;
}
const APPLY = process.argv.includes('--apply');
const UNLINK = process.argv.includes('--unlink');
const FORCED_ID = flag('id');
const CUSTOM_QUERY = flag('query');
const NEEDLE = process.argv.slice(2).find(a => !a.startsWith('--') &&
  a !== FORCED_ID && a !== CUSTOM_QUERY);

// ── .env (ts-node nie wczytuje go sam) ───────────────────────────────────────
function loadEnv() {
  const p = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadEnv();

// ── Katalog ExerciseDB: cache z dysku, w razie braku pobierz z API ───────────
async function loadCatalog(): Promise<Catalog[]> {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const list = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as Catalog[];
      if (Array.isArray(list) && list.length > 0) {
        console.log(`Katalog ExerciseDB: ${list.length} ćwiczeń (lokalny cache)\n`);
        return list;
      }
    }
  } catch { /* uszkodzony cache — pobierz */ }

  console.log('Brak lokalnego cache — pobieram katalog z oss.exercisedb.dev...');
  const all: Catalog[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < 40; page++) {
    const url: string = cursor
      ? `${EDB}/api/v1/exercises?limit=100&after=${encodeURIComponent(cursor)}`
      : `${EDB}/api/v1/exercises?limit=100`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) break;
    const json = (await res.json()) as {
      meta?: { hasNextPage?: boolean; nextCursor?: string };
      data?: Catalog[];
    };
    const fresh = (json.data ?? []).filter(e => e?.exerciseId && !seen.has(e.exerciseId));
    if (fresh.length === 0) break;
    fresh.forEach(e => seen.add(e.exerciseId));
    all.push(...fresh);
    if (!json.meta?.hasNextPage || !json.meta?.nextCursor) break;
    cursor = json.meta.nextCursor;
    await new Promise(r => setTimeout(r, 600));
  }
  console.log(`  pobrano ${all.length}`);
  if (all.length > 0) {
    try { fs.writeFileSync(CACHE_FILE, JSON.stringify(all)); } catch { /* cache opcjonalny */ }
  }
  return all;
}

// ── PL → EN: słowa kluczowe do zbudowania frazy szukania ─────────────────────
const PL_EN: [RegExp, string][] = [
  [/sztang(a|i|ą|ę)|gryf/i, 'barbell'],
  [/hantl|sztangiel/i, 'dumbbell'],
  [/wyciąg|link|lina/i, 'cable'],
  [/maszyn/i, 'machine'],
  [/kettl/i, 'kettlebell'],
  [/wyciskanie/i, 'press'],
  [/ławce poziomej|ławka pozioma/i, 'bench press'],
  [/ławce skośnej \(górn|skos dodatn|skośnej w górę/i, 'incline'],
  [/ławce skośnej \(doln|skośnej w dół|skos ujemn/i, 'decline'],
  [/przysiad/i, 'squat'],
  [/martwy ciąg/i, 'deadlift'],
  [/rumuński/i, 'romanian'],
  [/wiosłowanie/i, 'row'],
  [/podciąganie/i, 'pull up'],
  [/ściąganie drążka/i, 'lat pulldown'],
  [/uginanie ramion/i, 'curl'],
  [/uginanie nóg/i, 'leg curl'],
  [/prostowanie nóg/i, 'leg extension'],
  [/prostowanie ramion/i, 'triceps extension'],
  [/rozpiętki/i, 'fly'],
  [/wznos|unoszenie/i, 'raise'],
  [/bok(iem)?|bocz/i, 'lateral'],
  [/przodem/i, 'front'],
  [/szrug/i, 'shrug'],
  [/pompki/i, 'push up'],
  [/brzuszki/i, 'crunch'],
  [/wspięcia na palce/i, 'calf raise'],
  [/wypychanie nóg|leg press/i, 'leg press'],
  [/żołnierskie|ohp/i, 'military press'],
  [/wykrok|wypad/i, 'lunge'],
  [/nadgarst/i, 'wrist curl'],
  [/wąski|wąskim/i, 'close grip'],
  [/szerok/i, 'wide grip'],
  [/podchwyt/i, 'reverse grip'],
];

function buildQuery(polishName: string): string {
  const parts: string[] = [];
  for (const [re, en] of PL_EN) {
    if (re.test(polishName) && !parts.includes(en)) parts.push(en);
  }
  return parts.length > 0 ? parts.join(' ') : polishName;
}

// ── Scoring kandydatów ───────────────────────────────────────────────────────
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

function score(query: string, candidateName: string): number {
  // Porównujemy ZBIORY słów (bez powtórzeń) — inaczej fraza typu
  // „barbell press bench press" liczyłaby „press" dwa razy i remisowała
  // z wariantami incline/decline.
  const qt = new Set(norm(query).split(' ').filter(Boolean));
  const ct = new Set(norm(candidateName).split(' ').filter(Boolean));
  if (qt.size === 0 || ct.size === 0) return 0;

  const overlap = [...qt].filter(t => ct.has(t)).length;
  if (overlap === 0) return 0;
  if (overlap === qt.size && overlap === ct.size) return 100; // te same słowa

  const extra = ct.size - overlap; // słowa kandydata, których nie szukaliśmy
  return Math.round((overlap / qt.size) * 90) - extra * 8;
}

// ── Pobieranie GIF-a ─────────────────────────────────────────────────────────
async function downloadGif(id: string): Promise<'ok' | 'exists' | 'notfound' | 'error'> {
  fs.mkdirSync(GIF_DIR, { recursive: true });
  const dest = path.join(GIF_DIR, `${id}.gif`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return 'exists';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${GIF_HOST}/${id}.gif`);
      if (res.status === 404) return 'notfound';
      if (!res.ok) { await new Promise(r => setTimeout(r, 1000 * attempt)); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) return 'error';
      fs.writeFileSync(dest, buf);
      return 'ok';
    } catch { await new Promise(r => setTimeout(r, 1000 * attempt)); }
  }
  return 'error';
}

const gifExists = (id: string) => {
  const p = path.join(GIF_DIR, `${id}.gif`);
  return fs.existsSync(p) && fs.statSync(p).size > 0;
};

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!NEEDLE) {
    console.error('Podaj fragment nazwy ćwiczenia, np.:');
    console.error('  npx ts-node --project tsconfig.scripts.json prisma/link-exercise.ts "ławce poziomej"');
    process.exit(1);
  }

  const matches = await prisma.exercise.findMany({
    where: { name: { contains: NEEDLE, mode: 'insensitive' } },
    orderBy: { name: 'asc' },
    include: { _count: { select: { entries: true } } },
  });

  if (matches.length === 0) {
    console.log(`Brak ćwiczeń zawierających „${NEEDLE}".`);
    return;
  }

  console.log(`Znaleziono ${matches.length} ćwiczeń dla „${NEEDLE}":\n`);
  for (const m of matches) {
    const gif = m.exerciseDbId ? (gifExists(m.exerciseDbId) ? '✓ plik GIF jest' : '✗ BRAK pliku GIF') : '—';
    console.log(`  • ${m.name}  [${m.muscleGroup ?? 'brak grupy'}]  wpisów: ${m._count.entries}`);
    console.log(`      exerciseDbId: ${m.exerciseDbId || '— BRAK POWIĄZANIA —'}   ${gif}`);
    console.log(`      v2Id: ${m.v2Id || '—'}  v2VideoUrl: ${m.v2VideoUrl ? 'jest' : '—'}\n`);
  }

  if (matches.length > 1) {
    console.log('Więcej niż jedno trafienie — zawęź frazę, żeby zapisać powiązanie.');
    return;
  }
  const ex = matches[0];

  // ── Odlinkowanie ───────────────────────────────────────────────────────────
  if (UNLINK) {
    if (!APPLY) { console.log('[SUCHY PRZEBIEG] Dodaj --apply, żeby usunąć powiązanie.'); return; }
    await prisma.exercise.update({ where: { id: ex.id }, data: { exerciseDbId: null } });
    console.log(`✓ Usunięto powiązanie dla „${ex.name}".`);
    return;
  }

  // ── Wybór ID ───────────────────────────────────────────────────────────────
  const catalog = await loadCatalog();
  const byId = new Map(catalog.map(c => [c.exerciseId, c]));
  let chosen: Catalog | null = null;

  if (FORCED_ID) {
    chosen = byId.get(FORCED_ID) ?? { exerciseId: FORCED_ID, name: '(ID poza katalogiem)' };
    console.log(`Wskazane ID: ${FORCED_ID} → „${chosen.name}"\n`);
  } else {
    const query = CUSTOM_QUERY || buildQuery(ex.name);
    console.log(`Fraza szukania: „${query}"${CUSTOM_QUERY ? '' : '  (auto z polskiej nazwy)'}\n`);
    const ranked = catalog
      .map(c => ({ c, s: score(query, c.name) }))
      .filter(r => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8);

    if (ranked.length === 0) {
      console.log('Brak kandydatów. Podaj własną frazę: --query "barbell bench press"');
      return;
    }
    console.log('Kandydaci z ExerciseDB:');
    ranked.forEach((r, i) => console.log(
      `  ${i === 0 ? '→' : ' '} [${String(r.s).padStart(3)}] ${r.c.exerciseId.padEnd(9)} ${r.c.name}` +
      `${gifExists(r.c.exerciseId) ? '   (GIF już pobrany)' : ''}`
    ));
    console.log();
    chosen = ranked[0].c;
  }

  const full = byId.get(chosen.exerciseId);
  if (full?.instructions?.length) {
    console.log('Technika (ExerciseDB):');
    full.instructions.forEach(s => console.log(`   ${s}`));
    console.log();
  }

  if (!APPLY) {
    console.log('[SUCHY PRZEBIEG] Nic nie zapisano. Aby zapisać:');
    console.log(`  npx ts-node --project tsconfig.scripts.json prisma/link-exercise.ts "${NEEDLE}" --id ${chosen.exerciseId} --apply`);
    return;
  }

  // ── Zapis + GIF ────────────────────────────────────────────────────────────
  await prisma.exercise.update({
    where: { id: ex.id },
    data: { exerciseDbId: chosen.exerciseId },
  });
  console.log(`✓ „${ex.name}"  →  ${chosen.exerciseId} („${chosen.name}")`);

  const r = await downloadGif(chosen.exerciseId);
  const msg = {
    ok: '✓ GIF pobrany do public/exercise-gifs/',
    exists: '✓ GIF już był w public/exercise-gifs/',
    notfound: '✗ ExerciseDB nie ma GIF-a dla tego ID (404) — miniatura się nie pojawi',
    error: '! błąd pobierania GIF-a — uruchom prisma/download-gifs.ts później',
  }[r];
  console.log(`  ${msg}`);

  if (r === 'ok') {
    console.log('\nPamiętaj scommitować nowy plik, żeby Vercel go serwował:');
    console.log(`  git add public/exercise-gifs/${chosen.exerciseId}.gif && git commit -m "gif: ${chosen.exerciseId}" && git push`);
  } else if (r === 'exists') {
    console.log('\nPlik był już w repo — miniatura pojawi się od razu po odświeżeniu listy.');
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
