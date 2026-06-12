// Strefy tętna — liczone z serii 30-sekundowych kubełków (hrSeries z TCX).
// HRmax: najwyższe zarejestrowane tętno sesji z bezpiecznym minimum 185
// (brak danych o wieku użytkowników — to rozsądne przybliżenie).

import { HR_BUCKET_SEC } from '@/lib/tcx';

export interface HrZone {
  name: string;
  label: string;
  color: string;     // klasa tailwind tła
  minPct: number;    // % HRmax
  seconds: number;
}

const ZONE_DEFS: Omit<HrZone, 'seconds'>[] = [
  { name: 'Z1', label: 'rozgrzewka', color: 'bg-gray-300',   minPct: 0 },
  { name: 'Z2', label: 'spalanie',   color: 'bg-blue-400',   minPct: 60 },
  { name: 'Z3', label: 'cardio',     color: 'bg-green-500',  minPct: 70 },
  { name: 'Z4', label: 'próg',       color: 'bg-orange-400', minPct: 80 },
  { name: 'Z5', label: 'maks',       color: 'bg-red-500',    minPct: 90 },
];

export function estimateHrMax(sessionMaxHr: number | null | undefined): number {
  return Math.max(sessionMaxHr || 0, 185);
}

export function computeHrZones(hrSeries: number[], hrMax: number): HrZone[] {
  const zones = ZONE_DEFS.map(z => ({ ...z, seconds: 0 }));
  for (const hr of hrSeries) {
    if (hr <= 0) continue;
    const pct = (hr / hrMax) * 100;
    let idx = 0;
    for (let i = ZONE_DEFS.length - 1; i >= 0; i--) {
      if (pct >= ZONE_DEFS[i].minPct) { idx = i; break; }
    }
    zones[idx].seconds += HR_BUCKET_SEC;
  }
  return zones;
}

export function formatZoneTime(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m < 1 ? '<1 min' : `${m} min`;
}
