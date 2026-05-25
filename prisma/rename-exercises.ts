import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const renames: { id: string; name: string }[] = [
    // --- Oryginalne z seed ---
    { id: 'ex-bench',       name: 'Klata - Wyciskanie sztangi' },
    { id: 'ex-squat',       name: 'Nogi - Przysiady ze sztangą' },
    { id: 'ex-deadlift',    name: 'Plecy - Martwy ciąg' },
    { id: 'ex-pullup',      name: 'Plecy - Podciąganie' },
    { id: 'ex-ohp',         name: 'Barki - OHP' },
    { id: 'ex-row',         name: 'Plecy - Wiosłowanie sztangą' },

    // --- Barki ---
    { id: 'ex-ohp-sztanga',    name: 'Barki - Wyciskanie sztangi' },
    { id: 'ex-wznosy-kettle',  name: 'Barki - Wznosy kettlem pod brodę' },
    { id: 'ex-unoszenie-bok',  name: 'Barki - Unoszenie hantli w bok' },
    { id: 'ex-pikowane-pompki',name: 'Barki - Pikowane pompki' },
    { id: 'ex-szrugsy',        name: 'Barki - Szrugsy' },

    // --- Plecy ---
    { id: 'ex-pullup-challenge', name: 'Plecy - Pull up challenge' },
    { id: 'ex-wyciag-dolny',     name: 'Plecy - Wyciąg dolny' },
    { id: 'ex-lawka-rzymska',    name: 'Plecy - Ławka rzymska' },

    // --- Nogi ---
    { id: 'ex-wypychanie',   name: 'Nogi - Wypychanie na maszynie' },
    { id: 'ex-wznosy-stop',  name: 'Nogi - Wznosy stóp' },
    { id: 'ex-leg-extension',name: 'Nogi - Leg extension' },

    // --- Triceps ---
    { id: 'ex-wyciag-gorny',    name: 'Triceps - Wyciąg górny' },
    { id: 'ex-franc-lezac',     name: 'Triceps - Francuskie wyciskanie leżąc' },
    { id: 'ex-franc-siedzac',   name: 'Triceps - Francuskie wyciskanie siedząc' },
    { id: 'ex-franc-jednorecz', name: 'Triceps - Francuskie jednorącz' },
    { id: 'ex-pompki-triceps',  name: 'Triceps - Pompki' },

    // --- Klatka ---
    { id: 'ex-pompki-challenge', name: 'Klata - Pompki' },
    { id: 'ex-lawa-sztangielki', name: 'Klata - Ława sztangielki' },
    { id: 'ex-lawa-skos',        name: 'Klata - Ława skos' },
    { id: 'ex-dipy',             name: 'Klata - Dipy' },
    { id: 'ex-rozpietki',        name: 'Klata - Rozpiętki' },
    { id: 'ex-lawka-plaska',     name: 'Klata - Ławka płaska' },

    // --- Biceps ---
    { id: 'ex-podciaganie-podchwyt', name: 'Biceps - Podciąganie podchwytem' },
    { id: 'ex-uginanie-gryf',        name: 'Biceps - Uginanie gryfem łamanym' },
    { id: 'ex-modlitewnik',          name: 'Biceps - Modlitewnik' },
    { id: 'ex-21',                   name: 'Biceps - Wersja 21' },
    { id: 'ex-uginanie-supinacja',   name: 'Biceps - Uginanie z supinacją' },
    { id: 'ex-mlotki',               name: 'Biceps - Chwyt młotkowy' },

    // --- Brzuch ---
    { id: 'ex-brzuszki',        name: 'Brzuch - Wojskowe brzuszki' },
    { id: 'ex-unoszenie-nog',   name: 'Brzuch - Unoszenie nóg w zwisie' },
    { id: 'ex-komandos',        name: 'Brzuch - Odpoczynek komandosa' },
    { id: 'ex-unoszenie-bioder',name: 'Brzuch - Unoszenie bioder' },
    { id: 'ex-hollow-body',     name: 'Brzuch - Hollow body' },

    // --- Przedramię ---
    { id: 'ex-unoszenie-sztangielki', name: 'Przedramię - Unoszenie' },

    // --- Kalenistyka ---
    { id: 'ex-elbow-lever', name: 'Kalenistyka - Elbow lever' },
    { id: 'ex-crow-pose',   name: 'Kalenistyka - Crow pose' },
    { id: 'ex-handstand',   name: 'Kalenistyka - Handstand' },

    // --- Extra ---
    { id: 'ex-arm-wrestling', name: 'Extra - Siłowanie na rękę' },
  ];

  let updated = 0;
  for (const { id, name } of renames) {
    try {
      await prisma.exercise.update({ where: { id }, data: { name } });
      console.log(`✓ ${name}`);
      updated++;
    } catch {
      console.log(`⚠ Pominięto (nie znaleziono): ${id}`);
    }
  }

  console.log(`\nZaktualizowano ${updated} ćwiczeń.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
