/**
 * reset-exercises.ts
 * Kasuje całą historię treningów i ćwiczenia, pobiera ćwiczenia z ExerciseDB,
 * tłumaczy nazwy na polski, wstawia z exerciseDbId (100% dopasowanie techniki).
 *
 * Uruchom z katalogu "Workout app":
 *   npx tsx prisma/reset-exercises.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE = 'https://oss.exercisedb.dev';

// ─── Tłumaczenia grup mięśniowych ────────────────────────────────────────────
const BODY_PART_PL: Record<string, string> = {
  'chest':       'Klatka piersiowa',
  'back':        'Plecy',
  'shoulders':   'Barki',
  'upper arms':  'Ramiona',
  'lower arms':  'Przedramiona',
  'upper legs':  'Nogi (uda)',
  'lower legs':  'Nogi (łydki)',
  'waist':       'Brzuch',
  'neck':        'Szyja',
  'cardio':      'Cardio',
};

// ─── Ręczne tłumaczenia najważniejszych ćwiczeń (klucz = angielska nazwa lowercase) ──
const MANUAL: Record<string, string> = {
  // KLATKA
  'barbell bench press':                      'Wyciskanie sztangi – ławka płaska',
  'barbell incline bench press':              'Wyciskanie sztangi – ławka skośna',
  'barbell decline bench press':              'Wyciskanie sztangi – ławka ujemna',
  'dumbbell bench press':                     'Wyciskanie hantli – ławka płaska',
  'dumbbell incline bench press':             'Wyciskanie hantli – ławka skośna',
  'dumbbell decline bench press':             'Wyciskanie hantli – ławka ujemna',
  'cable fly':                                'Rozpiętki na wyciągu',
  'cable crossover':                          'Krzyżowanie linek na wyciągu',
  'dumbbell fly':                             'Rozpiętki z hantlami',
  'dumbbell incline fly':                     'Rozpiętki z hantlami – ławka skośna',
  'pec deck fly':                             'Rozpiętki na maszynie (pec deck)',
  'push-up':                                  'Pompki',
  'wide push-up':                             'Pompki szerokie',
  'decline push-up':                          'Pompki z nogami wyżej',
  'incline push-up':                          'Pompki z nogami niżej',
  'diamond push-up':                          'Pompki diamentowe',
  'chest dip':                                'Dipy na klatkę piersiową',
  'smith machine bench press':               'Wyciskanie na suwnicy Smitha – płaska',
  'smith machine incline bench press':       'Wyciskanie na suwnicy Smitha – skośna',
  'chest press machine':                      'Wyciskanie na maszynie (klatka)',
  'barbell pullover':                         'Pullover ze sztangą',
  'dumbbell pullover':                        'Pullover z hantlą',
  'landmine press':                           'Wyciskanie landmine',
  'cable chest press':                        'Wyciskanie na wyciągu (klatka)',

  // PLECY
  'pull-up':                                  'Podciąganie na drążku (nachwytem)',
  'chin-up':                                  'Podciąganie na drążku (podchwytem)',
  'neutral grip pull-up':                     'Podciąganie na drążku (neutralny chwyt)',
  'barbell bent over row':                    'Wiosłowanie sztangą w opadzie',
  'barbell row':                              'Wiosłowanie sztangą',
  'dumbbell row':                             'Wiosłowanie hantlem jednoręczne',
  'dumbbell bent over row':                   'Wiosłowanie hantlami w opadzie',
  'seated cable row':                         'Wiosłowanie siedząc na wyciągu',
  'cable row':                                'Wiosłowanie na wyciągu',
  't-bar row':                                'Wiosłowanie T-bar',
  'machine row':                              'Wiosłowanie na maszynie',
  'lat pulldown':                             'Ściąganie drążka do klatki',
  'wide grip lat pulldown':                   'Ściąganie drążka – szeroki chwyt',
  'close grip lat pulldown':                  'Ściąganie drążka – wąski chwyt',
  'single arm lat pulldown':                  'Ściąganie drążka jednoręczne',
  'straight arm pulldown':                    'Ściąganie prostych ramion na wyciągu',
  'deadlift':                                 'Martwy ciąg',
  'barbell deadlift':                         'Martwy ciąg ze sztangą',
  'romanian deadlift':                        'Martwy ciąg rumuński',
  'barbell romanian deadlift':               'Martwy ciąg rumuński ze sztangą',
  'dumbbell romanian deadlift':              'Martwy ciąg rumuński z hantlami',
  'sumo deadlift':                            'Martwy ciąg sumo',
  'trap bar deadlift':                        'Martwy ciąg trapezową sztangą',
  'face pull':                                'Ściąganie do twarzy (face pull)',
  'hyperextension':                           'Hyperekstensja',
  'back extension':                           'Wyprosty pleców',
  'good morning':                             'Good morning',
  'barbell good morning':                     'Good morning ze sztangą',
  'inverted row':                             'Wiosłowanie podciąganiem pod drążkiem',
  'cable pull through':                       'Ściąganie linki przez nogi',
  'superman':                                 'Superman (wyprost na podłodze)',

  // BARKI
  'barbell overhead press':                   'Wyciskanie sztangi nad głowę',
  'barbell shoulder press':                   'Wyciskanie sztangi żołnierskie',
  'dumbbell shoulder press':                  'Wyciskanie hantli na barki',
  'dumbbell overhead press':                  'Wyciskanie hantli nad głowę',
  'seated dumbbell press':                    'Wyciskanie hantli siedząc',
  'arnold press':                             'Wyciskanie Arnolda',
  'smith machine overhead press':            'Wyciskanie na suwnicy Smitha (barki)',
  'machine shoulder press':                   'Wyciskanie na maszynie (barki)',
  'lateral raise':                            'Unoszenie ramion bokiem',
  'dumbbell lateral raise':                   'Unoszenie hantli bokiem',
  'cable lateral raise':                      'Unoszenie bokiem na wyciągu',
  'front raise':                              'Unoszenie ramion przed siebie',
  'dumbbell front raise':                     'Unoszenie hantli przed siebie',
  'barbell front raise':                      'Unoszenie sztangi przed siebie',
  'cable front raise':                        'Unoszenie na wyciągu przed siebie',
  'reverse fly':                              'Odwrócone rozpiętki',
  'dumbbell reverse fly':                     'Odwrócone rozpiętki z hantlami',
  'cable reverse fly':                        'Odwrócone rozpiętki na wyciągu',
  'upright row':                              'Wiosłowanie pionowe',
  'barbell upright row':                      'Wiosłowanie pionowe ze sztangą',
  'dumbbell upright row':                     'Wiosłowanie pionowe z hantlami',
  'barbell shrug':                            'Wznosy barków ze sztangą',
  'dumbbell shrug':                           'Wznosy barków z hantlami',
  'cable shrug':                              'Wznosy barków na wyciągu',
  'push press':                               'Push press',

  // BICEPS
  'barbell curl':                             'Uginanie ramion ze sztangą',
  'barbell bicep curl':                       'Uginanie ramion ze sztangą',
  'dumbbell curl':                            'Uginanie ramion z hantlami',
  'dumbbell bicep curl':                      'Uginanie ramion z hantlami',
  'cable curl':                               'Uginanie ramion na wyciągu',
  'cable bicep curl':                         'Uginanie ramion na wyciągu',
  'hammer curl':                              'Uginanie ramion neutralne (hammer)',
  'dumbbell hammer curl':                     'Uginanie ramion neutralne z hantlami',
  'cable hammer curl':                        'Uginanie ramion neutralne na wyciągu',
  'incline dumbbell curl':                    'Uginanie ramion z hantlami na ławce skośnej',
  'concentration curl':                       'Uginanie skupione',
  'preacher curl':                            'Uginanie na pulpicie Scotta',
  'ez bar curl':                              'Uginanie ramion łamaną sztangą',
  'ez-bar curl':                              'Uginanie ramion łamaną sztangą',
  'spider curl':                              'Spider curl',
  'cable rope curl':                          'Uginanie ramion na wyciągu (lina)',
  'reverse curl':                             'Uginanie ramion odwróconym chwytem',

  // TRICEPS
  'dip':                                      'Dipy na poręczach',
  'tricep dip':                               'Dipy na triceps',
  'bench dip':                                'Dipy na ławce',
  'close grip bench press':                   'Wyciskanie wąskim chwytem (triceps)',
  'tricep pushdown':                          'Prostowanie ramion na wyciągu (pushdown)',
  'cable tricep pushdown':                    'Prostowanie ramion na wyciągu',
  'cable rope pushdown':                      'Prostowanie ramion na wyciągu (lina)',
  'skull crusher':                            'Łamacze czaszki',
  'barbell skull crusher':                    'Łamacze czaszki ze sztangą',
  'dumbbell skull crusher':                   'Łamacze czaszki z hantlami',
  'ez-bar skull crusher':                     'Łamacze czaszki łamaną sztangą',
  'overhead tricep extension':               'Prostowanie ramion nad głowę',
  'dumbbell overhead tricep extension':      'Prostowanie ramion nad głowę z hantlą',
  'cable overhead tricep extension':         'Prostowanie ramion nad głowę na wyciągu',
  'tricep kickback':                          'Odrzuty ramion (kickback)',
  'dumbbell kickback':                        'Odrzuty z hantlami',
  'cable kickback':                           'Odrzuty na wyciągu',
  'machine tricep press':                     'Prostowanie ramion na maszynie',

  // NOGI – UDA
  'barbell squat':                            'Przysiad ze sztangą',
  'squat':                                    'Przysiad',
  'front squat':                              'Przysiad przedni ze sztangą',
  'barbell front squat':                      'Przysiad przedni ze sztangą',
  'goblet squat':                             'Przysiad goblet (kettlebell/hantel)',
  'dumbbell squat':                           'Przysiad z hantlami',
  'smith machine squat':                      'Przysiad na suwnicy Smitha',
  'hack squat':                               'Przysiad hack',
  'machine hack squat':                       'Przysiad hack na maszynie',
  'leg press':                                'Prasa do nóg',
  'bulgarian split squat':                    'Przysiad bułgarski (split squat)',
  'dumbbell bulgarian split squat':          'Przysiad bułgarski z hantlami',
  'barbell lunge':                            'Wykrok ze sztangą',
  'dumbbell lunge':                           'Wykrok z hantlami',
  'walking lunge':                            'Wykroki chodzące',
  'reverse lunge':                            'Wykrok w tył',
  'dumbbell reverse lunge':                  'Wykrok w tył z hantlami',
  'leg curl':                                 'Uginanie nóg (leg curl)',
  'seated leg curl':                          'Uginanie nóg siedząc',
  'lying leg curl':                           'Uginanie nóg leżąc',
  'leg extension':                            'Prostowanie nóg (leg extension)',
  'hip thrust':                               'Hip thrust',
  'barbell hip thrust':                       'Hip thrust ze sztangą',
  'dumbbell hip thrust':                      'Hip thrust z hantlami',
  'glute bridge':                             'Mostek biodrowy',
  'barbell glute bridge':                     'Mostek biodrowy ze sztangą',
  'single leg glute bridge':                 'Mostek biodrowy jednonóż',
  'step-up':                                  'Wejście na step',
  'dumbbell step-up':                         'Wejście na step z hantlami',
  'barbell step-up':                          'Wejście na step ze sztangą',
  'sumo squat':                               'Przysiad sumo',
  'cable pull through':                       'Ściąganie linki przez nogi',
  'box squat':                                'Przysiad do skrzynki',
  'safety bar squat':                         'Przysiad na drążku safety bar',
  'rdl':                                      'Martwy ciąg rumuński',

  // NOGI – ŁYDKI
  'standing calf raise':                      'Wspięcia na palce stojąc',
  'seated calf raise':                        'Wspięcia na palce siedząc',
  'calf raise':                               'Wspięcia na palce',
  'donkey calf raise':                        'Wspięcia na palce (donkey)',
  'machine calf raise':                       'Wspięcia na palce na maszynie',
  'single leg calf raise':                    'Wspięcia na palce jednonóż',

  // BRZUCH
  'plank':                                    'Deska (plank)',
  'side plank':                               'Deska boczna',
  'crunch':                                   'Brzuszki',
  'bicycle crunch':                           'Brzuszki rowerowe',
  'cable crunch':                             'Brzuszki na wyciągu',
  'decline crunch':                           'Brzuszki na ławce ujemnej',
  'sit-up':                                   'Skłony',
  'decline sit-up':                           'Skłony na ławce ujemnej',
  'leg raise':                                'Unoszenie nóg',
  'hanging leg raise':                        'Unoszenie nóg w zwisie',
  'lying leg raise':                          'Unoszenie nóg leżąc',
  'russian twist':                            'Skręty rosyjskie',
  'ab wheel rollout':                         'Rollout kołkiem (ab wheel)',
  'hollow body hold':                         'Hollow body',
  'l-sit':                                    'L-sit',
  'dragon flag':                              'Dragon flag',
  'mountain climber':                         'Wspinaczka (mountain climber)',
  'v-up':                                     'V-up',
  'dead bug':                                 'Dead bug',
  'pallof press':                             'Pallof press',
  'cable woodchop':                           'Siekanie drewna na wyciągu',
  'toe touch':                                'Dotykanie palców stóp',
  'scissor kick':                             'Nożyczki',
  'flutter kick':                             'Fluttery (unoszenie nóg)',

  // PRZEDRAMIONA
  'wrist curl':                               'Uginanie nadgarstka (hantle)',
  'barbell wrist curl':                       'Uginanie nadgarstka ze sztangą',
  'reverse wrist curl':                       'Uginanie nadgarstka odwrotnie',
  'farmers walk':                             'Spacer farmera',
  "farmer's walk":                            'Spacer farmera',
  'dead hang':                                'Zwis na drążku (dead hang)',
  'plate pinch':                              'Ściskanie talerza',

  // SZYJA
  'neck curl':                                'Uginanie szyi',
  'neck extension':                           'Prostowanie szyi',
  'neck lateral flexion':                     'Skłon szyi w bok',

  // CARDIO / ZŁOŻONE
  'burpee':                                   'Burpee',
  'box jump':                                 'Skok na skrzynię',
  'jump squat':                               'Przysiad ze skokiem',
  'kettlebell swing':                         'Kettlebell swing',
  'kettlebell goblet squat':                  'Przysiad goblet z kettlebell',
  'clean and press':                          'Zarzut i wyciskanie',
  'thruster':                                 'Thruster (przysiad + wyciskanie)',
  'muscle-up':                                'Muscle-up',
  'handstand push-up':                        'Wyciskanie w staniu na rękach',
  'jump rope':                                'Skakanka',
  'rowing machine':                           'Wioślarz (maszyna)',
  'sled push':                                'Pchanie sanek',
  'battle rope':                              'Battle rope',
};

// ─── Automatyczne tłumaczenie słów kluczowych (fallback) ─────────────────────
const KW: [RegExp, string][] = [
  [/smith machine/gi,             'suwnica Smitha'],
  [/ez[- ]?bar/gi,                'łamana sztanga'],
  [/trap bar/gi,                  'trapezowa sztanga'],
  [/kettlebell/gi,                'kettlebell'],
  [/barbell/gi,                   'sztanga'],
  [/dumbbell(s)?/gi,              'hantle'],
  [/cable/gi,                     'wyciąg'],
  [/machine/gi,                   'maszyna'],
  [/bench press/gi,               'wyciskanie na ławce'],
  [/overhead press/gi,            'wyciskanie nad głowę'],
  [/shoulder press/gi,            'wyciskanie na barki'],
  [/leg press/gi,                 'prasa do nóg'],
  [/romanian deadlift/gi,         'martwy ciąg rumuński'],
  [/sumo deadlift/gi,             'martwy ciąg sumo'],
  [/deadlift/gi,                  'martwy ciąg'],
  [/bulgarian split squat/gi,     'przysiad bułgarski'],
  [/goblet squat/gi,              'przysiad goblet'],
  [/front squat/gi,               'przysiad przedni'],
  [/hack squat/gi,                'przysiad hack'],
  [/squat/gi,                     'przysiad'],
  [/hip thrust/gi,                'hip thrust'],
  [/glute bridge/gi,              'mostek biodrowy'],
  [/leg curl/gi,                  'uginanie nóg'],
  [/leg extension/gi,             'prostowanie nóg'],
  [/calf raise/gi,                'wspięcia na palce'],
  [/pull[- ]?down/gi,             'ściąganie drążka'],
  [/pull[- ]?up/gi,               'podciąganie'],
  [/chin[- ]?up/gi,               'podciąganie podchwytem'],
  [/lat pulldown/gi,              'ściąganie drążka'],
  [/face pull/gi,                 'ściąganie do twarzy'],
  [/upright row/gi,               'wiosłowanie pionowe'],
  [/skull crusher/gi,             'łamacze czaszki'],
  [/push[- ]?down/gi,             'prostowanie (pushdown)'],
  [/kickback/gi,                  'odrzut ramion'],
  [/hammer curl/gi,               'uginanie neutralne'],
  [/preacher curl/gi,             'uginanie Scotta'],
  [/concentration curl/gi,        'uginanie skupione'],
  [/bicep curl/gi,                'uginanie bicepsa'],
  [/curl/gi,                      'uginanie'],
  [/bench/gi,                     'ławka'],
  [/press/gi,                     'wyciskanie'],
  [/row/gi,                       'wiosłowanie'],
  [/raise/gi,                     'unoszenie'],
  [/extension/gi,                 'prostowanie'],
  [/flexion/gi,                   'uginanie'],
  [/fly|flies|flyes/gi,           'rozpiętki'],
  [/shrug/gi,                     'wznosy barków'],
  [/push[- ]?up/gi,               'pompki'],
  [/dip/gi,                       'dipy'],
  [/lunge/gi,                     'wykrok'],
  [/step[- ]?up/gi,               'wejście na step'],
  [/hyperextension/gi,            'hyperekstensja'],
  [/pullover/gi,                  'pullover'],
  [/good morning/gi,              'good morning'],
  [/russian twist/gi,             'skręty rosyjskie'],
  [/mountain climber/gi,          'wspinaczka'],
  [/plank/gi,                     'deska'],
  [/crunch/gi,                    'brzuszki'],
  [/sit[- ]?up/gi,                'skłony'],
  [/leg raise/gi,                 'unoszenie nóg'],
  [/dead hang/gi,                 'zwis na drążku'],
  [/farmers? walk/gi,             'spacer farmera'],
  [/burpee/gi,                    'burpee'],
  [/incline/gi,                   'skośna'],
  [/decline/gi,                   'ujemna'],
  [/flat/gi,                      'płaska'],
  [/seated/gi,                    'siedząc'],
  [/standing/gi,                  'stojąc'],
  [/lying/gi,                     'leżąc'],
  [/close grip/gi,                'wąski chwyt'],
  [/wide grip/gi,                 'szeroki chwyt'],
  [/reverse/gi,                   'odwrócony'],
  [/single[- ]?arm/gi,            'jednoręczne'],
  [/single[- ]?leg/gi,            'jednonóż'],
  [/lateral/gi,                   'boczne'],
  [/front/gi,                     'przednie'],
  [/overhead/gi,                  'nad głowę'],
];

function translateName(name: string): string {
  const lower = name.toLowerCase().trim();
  if (MANUAL[lower]) return MANUAL[lower];

  let t = name;
  for (const [re, pl] of KW) {
    t = t.replace(re, pl);
  }
  // Capitalize first letter
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ─── Pobieranie ćwiczeń per bodyPart (omija rate limit – tylko 10 requestów) ──
const BODY_PARTS = [
  'chest', 'back', 'shoulders', 'upper arms', 'lower arms',
  'upper legs', 'lower legs', 'waist', 'neck', 'cardio',
];

async function fetchAll(): Promise<any[]> {
  const all: any[] = [];

  for (const bp of BODY_PARTS) {
    const url = `${BASE}/api/v1/exercises?limit=25&bodyParts=${encodeURIComponent(bp)}`;
    process.stdout.write(`\r  Pobieram: ${bp.padEnd(20)} (łącznie: ${all.length})`);
    try {
      const res = await fetch(url);
      if (!res.ok) { console.log(`\n  Błąd ${res.status} dla ${bp}`); continue; }
      const json = await res.json();
      const data: any[] = Array.isArray(json) ? json : (json?.data ?? []);
      all.push(...data);
    } catch (e) {
      console.log(`\n  Wyjątek dla ${bp}:`, e);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n  Łącznie: ${all.length} ćwiczeń`);
  return all;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n=== RESET ĆWICZEŃ ===\n');

  // 1. Kasowanie starej bazy (kolejność ważna ze względu na FK)
  console.log('1. Kasuję historię treningów...');
  await prisma.workoutEntry.deleteMany();
  await prisma.workoutSession.deleteMany();
  console.log('   WorkoutEntry + WorkoutSession – gotowe');

  console.log('2. Kasuję ulubione...');
  await prisma.userFavorite.deleteMany();
  console.log('   UserFavorite – gotowe');

  console.log('3. Kasuję ćwiczenia...');
  await prisma.exercise.deleteMany();
  console.log('   Exercise – gotowe');

  // 2. Pobieranie z API
  console.log('\n4. Pobieram ćwiczenia z ExerciseDB...');
  const raw = await fetchAll();

  if (raw.length === 0) {
    console.error('BŁĄD: Nie pobrano żadnych ćwiczeń z API. Sprawdź połączenie.');
    return;
  }

  // 3. Grupowanie po body part (tylko do podsumowania)
  const byBodyPart: Record<string, any[]> = {};
  for (const ex of raw) {
    const bp: string = ex.bodyParts?.[0] ?? 'cardio';
    if (!byBodyPart[bp]) byBodyPart[bp] = [];
    byBodyPart[bp].push(ex);
  }

  const selected = raw;
  console.log(`\n5. Przygotowano ${selected.length} ćwiczeń\n`);

  // 4. Wstawianie do bazy
  console.log('6. Wstawiam do bazy...');
  let inserted = 0;
  let skipped = 0;

  for (const ex of selected) {
    const bp: string = ex.bodyParts?.[0] ?? 'cardio';
    const muscleGroup = BODY_PART_PL[bp] ?? 'Inne';
    const polishName = translateName(ex.name);

    // 3 próby: polska nazwa → + oryginał angielski → + unikalny exerciseId
    const namesToTry = [
      polishName,
      `${polishName} (${ex.name})`,
      `${polishName} [${ex.exerciseId}]`,   // exerciseId jest zawsze unikalny
    ];
    let ok = false;
    for (const candidateName of namesToTry) {
      try {
        await prisma.exercise.create({
          data: { name: candidateName, muscleGroup, exerciseDbId: ex.exerciseId },
        });
        inserted++;
        ok = true;
        break;
      } catch (e: any) {
        if (e.code !== 'P2002') { skipped++; ok = true; break; } // inny błąd – pomiń
      }
    }
    if (!ok) skipped++;
    process.stdout.write(`\r  Wstawiono: ${inserted}, pominięto: ${skipped}`);
  }

  console.log(`\n\nGOTOWE! Wstawiono ${inserted} ćwiczeń, pominięto ${skipped}.`);

  // Podsumowanie po grupach
  console.log('\nPodsumowanie po grupach:');
  for (const [bp, exs] of Object.entries(byBodyPart)) {
    const pl = BODY_PART_PL[bp] ?? bp;
    console.log(`  ${pl.padEnd(25)} ${exs.length}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
