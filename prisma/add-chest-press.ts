/**
 * Sprawdza, czy w bazie jest maszynowe wyciskanie na klatkę (chest press) i
 * dodaje je TYLKO jeśli podobnego jeszcze nie ma (idempotentne — można puszczać
 * wielokrotnie bez tworzenia duplikatów).
 *
 * Uruchom:  npx tsx prisma/add-chest-press.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Nazwa i grupa nowego ćwiczenia (konwencja jak w seed-popular-exercises.ts)
const NEW_EXERCISE = {
  name: 'Wyciskanie na maszynie siedząc (tzw. chest press)',
  muscleGroup: 'Klatka piersiowa',
};

// Czy dana pozycja to już maszynowe wyciskanie NA KLATKĘ?
function isChestPressMachine(name: string, muscleGroup: string | null): boolean {
  const n = (name || '').toLowerCase();
  const g = (muscleGroup || '').toLowerCase();
  const chestCtx = n.includes('klat') || g.includes('klat') || n.includes('chest');
  if (n.includes('chest press')) return true;                       // np. "... (chest press)"
  if (n.includes('wyciskanie na maszynie') && chestCtx) return true; // klatkowe, nie barki/triceps
  if (n.includes('maszyn') && n.includes('chest')) return true;
  return false;
}

async function main() {
  const all = await prisma.exercise.findMany({ orderBy: { name: 'asc' } });
  console.log(`Ćwiczeń w bazie: ${all.length}\n`);

  // Pokaż wszystkie klatkowe — dla kontekstu
  const chest = all.filter(e =>
    (e.muscleGroup || '').toLowerCase().includes('klat') ||
    (e.name || '').toLowerCase().includes('klat')
  );
  console.log(`Ćwiczenia na klatkę (${chest.length}):`);
  chest.forEach(e => console.log(`   • ${e.name}  [${e.muscleGroup ?? '—'}]`));

  // Sprawdź, czy podobne już istnieje
  const existing = all.filter(e => isChestPressMachine(e.name, e.muscleGroup));
  if (existing.length > 0) {
    console.log(`\n✅ Podobne ćwiczenie już istnieje — NIE dodaję:`);
    existing.forEach(e => console.log(`   • ${e.name}  [${e.muscleGroup ?? '—'}]`));
    return;
  }

  // Zabezpieczenie przed dokładnym duplikatem nazwy (case-insensitive)
  const dupe = all.find(e => e.name.toLowerCase().trim() === NEW_EXERCISE.name.toLowerCase().trim());
  if (dupe) {
    console.log(`\n✅ Ćwiczenie o tej nazwie już istnieje — NIE dodaję: "${dupe.name}"`);
    return;
  }

  const created = await prisma.exercise.create({ data: NEW_EXERCISE });
  console.log(`\n➕ Dodano: "${created.name}"  [${created.muscleGroup}]  (id: ${created.id})`);
  console.log(`   Gif podepniesz w aplikacji: otwórz ćwiczenie → "Technika i opis" → wybierz z propozycji.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
