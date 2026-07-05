/**
 * Porządkuje nazewnictwo ćwiczeń: scala duplikaty, poprawia literówki i miesza-
 * nkę PL/EN, ujednolica grupy. Wszystkie decyzje są zaszyte poniżej.
 *
 * BEZPIECZEŃSTWO:
 *  • Scalanie NIE kasuje historii — przepina wpisy (i ulubione, i szablony)
 *    z duplikatu na nazwę docelową, a dopiero potem usuwa pustą „skorupę".
 *  • DOMYŚLNIE suchy przebieg (pokazuje, co zrobi). Realnie wykonuje z --apply.
 *  • Zrób backup przed --apply:  prisma/backup-history.ts
 *
 *   npx ts-node --project tsconfig.scripts.json prisma/cleanup-exercise-names.ts           (podgląd)
 *   npx ts-node --project tsconfig.scripts.json prisma/cleanup-exercise-names.ts --apply    (wykonanie)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const norm = (s: string) => s.trim().toLowerCase();

// Scalanie duplikatów: wpisy z `from` trafiają do `into` (nazwa, która zostaje).
const MERGES: { into: string; from: string[] }[] = [
  { into: 'Podciąganie na drążku (nachwytem)', from: ['Podciąganie nachwytem'] },
  { into: 'Wiosłowanie na maszynie (siedząc)', from: ['Wiosłowanie siedząc na maszynie'] },
  { into: 'Prostowanie ramion na wyciągu (triceps pushdown)', from: ['Prostowanie przedramion na wyciągu górnym (Triceps Pushdown)'] },
  { into: 'Prostowanie nóg na maszynie (Leg extension)', from: ['Leg extension'] },
  { into: 'Leg press', from: ['Leg press wypychanie na maszynie'] },
  { into: 'Uginanie nóg leżąc na maszynie', from: ['Uginanie nóg na maszynie (Leg curl)'] },
  { into: 'Uginanie ramion ze sztangą (biceps)', from: ['Uginanie przedramion ze sztangą (biceps)'] },
  { into: 'Wiosłowanie sztangą w opadzie tułowia', from: ['Wiosłowanie sztangą'] },
  { into: 'Wyciskanie hantli na barki jednorącz', from: ['Wyciskanie hantli na barki jednorącz (wersja 2)'] },
  { into: 'Kickback z hantlem', from: ['Prostowanie przedramion z hantlami w opadzie tułowia (Triceps kickback)'] },
];

// Zmiany nazw (literówki, PL/EN, doprecyzowanie). Pomijane, jeśli nazwa docelowa
// jest już zajęta (wtedy to duplikat — patrz MERGES).
const RENAMES: { from: string; to: string }[] = [
  { from: 'Hip trust na maszynie', to: 'Hip thrust na maszynie' },
  { from: 'Szrugsy', to: 'Szrugi' },
  { from: 'Sled 45в° prasa do nóg', to: 'Wyciskanie nóg na suwnicy 45°' },
  { from: 'Rotary torso skosy brzuch', to: 'Skręty tułowia na maszynie' },
  { from: 'Chwyt młotkowy ławka skos', to: 'Uginanie młotkowe na ławce skośnej' },
  { from: 'Uginanie ramion ławka', to: 'Uginanie ramion na ławce' },
  { from: 'Uginanie nadgarstków nachwytem ze sztangą trzymaną z tyłu.', to: 'Uginanie nadgarstków nachwytem ze sztangą z tyłu' },
  { from: 'Leg press', to: 'Wypychanie nóg na maszynie (Leg press)' },
  { from: 'Seated dip', to: 'Dipy na maszynie siedząc' },
];

// Ujednolicenie etykiet grup (dla wszystkich ćwiczeń z daną grupą).
const REGROUP_MAP: Record<string, string> = {
  'BARKI': 'Barki',
  'Uda': 'Nogi',
  'Nogi (uda)': 'Nogi',
  'Nogi (łydki)': 'Nogi',
};

// Przeniesienie pojedynczych ćwiczeń do właściwej grupy (po nazwie).
const REGROUP_EXERCISE: { name: string; group: string }[] = [
  { name: 'Szrugi', group: 'Plecy' },   // było w „Szyja"
  { name: 'Szrugsy', group: 'Plecy' },  // fallback, gdyby rename się nie wykonał
];

interface Ex { id: string; name: string; muscleGroup: string | null }

async function main() {
  let all: Ex[] = await prisma.exercise.findMany({ select: { id: true, name: true, muscleGroup: true } });
  const byName = new Map<string, Ex>(all.map(e => [norm(e.name), e]));

  console.log(APPLY ? '=== WYKONANIE (--apply) ===\n' : '=== SUCHY PRZEBIEG (bez zmian) ===\n');

  // ── 1. Scalanie duplikatów ────────────────────────────────────────────────
  console.log('— Scalanie duplikatów —');
  for (const m of MERGES) {
    const canon = byName.get(norm(m.into));
    if (!canon) { console.log(`  SKIP: brak docelowego „${m.into}"`); continue; }
    for (const fromName of m.from) {
      const dup = byName.get(norm(fromName));
      if (!dup) { console.log(`  – brak duplikatu „${fromName}"`); continue; }
      if (dup.id === canon.id) continue;
      const cnt = await prisma.workoutEntry.count({ where: { exerciseId: dup.id } });
      console.log(`  MERGE „${dup.name}" → „${canon.name}"  (${cnt} wpisów do przepięcia)`);
      if (APPLY) {
        await prisma.workoutEntry.updateMany({ where: { exerciseId: dup.id }, data: { exerciseId: canon.id } });
        const canonFavUsers = new Set(
          (await prisma.userFavorite.findMany({ where: { exerciseId: canon.id }, select: { userId: true } })).map(f => f.userId)
        );
        const dupFavs = await prisma.userFavorite.findMany({ where: { exerciseId: dup.id } });
        for (const f of dupFavs) {
          if (canonFavUsers.has(f.userId)) await prisma.userFavorite.delete({ where: { id: f.id } });
          else await prisma.userFavorite.update({ where: { id: f.id }, data: { exerciseId: canon.id } });
        }
        const templates = await prisma.workoutTemplate.findMany();
        for (const t of templates) {
          const arr = Array.isArray(t.entries) ? (t.entries as unknown as { exerciseId?: string }[]) : [];
          let changed = false;
          for (const it of arr) if (it && it.exerciseId === dup.id) { it.exerciseId = canon.id; changed = true; }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (changed) await prisma.workoutTemplate.update({ where: { id: t.id }, data: { entries: arr as any } });
        }
        await prisma.exercise.delete({ where: { id: dup.id } });
        byName.delete(norm(fromName));
      }
    }
  }

  // ── 2. Zmiany nazw ──────────────────────────────────────────────────────────
  console.log('\n— Zmiany nazw —');
  for (const r of RENAMES) {
    const ex = byName.get(norm(r.from));
    if (!ex) { console.log(`  SKIP: brak „${r.from}"`); continue; }
    const taken = byName.get(norm(r.to));
    if (taken && taken.id !== ex.id) { console.log(`  SKIP: „${r.to}" już istnieje (to duplikat, nie rename)`); continue; }
    console.log(`  RENAME „${ex.name}" → „${r.to}"`);
    if (APPLY) {
      await prisma.exercise.update({ where: { id: ex.id }, data: { name: r.to } });
      byName.delete(norm(r.from));
      byName.set(norm(r.to), { ...ex, name: r.to });
    }
  }

  // ── 3. Ujednolicenie grup ────────────────────────────────────────────────
  console.log('\n— Grupy —');
  for (const [oldG, newG] of Object.entries(REGROUP_MAP)) {
    const cnt = await prisma.exercise.count({ where: { muscleGroup: oldG } });
    if (cnt === 0) continue;
    console.log(`  REGROUP „${oldG}" → „${newG}"  (${cnt})`);
    if (APPLY) await prisma.exercise.updateMany({ where: { muscleGroup: oldG }, data: { muscleGroup: newG } });
  }
  for (const rg of REGROUP_EXERCISE) {
    const ex = byName.get(norm(rg.name));
    if (!ex || ex.muscleGroup === rg.group) continue;
    console.log(`  REGROUP „${ex.name}" → grupa „${rg.group}"`);
    if (APPLY) await prisma.exercise.update({ where: { id: ex.id }, data: { muscleGroup: rg.group } });
  }

  console.log(APPLY ? '\n✓ Zmiany zastosowane. Historia nietknięta (przepięta).'
                    : '\n[SUCHY PRZEBIEG] Nic nie zmieniono. Uruchom z --apply, aby wykonać.');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
