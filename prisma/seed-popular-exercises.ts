/**
 * Seed popular exercises — adds only those not already in DB (by name, case-insensitive).
 * Run: npx tsx prisma/seed-popular-exercises.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const POPULAR: { name: string; muscleGroup: string }[] = [
  // ─── KLATKA PIERSIOWA ───────────────────────────────────
  { name: 'Wyciskanie sztangi na ławce poziomej', muscleGroup: 'Klatka piersiowa' },
  { name: 'Wyciskanie sztangi na ławce skośnej (górnej)', muscleGroup: 'Klatka piersiowa' },
  { name: 'Wyciskanie sztangi na ławce skośnej (dolnej)', muscleGroup: 'Klatka piersiowa' },
  { name: 'Wyciskanie hantli na ławce poziomej', muscleGroup: 'Klatka piersiowa' },
  { name: 'Wyciskanie hantli na ławce skośnej (górnej)', muscleGroup: 'Klatka piersiowa' },
  { name: 'Rozpiętki z hantlami na ławce poziomej', muscleGroup: 'Klatka piersiowa' },
  { name: 'Rozpiętki na wyciągu (krzyżowanie linek)', muscleGroup: 'Klatka piersiowa' },
  { name: 'Pompki', muscleGroup: 'Klatka piersiowa' },
  { name: 'Pompki na poręczach (Dips)', muscleGroup: 'Klatka piersiowa' },
  { name: 'Wyciskanie na maszynie (klatka)', muscleGroup: 'Klatka piersiowa' },

  // ─── PLECY ──────────────────────────────────────────────
  { name: 'Martwy ciąg', muscleGroup: 'Plecy' },
  { name: 'Martwy ciąg rumuński', muscleGroup: 'Plecy' },
  { name: 'Podciąganie na drążku (nachwytem)', muscleGroup: 'Plecy' },
  { name: 'Podciąganie na drążku (podchwytem)', muscleGroup: 'Plecy' },
  { name: 'Ściąganie drążka wyciągu do klatki (szerokim nachwytem)', muscleGroup: 'Plecy' },
  { name: 'Ściąganie drążka wyciągu do klatki (podchwytem)', muscleGroup: 'Plecy' },
  { name: 'Wiosłowanie sztangą w opadzie tułowia', muscleGroup: 'Plecy' },
  { name: 'Wiosłowanie hantlem jednoręcznie', muscleGroup: 'Plecy' },
  { name: 'Wiosłowanie na maszynie (siedząc)', muscleGroup: 'Plecy' },
  { name: 'Wznosy ramion w górę na wyciągu (face pull)', muscleGroup: 'Plecy' },
  { name: 'Szrugi ze sztangą', muscleGroup: 'Plecy' },
  { name: 'Szrugi z hantlami', muscleGroup: 'Plecy' },
  { name: 'Hyperextension', muscleGroup: 'Plecy' },

  // ─── BARKI ──────────────────────────────────────────────
  { name: 'Wyciskanie sztangi nad głowę (OHP)', muscleGroup: 'Barki' },
  { name: 'Wyciskanie hantli nad głowę (siedząc)', muscleGroup: 'Barki' },
  { name: 'Wyciskanie Arnolda', muscleGroup: 'Barki' },
  { name: 'Wznosy bokiem z hantlami', muscleGroup: 'Barki' },
  { name: 'Wznosy przodem z hantlami', muscleGroup: 'Barki' },
  { name: 'Wznosy w opadzie tułowia (Rear delt fly)', muscleGroup: 'Barki' },
  { name: 'Odwrotne rozpiętki na maszynie', muscleGroup: 'Barki' },
  { name: 'Upright row ze sztangą', muscleGroup: 'Barki' },

  // ─── BICEPS ─────────────────────────────────────────────
  { name: 'Uginanie ramion ze sztangą (biceps)', muscleGroup: 'Biceps' },
  { name: 'Uginanie ramion z hantlami naprzemiennie', muscleGroup: 'Biceps' },
  { name: 'Uginanie ramion z hantlami (jednocześnie)', muscleGroup: 'Biceps' },
  { name: 'Uginanie ramion na modlitewniku (Scott curl)', muscleGroup: 'Biceps' },
  { name: 'Uginanie ramion na wyciągu dolnym', muscleGroup: 'Biceps' },
  { name: 'Uginanie ramion z hantlem (Hammer curl)', muscleGroup: 'Biceps' },

  // ─── TRICEPS ────────────────────────────────────────────
  { name: 'Wąskie wyciskanie sztangi', muscleGroup: 'Triceps' },
  { name: 'French press (sztanga)', muscleGroup: 'Triceps' },
  { name: 'French press (hantle)', muscleGroup: 'Triceps' },
  { name: 'Prostowanie ramion na wyciągu (triceps pushdown)', muscleGroup: 'Triceps' },
  { name: 'Prostowanie ramion nad głową na wyciągu', muscleGroup: 'Triceps' },
  { name: 'Kickback z hantlem', muscleGroup: 'Triceps' },
  { name: 'Pompki na poręczach (wąski chwyt)', muscleGroup: 'Triceps' },

  // ─── NOGI ───────────────────────────────────────────────
  { name: 'Przysiad ze sztangą (Squat)', muscleGroup: 'Nogi' },
  { name: 'Przysiad bułgarski (Bulgarian split squat)', muscleGroup: 'Nogi' },
  { name: 'Przysiad z hantlami (Goblet squat)', muscleGroup: 'Nogi' },
  { name: 'Leg press', muscleGroup: 'Nogi' },
  { name: 'Prostowanie nóg na maszynie (Leg extension)', muscleGroup: 'Nogi' },
  { name: 'Uginanie nóg na maszynie (Leg curl)', muscleGroup: 'Nogi' },
  { name: 'Uginanie nóg na maszynie (stojąc)', muscleGroup: 'Nogi' },
  { name: 'Wykroki z hantlami', muscleGroup: 'Nogi' },
  { name: 'Wykroki ze sztangą', muscleGroup: 'Nogi' },
  { name: 'Hip thrust ze sztangą', muscleGroup: 'Nogi' },
  { name: 'Wspięcia na palce (Calf raises, stojąc)', muscleGroup: 'Nogi' },
  { name: 'Wspięcia na palce na maszynie (siedząc)', muscleGroup: 'Nogi' },
  { name: 'Abdukcja na maszynie', muscleGroup: 'Nogi' },
  { name: 'Addukcja na maszynie', muscleGroup: 'Nogi' },
  { name: 'Sumo deadlift', muscleGroup: 'Nogi' },

  // ─── BRZUCH ─────────────────────────────────────────────
  { name: 'Plank (deska)', muscleGroup: 'Brzuch' },
  { name: 'Plank boczny', muscleGroup: 'Brzuch' },
  { name: 'Brzuszki (Crunch)', muscleGroup: 'Brzuch' },
  { name: 'Skręty tułowia (Russian twist)', muscleGroup: 'Brzuch' },
  { name: 'Unoszenie nóg w zwisie', muscleGroup: 'Brzuch' },
  { name: 'Unoszenie kolan do klatki w zwisie', muscleGroup: 'Brzuch' },
  { name: 'Rolka do brzuszków (Ab wheel)', muscleGroup: 'Brzuch' },
  { name: 'Nożyce', muscleGroup: 'Brzuch' },
  { name: 'Ściąganie liny na wyciągu górnym do brzucha', muscleGroup: 'Brzuch' },

  // ─── CARDIO ─────────────────────────────────────────────
  { name: 'Bieżnia', muscleGroup: 'Cardio' },
  { name: 'Rower stacjonarny', muscleGroup: 'Cardio' },
  { name: 'Orbitrek (Elliptical)', muscleGroup: 'Cardio' },
  { name: 'Wiosłowanie na ergometrze', muscleGroup: 'Cardio' },
  { name: 'Skakanka', muscleGroup: 'Cardio' },
  { name: 'Burpee', muscleGroup: 'Cardio' },
  { name: 'Przysiady z wyskokiem (Jump squat)', muscleGroup: 'Cardio' },
  { name: 'Mountain climbers', muscleGroup: 'Cardio' },
];

async function main() {
  const existing = await prisma.exercise.findMany({ select: { name: true } });
  const existingNames = new Set(existing.map(e => e.name.toLowerCase().trim()));

  const toAdd = POPULAR.filter(e => !existingNames.has(e.name.toLowerCase().trim()));

  console.log(`Istniejących ćwiczeń: ${existing.length}`);
  console.log(`Do dodania: ${toAdd.length}`);

  let added = 0;
  for (const ex of toAdd) {
    await prisma.exercise.create({ data: ex });
    console.log(`  ✓ ${ex.muscleGroup}: ${ex.name}`);
    added++;
  }

  console.log(`\nDodano ${added} ćwiczeń.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
