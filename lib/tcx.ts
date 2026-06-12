// Parser plików TCX z zegarka (Zepp/Amazfit, Garmin itp.) — działa w przeglądarce.
// Wyciąga podsumowanie: czas trwania, kcal, tętno śr./maks., datę startu.

export interface TcxSummary {
  sport: string;          // "Other" (siłowy), "Running", "Biking"...
  startTime: string;      // ISO
  durationSec: number;
  kcal: number;
  avgHr: number | null;
  maxHr: number | null;
  distanceKm: number;     // 0 dla treningu siłowego
}

export function parseTcx(xmlText: string): TcxSummary | null {
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    if (doc.querySelector('parsererror')) return null;
    const activity = doc.querySelector('Activity');
    if (!activity) return null;

    const laps = [...activity.querySelectorAll('Lap')];
    if (laps.length === 0) return null;

    let durationSec = 0;
    let kcal = 0;
    let distanceM = 0;
    let maxHr: number | null = null;
    let hrWeighted = 0;
    let hrTime = 0;

    for (const lap of laps) {
      const t = parseFloat(lap.querySelector('TotalTimeSeconds')?.textContent || '0');
      durationSec += t;
      kcal += parseFloat(lap.querySelector('Calories')?.textContent || '0');
      distanceM += parseFloat(lap.querySelector('DistanceMeters')?.textContent || '0');
      const avg = parseFloat(lap.querySelector('AverageHeartRateBpm > Value')?.textContent || '0');
      if (avg > 0 && t > 0) { hrWeighted += avg * t; hrTime += t; }
      const max = parseFloat(lap.querySelector('MaximumHeartRateBpm > Value')?.textContent || '0');
      if (max > 0) maxHr = Math.max(maxHr ?? 0, max);
    }

    return {
      sport: activity.getAttribute('Sport') || 'Other',
      startTime: activity.querySelector('Id')?.textContent?.trim()
        || laps[0].getAttribute('StartTime') || '',
      durationSec: Math.round(durationSec),
      kcal: Math.round(kcal),
      avgHr: hrTime > 0 ? Math.round(hrWeighted / hrTime) : null,
      maxHr,
      distanceKm: Math.round(distanceM / 10) / 100,
    };
  } catch {
    return null;
  }
}
