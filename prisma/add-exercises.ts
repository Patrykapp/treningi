import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const exercises = [
    // Barki
    { id: 'ex-ohp-sztanga', name: 'Wyciskanie sztangi (barki)', muscleGroup: 'Barki' },
    { id: 'ex-wznosy-kettle', name: 'Wznosy kettlem pod brodę', muscleGroup: 'Barki' },
    { id: 'ex-unoszenie-bok', name: 'Unoszenie hantli w bok siedząc', muscleGroup: 'Barki' },
    { id: 'ex-pikowane-pompki', name: 'Pikowane pompki', muscleGroup: 'Barki' },
    { id: 'ex-szrugsy', name: 'Szrugsy sztangielkami', muscleGroup: 'Barki' },

    // Plecy
    { id: 'ex-pullup-challenge', name: 'Pull up challenge', muscleGroup: 'Plecy' },
    { id: 'ex-wyciag-dolny', name: 'Wyciąg dolny (wiosłowanie)', muscleGroup: 'Plecy' },
    { id: 'ex-lawka-rzymska', name: 'Ławka rzymska', muscleGroup: 'Plecy' },

    // Nogi
    { id: 'ex-wypychanie', name: 'Wypychanie na maszynie', muscleGroup: 'Nogi' },
    { id: 'ex-wznosy-stop', name: 'Wznosy stóp maszyna', muscleGroup: 'Nogi' },
    { id: 'ex-leg-extension', name: 'Leg extension (czworogłowe)', muscleGroup: 'Nogi' },

    // Triceps
    { id: 'ex-wyciag-gorny', name: 'Wyciąg górny ku dołowi sznurki', muscleGroup: 'Triceps' },
    { id: 'ex-franc-lezac', name: 'Francuskie wyciskanie leżąc', muscleGroup: 'Triceps' },
    { id: 'ex-franc-siedzac', name: 'Francuskie wyciskanie sztangielki siedząc', muscleGroup: 'Triceps' },
    { id: 'ex-franc-jednorecz', name: 'Francuskie wyciskanie jednorącz w siadzie', muscleGroup: 'Triceps' },
    { id: 'ex-pompki-triceps', name: 'Pompki tricepsowe', muscleGroup: 'Triceps' },

    // Klatka piersiowa
    { id: 'ex-pompki-challenge', name: 'Pompki challenge', muscleGroup: 'Klatka piersiowa' },
    { id: 'ex-lawa-sztangielki', name: 'Ława sztangielki', muscleGroup: 'Klatka piersiowa' },
    { id: 'ex-lawa-skos', name: 'Ława skos', muscleGroup: 'Klatka piersiowa' },
    { id: 'ex-dipy', name: 'Dipy', muscleGroup: 'Klatka piersiowa / Triceps' },
    { id: 'ex-rozpietki', name: 'Rozpiętki', muscleGroup: 'Klatka piersiowa' },
    { id: 'ex-lawka-plaska', name: 'Ławka płaska', muscleGroup: 'Klatka piersiowa' },

    // Biceps
    { id: 'ex-podciaganie-podchwyt', name: 'Podciąganie podchwytem', muscleGroup: 'Biceps / Plecy' },
    { id: 'ex-uginanie-gryf', name: 'Uginanie ramion gryfem łamanym', muscleGroup: 'Biceps' },
    { id: 'ex-modlitewnik', name: 'Modlitewnik', muscleGroup: 'Biceps' },
    { id: 'ex-21', name: 'Wersja 21 (szok dla bicepsa)', muscleGroup: 'Biceps' },
    { id: 'ex-uginanie-supinacja', name: 'Uginanie sztangielkami z supinacją', muscleGroup: 'Biceps' },
    { id: 'ex-mlotki', name: 'Chwyt młotkowy na ławce', muscleGroup: 'Biceps / Przedramię' },

    // Brzuch
    { id: 'ex-brzuszki', name: 'Wojskowe brzuszki', muscleGroup: 'Brzuch' },
    { id: 'ex-unoszenie-nog', name: 'Unoszenie nóg w zwisie', muscleGroup: 'Brzuch' },
    { id: 'ex-komandos', name: 'Odpoczynek komandosa', muscleGroup: 'Brzuch' },
    { id: 'ex-unoszenie-bioder', name: 'Unoszenie bioder w podporze bokiem', muscleGroup: 'Brzuch' },
    { id: 'ex-hollow-body', name: 'Hollow body', muscleGroup: 'Brzuch' },

    // Przedramię
    { id: 'ex-unoszenie-sztangielki', name: 'Unoszenie sztangielek (przedramię)', muscleGroup: 'Przedramię' },

    // Kalenistyka
    { id: 'ex-elbow-lever', name: 'Elbow lever', muscleGroup: 'Kalenistyka' },
    { id: 'ex-crow-pose', name: 'Crow pose', muscleGroup: 'Kalenistyka' },
    { id: 'ex-handstand', name: 'Nauka handstand', muscleGroup: 'Kalenistyka' },

    // Extra
    { id: 'ex-arm-wrestling', name: 'Siłowanie się na rękę z gumą', muscleGroup: 'Extra' },
  ];

  let added = 0;
  for (const ex of exercises) {
    const result = await prisma.exercise.upsert({
      where: { id: ex.id },
      update: {},
      create: ex,
    });
    added++;
    console.log(`✓ ${result.name} (${result.muscleGroup})`);
  }

  console.log(`\nDodano / zaktualizowano ${added} ćwiczeń.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
