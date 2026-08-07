// Szacowanie spalonych kalorii.
// To przybliżenia (zależą od intensywności i metabolizmu) — traktować orientacyjnie.

// Bieg: klasyczny wzór ~1.036 kcal na kg masy ciała na km
export function runCalories(weightKg: number, distanceKm: number): number {
  if (!weightKg || !distanceKm) return 0;
  return Math.round(1.036 * weightKg * distanceKm);
}

// Siłownia: MET ≈ 5 (trening z obciążeniem, umiarkowanie intensywny),
// czas szacowany z liczby serii (~3 min na serię z przerwą).
// kcal = MET × kg × godziny → 5 × kg × (serie × 3 / 60) = 0.25 × kg × serie
export function strengthCalories(weightKg: number, totalSets: number): number {
  if (!weightKg || !totalSets) return 0;
  return Math.round(0.25 * weightKg * totalSets);
}

/**
 * Cardio mierzone czasem — MET × masa ciała × godziny.
 *
 * Wartości MET z Compendium of Physical Activities, zaokrąglone. Dobieramy je
 * po nazwie ćwiczenia, bo to jedyna informacja, jaką mamy: intensywności nikt
 * nie wpisuje. Stąd domyślne 6 dla nierozpoznanego cardio — to średnie tempo
 * czegoś, przy czym da się jeszcze rozmawiać.
 *
 * Liczenie takiego ćwiczenia wzorem na serie dawało ~20 kcal za dwadzieścia
 * minut na schodach, czyli ponad dziesięciokrotne zaniżenie.
 */
/**
 * Które ćwiczenia domyślnie mierzy się czasem.
 *
 * Rozstrzyga NAZWA, nie grupa mięśniowa: w katalogu jako „Cardio" oznaczone są
 * i bieżnia, i burpee, a burpee robi się na powtórzenia. To tylko wartość
 * początkowa przełącznika — ostatnie słowo ma użytkownik.
 */
export const TIMED_EXERCISE =
  /bie[żz]ni|stepmill|schodow|orbitrek|elliptical|eliptyczn|rower stacjonarn|ergometr|wios[łl]owanie|skakank|spinning|st[ae]pper/i;

export function isTimedExerciseName(name: string | null | undefined): boolean {
  return Boolean(name && TIMED_EXERCISE.test(name));
}

const CARDIO_MET: [RegExp, number][] = [
  [/skakank/i, 11],
  [/stepmill|schodow|schody/i, 9],
  [/bie[żz]ni|bieg|trucht/i, 8],
  [/wios[łl]owanie|ergometr/i, 7],
  [/rower|spinning/i, 7],
  [/orbitrek|elliptical|eliptyczn/i, 5],
  [/marsz|ch[óo]d|spacer/i, 4],
];

export const DEFAULT_CARDIO_MET = 6;

export function cardioMet(exerciseName: string | null | undefined): number {
  if (!exerciseName) return DEFAULT_CARDIO_MET;
  return CARDIO_MET.find(([re]) => re.test(exerciseName))?.[1] ?? DEFAULT_CARDIO_MET;
}

export function cardioCalories(weightKg: number, durationSec: number, exerciseName?: string | null): number {
  if (!weightKg || !durationSec || durationSec <= 0) return 0;
  return Math.round(cardioMet(exerciseName) * weightKg * (durationSec / 3600));
}

// Łączna liczba serii w sesji (setsData ma pierwszeństwo nad polem sets).
// Wpisy mierzone czasem są pomijane — mają własny wzór i policzone tu byłyby
// drugi raz, w dodatku źle.
export function countSets(entries: { sets: number; setsData?: unknown; durationSec?: number | null }[]): number {
  return entries.reduce((sum, e) => {
    if (e.durationSec && e.durationSec > 0) return sum;
    const sd = Array.isArray(e.setsData) ? e.setsData.length : 0;
    return sum + (sd > 0 ? sd : e.sets);
  }, 0);
}

// Najświeższa waga ciała z listy pomiarów (posortowanej malejąco po dacie); fallback 75 kg
export const DEFAULT_WEIGHT_KG = 75;
export function latestWeight(weights: { weight: number }[] | undefined | null): number {
  return weights && weights.length > 0 ? weights[0].weight : DEFAULT_WEIGHT_KG;
}

type SessionEntry = {
  sets: number;
  setsData?: unknown;
  durationSec?: number | null;
  exercise?: { name?: string | null } | null;
};

// Kcal sesji siłowej: prawdziwe z zegarka, jeśli są — inaczej szacunek.
// Szacunek to suma dwóch części: siłowej (z liczby serii) i cardio (z czasu),
// bo jedna sesja potrafi zawierać oba rodzaje pracy.
// estimated=true → w UI pokazujemy "~"
export function sessionCalories(
  session: { kcal?: number | null; entries?: SessionEntry[] },
  weightKg: number
): { kcal: number; estimated: boolean } {
  if (session.kcal && session.kcal > 0) return { kcal: session.kcal, estimated: false };
  const entries = session.entries || [];
  const cardio = entries.reduce(
    (sum, e) => sum + cardioCalories(weightKg, e.durationSec ?? 0, e.exercise?.name),
    0
  );
  return { kcal: strengthCalories(weightKg, countSets(entries)) + cardio, estimated: true };
}
