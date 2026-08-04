// Wyliczanie dziennego zapotrzebowania kalorycznego.
//
// Wzór Mifflin-St Jeor (1990) — standard kliniczny, ten sam, którego używa
// Fitatu i większość aplikacji dietetycznych. Dokładniejszy niż starszy
// Harris-Benedict, zwłaszcza przy nadwadze.
//
// To nadal jest szacunek: realne zapotrzebowanie potrafi się różnić o ±10%.
// Właściwa kalibracja to obserwacja wagi przez 2-3 tygodnie i korekta.

export type Sex = 'M' | 'K';
export type ActivityLevel = 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'HIGH' | 'ATHLETE';
export type GoalType = 'LOSE' | 'MAINTAIN' | 'GAIN';

export const ACTIVITY_LEVELS: { value: ActivityLevel; label: string; hint: string; factor: number }[] = [
  { value: 'SEDENTARY', label: 'Siedzący',      hint: 'praca biurowa, brak treningów',        factor: 1.2 },
  { value: 'LIGHT',     label: 'Lekko aktywny', hint: 'trening 1-2× w tygodniu',              factor: 1.375 },
  { value: 'MODERATE',  label: 'Umiarkowany',   hint: 'trening 3-4× w tygodniu',              factor: 1.55 },
  { value: 'HIGH',      label: 'Wysoki',        hint: 'trening 5-6× w tygodniu',              factor: 1.725 },
  { value: 'ATHLETE',   label: 'Bardzo wysoki', hint: 'codziennie, praca fizyczna',           factor: 1.9 },
];

export const GOAL_TYPES: { value: GoalType; label: string; hint: string; modifier: number }[] = [
  { value: 'LOSE',     label: 'Redukcja',    hint: '−20% — ok. 0,5 kg tygodniowo', modifier: 0.8 },
  { value: 'MAINTAIN', label: 'Utrzymanie',  hint: 'waga bez zmian',               modifier: 1.0 },
  { value: 'GAIN',     label: 'Masa',        hint: '+10% — powolny przyrost',      modifier: 1.1 },
];

export function activityFactor(level: string): number {
  return ACTIVITY_LEVELS.find((a) => a.value === level)?.factor ?? 1.55;
}

export function goalModifier(goal: string): number {
  return GOAL_TYPES.find((g) => g.value === goal)?.modifier ?? 1.0;
}

/** Podstawowa przemiana materii (kcal/dobę) wg Mifflin-St Jeor. */
export function bmr(weightKg: number, heightCm: number, age: number, sex: Sex): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(base + (sex === 'M' ? 5 : -161));
}

export type ProfileInput = {
  heightCm?: number | null;
  birthYear?: number | null;
  sex?: string | null;
  activityLevel: string;
  goalType: string;
  customKcal?: number | null;
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
};

export type Targets = {
  kcal: number;
  protein: number;   // gramy
  carbs: number;
  fat: number;
  bmr: number | null;
  tdee: number | null;
  estimated: boolean;      // true = wyliczone ze wzoru, false = wpisane ręcznie
  missingProfile: boolean; // brakuje wzrostu / roku urodzenia / płci → użyto wartości domyślnej
};

const FALLBACK_KCAL = 2200; // gdy nie da się nic policzyć

/**
 * Zwraca cel dzienny. Kolejność decyzji:
 *   1. ręcznie wpisana wartość (customKcal) wygrywa zawsze,
 *   2. wyliczenie Mifflin-St Jeor × aktywność × cel,
 *   3. wartość awaryjna, jeśli brakuje danych profilu.
 *
 * @param weightKg najświeższa waga z BodyWeight (null = brak pomiarów)
 * @param today    data odniesienia do policzenia wieku — przekazywana z zewnątrz,
 *                 żeby funkcja pozostała czysta i przewidywalna w testach
 */
export function computeTargets(p: ProfileInput, weightKg: number | null, today: Date): Targets {
  const age = p.birthYear ? today.getFullYear() - p.birthYear : null;
  const canCompute = Boolean(weightKg && p.heightCm && age && age > 0 && age < 120 && p.sex);

  let base: number | null = null;
  let tdee: number | null = null;

  if (canCompute) {
    base = bmr(weightKg!, p.heightCm!, age!, p.sex === 'M' ? 'M' : 'K');
    tdee = Math.round(base * activityFactor(p.activityLevel));
  }

  const computed = tdee !== null ? Math.round(tdee * goalModifier(p.goalType)) : null;
  const kcal = p.customKcal && p.customKcal > 0 ? p.customKcal : computed ?? FALLBACK_KCAL;

  // Suma procentów bywa != 100 po ręcznej edycji — normalizujemy, żeby gramy
  // makro zawsze sumowały się do celu kalorycznego.
  const sum = Math.max(1, p.proteinPct + p.carbsPct + p.fatPct);
  const pPct = p.proteinPct / sum;
  const cPct = p.carbsPct / sum;
  const fPct = p.fatPct / sum;

  return {
    kcal,
    protein: Math.round((kcal * pPct) / 4), // 1 g białka = 4 kcal
    carbs: Math.round((kcal * cPct) / 4),   // 1 g węglowodanów = 4 kcal
    fat: Math.round((kcal * fPct) / 9),     // 1 g tłuszczu = 9 kcal
    bmr: base,
    tdee,
    estimated: !(p.customKcal && p.customKcal > 0),
    missingProfile: !canCompute,
  };
}

export const MEALS = [
  { key: 'SNIADANIE', label: 'Śniadanie' },
  { key: 'OBIAD', label: 'Obiad' },
  { key: 'KOLACJA', label: 'Kolacja' },
  { key: 'PRZEKASKA', label: 'Przekąski' },
] as const;

export type MealKey = (typeof MEALS)[number]['key'];

export function isMealKey(v: unknown): v is MealKey {
  return typeof v === 'string' && MEALS.some((m) => m.key === v);
}
