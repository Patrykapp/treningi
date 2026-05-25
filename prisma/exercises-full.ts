import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const exercises = [
    // ─── BARKI ────────────────────────────────────────────────────────────────
    { name: 'Barki - Wyciskanie hantlami siedząc',      muscleGroup: 'Barki' },
    { name: 'Barki - Wyciskanie Arnolda',               muscleGroup: 'Barki' },
    { name: 'Barki - Unoszenie hantli przodem',         muscleGroup: 'Barki' },
    { name: 'Barki - Unoszenie boczne na lince',        muscleGroup: 'Barki' },
    { name: 'Barki - Odwrotne rozpiętki w opadzie',     muscleGroup: 'Barki' },
    { name: 'Barki - Odwrotne rozpiętki na maszynie',   muscleGroup: 'Barki' },
    { name: 'Barki - Wyciskanie na maszynie',           muscleGroup: 'Barki' },
    { name: 'Barki - Upright row ze sztangą',           muscleGroup: 'Barki' },
    { name: 'Barki - Upright row z hantlami',           muscleGroup: 'Barki' },
    { name: 'Barki - Face pull na lince',               muscleGroup: 'Barki' },
    { name: 'Barki - Szrugsy ze sztangą',               muscleGroup: 'Barki' },
    { name: 'Barki - Szrugsy na maszynie',              muscleGroup: 'Barki' },

    // ─── BICEPS ───────────────────────────────────────────────────────────────
    { name: 'Biceps - Uginanie ze sztangą prostą',      muscleGroup: 'Biceps' },
    { name: 'Biceps - Uginanie z hantlami stojąc',      muscleGroup: 'Biceps' },
    { name: 'Biceps - Uginanie naprzemienne',           muscleGroup: 'Biceps' },
    { name: 'Biceps - Uginanie na lince (cable curl)',  muscleGroup: 'Biceps' },
    { name: 'Biceps - Uginanie na maszynie',            muscleGroup: 'Biceps' },
    { name: 'Biceps - Uginanie na skosie (incline)',    muscleGroup: 'Biceps' },
    { name: 'Biceps - Spider curl',                     muscleGroup: 'Biceps' },
    { name: 'Biceps - Uginanie koncentryczne',          muscleGroup: 'Biceps' },

    // ─── BRZUCH ───────────────────────────────────────────────────────────────
    { name: 'Brzuch - Deska (plank)',                   muscleGroup: 'Brzuch' },
    { name: 'Brzuch - Deska bokiem',                    muscleGroup: 'Brzuch' },
    { name: 'Brzuch - Brzuszki klasyczne',              muscleGroup: 'Brzuch' },
    { name: 'Brzuch - Brzuszki skośne',                 muscleGroup: 'Brzuch' },
    { name: 'Brzuch - Russian twist',                   muscleGroup: 'Brzuch' },
    { name: 'Brzuch - Mountain climbers',               muscleGroup: 'Brzuch' },
    { name: 'Brzuch - Kółko brzuszne (ab wheel)',       muscleGroup: 'Brzuch' },
    { name: 'Brzuch - Nożyce',                          muscleGroup: 'Brzuch' },
    { name: 'Brzuch - Wznos nóg na poręczach',          muscleGroup: 'Brzuch' },
    { name: 'Brzuch - Crunch na lince',                 muscleGroup: 'Brzuch' },
    { name: 'Brzuch - Dead bug',                        muscleGroup: 'Brzuch' },
    { name: 'Brzuch - V-up',                            muscleGroup: 'Brzuch' },
    { name: 'Brzuch - Pallof press',                    muscleGroup: 'Brzuch' },

    // ─── KLATA ────────────────────────────────────────────────────────────────
    { name: 'Klata - Wyciskanie sztangi skos dodatni',  muscleGroup: 'Klata' },
    { name: 'Klata - Wyciskanie sztangi skos ujemny',   muscleGroup: 'Klata' },
    { name: 'Klata - Wyciskanie hantlami płasko',       muscleGroup: 'Klata' },
    { name: 'Klata - Wyciskanie hantlami skos',         muscleGroup: 'Klata' },
    { name: 'Klata - Wyciskanie hantlami skos ujemny',  muscleGroup: 'Klata' },
    { name: 'Klata - Rozpiętki na lince',               muscleGroup: 'Klata' },
    { name: 'Klata - Rozpiętki na maszynie (pec deck)', muscleGroup: 'Klata' },
    { name: 'Klata - Wyciskanie na maszynie',           muscleGroup: 'Klata' },
    { name: 'Klata - Pullover ze sztangielką',          muscleGroup: 'Klata' },
    { name: 'Klata - Pompki diamentowe',                muscleGroup: 'Klata' },
    { name: 'Klata - Pompki szeroki rozstaw',           muscleGroup: 'Klata' },
    { name: 'Klata - Landmine press',                   muscleGroup: 'Klata' },

    // ─── NOGI ─────────────────────────────────────────────────────────────────
    { name: 'Nogi - Przysiady goblet',                  muscleGroup: 'Nogi' },
    { name: 'Nogi - Przysiady frontalne',               muscleGroup: 'Nogi' },
    { name: 'Nogi - Przysiady bułgarskie',              muscleGroup: 'Nogi' },
    { name: 'Nogi - Przysiady sumo',                    muscleGroup: 'Nogi' },
    { name: 'Nogi - Wypady z hantlami',                 muscleGroup: 'Nogi' },
    { name: 'Nogi - Wypady kroczące',                   muscleGroup: 'Nogi' },
    { name: 'Nogi - Wypady ze sztangą',                 muscleGroup: 'Nogi' },
    { name: 'Nogi - Martwy ciąg rumuński',              muscleGroup: 'Nogi' },
    { name: 'Nogi - Martwy ciąg sumo',                  muscleGroup: 'Nogi' },
    { name: 'Nogi - Martwy ciąg na prostych nogach',    muscleGroup: 'Nogi' },
    { name: 'Nogi - Hip thrust ze sztangą',             muscleGroup: 'Nogi' },
    { name: 'Nogi - Hip thrust na maszynie',            muscleGroup: 'Nogi' },
    { name: 'Nogi - Uginanie nóg leżąc',                muscleGroup: 'Nogi' },
    { name: 'Nogi - Uginanie nóg siedząc',              muscleGroup: 'Nogi' },
    { name: 'Nogi - Wspięcia na palce stojąc',          muscleGroup: 'Nogi' },
    { name: 'Nogi - Wspięcia na palce siedząc',         muscleGroup: 'Nogi' },
    { name: 'Nogi - Hack squat na maszynie',            muscleGroup: 'Nogi' },
    { name: 'Nogi - Step-up z hantlami',                muscleGroup: 'Nogi' },
    { name: 'Nogi - Przywodziciele na maszynie',        muscleGroup: 'Nogi' },
    { name: 'Nogi - Odwodziciele na maszynie',          muscleGroup: 'Nogi' },
    { name: 'Nogi - Glute kickback na maszynie',        muscleGroup: 'Nogi' },
    { name: 'Nogi - Nordic curl',                       muscleGroup: 'Nogi' },
    { name: 'Nogi - Box squat',                         muscleGroup: 'Nogi' },
    { name: 'Nogi - Sissy squat',                       muscleGroup: 'Nogi' },

    // ─── PLECY ────────────────────────────────────────────────────────────────
    { name: 'Plecy - Martwy ciąg klasyczny',            muscleGroup: 'Plecy' },
    { name: 'Plecy - Wiosłowanie hantlą',               muscleGroup: 'Plecy' },
    { name: 'Plecy - Wiosłowanie na maszynie',          muscleGroup: 'Plecy' },
    { name: 'Plecy - Wiosłowanie w siedzie na lince',   muscleGroup: 'Plecy' },
    { name: 'Plecy - Ściąganie drążka nachwytem',       muscleGroup: 'Plecy' },
    { name: 'Plecy - Ściąganie drążka podchwytem',      muscleGroup: 'Plecy' },
    { name: 'Plecy - Ściąganie drążka neutralnie',      muscleGroup: 'Plecy' },
    { name: 'Plecy - Ściąganie na prostych rękach',     muscleGroup: 'Plecy' },
    { name: 'Plecy - Podciąganie nachwytem',            muscleGroup: 'Plecy' },
    { name: 'Plecy - Hipersekstensja',                  muscleGroup: 'Plecy' },
    { name: 'Plecy - T-bar row',                        muscleGroup: 'Plecy' },
    { name: 'Plecy - Good morning',                     muscleGroup: 'Plecy' },
    { name: 'Plecy - Wiosłowanie odwróconym chwytem',   muscleGroup: 'Plecy' },
    { name: 'Plecy - Snatch grip deadlift',             muscleGroup: 'Plecy' },

    // ─── TRICEPS ──────────────────────────────────────────────────────────────
    { name: 'Triceps - Wyciskanie wąskim chwytem',      muscleGroup: 'Triceps' },
    { name: 'Triceps - Prostowanie na lince (V-bar)',   muscleGroup: 'Triceps' },
    { name: 'Triceps - Prostowanie odwrotnym chwytem',  muscleGroup: 'Triceps' },
    { name: 'Triceps - Prostowanie nad głową na lince', muscleGroup: 'Triceps' },
    { name: 'Triceps - Kickback z hantlem',             muscleGroup: 'Triceps' },
    { name: 'Triceps - Skull crushers (EZ-bar)',        muscleGroup: 'Triceps' },
    { name: 'Triceps - Dipy na poręczach',              muscleGroup: 'Triceps' },
    { name: 'Triceps - Prostowanie jednorącz na lince', muscleGroup: 'Triceps' },
    { name: 'Triceps - Wyciskanie na maszynie',         muscleGroup: 'Triceps' },

    // ─── PRZEDRAMIĘ ───────────────────────────────────────────────────────────
    { name: 'Przedramię - Uginanie nadgarstka podchwytem', muscleGroup: 'Przedramię' },
    { name: 'Przedramię - Uginanie nadgarstka nachwytem',  muscleGroup: 'Przedramię' },
    { name: 'Przedramię - Farmer\'s carry (spacer)',       muscleGroup: 'Przedramię' },
    { name: 'Przedramię - Dead hang',                      muscleGroup: 'Przedramię' },
    { name: 'Przedramię - Zwijanie taśmy (wrist roller)',  muscleGroup: 'Przedramię' },

    // ─── KALENISTYKA ──────────────────────────────────────────────────────────
    { name: 'Kalenistyka - Podciąganie nachwytem',      muscleGroup: 'Kalenistyka' },
    { name: 'Kalenistyka - Podciąganie podchwytem',     muscleGroup: 'Kalenistyka' },
    { name: 'Kalenistyka - Pompki klasyczne',           muscleGroup: 'Kalenistyka' },
    { name: 'Kalenistyka - Dipy na poręczach',          muscleGroup: 'Kalenistyka' },
    { name: 'Kalenistyka - Pike push-up',               muscleGroup: 'Kalenistyka' },
    { name: 'Kalenistyka - Muscle-up',                  muscleGroup: 'Kalenistyka' },
    { name: 'Kalenistyka - L-sit',                      muscleGroup: 'Kalenistyka' },
    { name: 'Kalenistyka - Dragon flag',                muscleGroup: 'Kalenistyka' },
    { name: 'Kalenistyka - Pistol squat',               muscleGroup: 'Kalenistyka' },
    { name: 'Kalenistyka - Front lever',                muscleGroup: 'Kalenistyka' },

    // ─── EXTRA ────────────────────────────────────────────────────────────────
    { name: 'Extra - Kettlebell swing',                 muscleGroup: 'Extra' },
    { name: 'Extra - Kettlebell clean and press',       muscleGroup: 'Extra' },
    { name: 'Extra - Box jump',                         muscleGroup: 'Extra' },
    { name: 'Extra - Burpees',                          muscleGroup: 'Extra' },
    { name: 'Extra - Skakanka',                         muscleGroup: 'Extra' },
    { name: 'Extra - Battle ropes',                     muscleGroup: 'Extra' },
    { name: 'Extra - Bieg na bieżni',                   muscleGroup: 'Extra' },
    { name: 'Extra - Rower stacjonarny',                muscleGroup: 'Extra' },
    { name: 'Extra - Ergometr wioślarski',              muscleGroup: 'Extra' },
    { name: 'Extra - Spacer farmera (kettlebells)',      muscleGroup: 'Extra' },
    { name: 'Extra - Rzuty piłką lekarską',             muscleGroup: 'Extra' },
  ];

  let added = 0;
  let skipped = 0;

  for (const ex of exercises) {
    try {
      const existing = await prisma.exercise.findUnique({ where: { name: ex.name } });
      if (existing) {
        skipped++;
        continue;
      }
      await prisma.exercise.create({ data: ex });
      console.log(`✓ ${ex.name}`);
      added++;
    } catch {
      console.log(`⚠ Błąd: ${ex.name}`);
    }
  }

  console.log(`\n✅ Dodano: ${added}, pominięto (już istnieją): ${skipped}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
