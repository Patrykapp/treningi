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

// Łączna liczba serii w sesji (setsData ma pierwszeństwo nad polem sets)
export function countSets(entries: { sets: number; setsData?: unknown }[]): number {
  return entries.reduce((sum, e) => {
    const sd = Array.isArray(e.setsData) ? e.setsData.length : 0;
    return sum + (sd > 0 ? sd : e.sets);
  }, 0);
}

// Najświeższa waga ciała z listy pomiarów (posortowanej malejąco po dacie); fallback 75 kg
export const DEFAULT_WEIGHT_KG = 75;
export function latestWeight(weights: { weight: number }[] | undefined | null): number {
  return weights && weights.length > 0 ? weights[0].weight : DEFAULT_WEIGHT_KG;
}
