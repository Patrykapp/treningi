// Wspólna logika modułu Cele — używana przez /api/goals.

export type GoalDirection = 'increase' | 'decrease';

// Te same klucze/etykiety co w module Pomiary ciała (app/pomiary/page.tsx).
export const MEASUREMENT_FIELDS: { key: string; label: string }[] = [
  { key: 'waist', label: 'Talia' },
  { key: 'chest', label: 'Klatka' },
  { key: 'biceps', label: 'Biceps' },
  { key: 'thigh', label: 'Udo' },
  { key: 'hips', label: 'Biodra' },
  { key: 'calf', label: 'Łydka' },
  { key: 'forearm', label: 'Przedramię' },
];

// Szacowane 1RM — ta sama logika co w /api/exercises/[id]/progress (reps=1 => sama waga,
// bo wzór Epleya dla 1 powtórzenia zawyżałby wynik).
export function estimate1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

// Kierunek celu wnioskowany z wartości docelowej vs punkt startowy — unika
// dodatkowego pola w formularzu (np. "schudnij do 80kg" gdy waga startowa to 85kg).
export function inferDirection(target: number, start: number): GoalDirection {
  return target < start ? 'decrease' : 'increase';
}

export interface GoalProgress {
  pct: number; // 0-100
  achieved: boolean;
}

// current === null → brak jeszcze żadnych danych (np. nie wpisano wagi) — 0% postępu.
// start === null → jest już wynik bieżący, ale nie było punktu odniesienia w momencie
// tworzenia celu (np. cel dodany zanim zaczęto mierzyć) — liczy się tylko czy osiągnięty.
export function goalProgress(direction: GoalDirection, start: number | null, target: number, current: number | null): GoalProgress {
  if (current === null) return { pct: 0, achieved: false };
  const achieved = direction === 'decrease' ? current <= target : current >= target;
  if (start === null) return { pct: achieved ? 100 : 0, achieved };
  if (direction === 'decrease') {
    if (start <= target) return { pct: achieved ? 100 : 0, achieved };
    const pct = ((start - current) / (start - target)) * 100;
    return { pct: Math.min(100, Math.max(0, Math.round(pct))), achieved };
  }
  if (start >= target) return { pct: achieved ? 100 : 0, achieved };
  const pct = ((current - start) / (target - start)) * 100;
  return { pct: Math.min(100, Math.max(0, Math.round(pct))), achieved };
}

// Tempo biegu w sek/km -> "5'12"/km"
export function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}'${String(s).padStart(2, '0')}"/km`;
}
