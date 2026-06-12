// Parser plików TCX z zegarka (Zepp/Amazfit, Garmin itp.) — działa w przeglądarce.
// Wyciąga podsumowanie (czas, kcal, tętno śr./maks.) oraz przebieg tętna
// uśredniony w kubełkach 30-sekundowych (kompaktowy zapis w bazie).

export const HR_BUCKET_SEC = 30;

export interface TcxSummary {
  sport: string;          // "Other" (siłowy), "Running", "Biking"...
  startTime: string;      // ISO
  durationSec: number;
  kcal: number;
  avgHr: number | null;
  maxHr: number | null;
  distanceKm: number;     // 0 dla treningu siłowego
  hrSeries: number[];     // śr. tętno per 30 s (0 = brak próbek w kubełku)
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

    // Przebieg tętna z trackpointów → kubełki 30 s
    const points = [...activity.querySelectorAll('Trackpoint')];
    const hrSeries: number[] = [];
    if (points.length > 0) {
      const firstTime = Date.parse(points[0].querySelector('Time')?.textContent || '');
      if (!isNaN(firstTime)) {
        const sums: Record<number, { sum: number; n: number }> = {};
        let lastBucket = 0;
        for (const p of points) {
          const hr = parseFloat(p.querySelector('HeartRateBpm > Value')?.textContent || '0');
          if (hr <= 0) continue;
          const t = Date.parse(p.querySelector('Time')?.textContent || '');
          if (isNaN(t)) continue;
          const bucket = Math.floor((t - firstTime) / 1000 / HR_BUCKET_SEC);
          if (bucket < 0) continue;
          if (!sums[bucket]) sums[bucket] = { sum: 0, n: 0 };
          sums[bucket].sum += hr;
          sums[bucket].n++;
          lastBucket = Math.max(lastBucket, bucket);
        }
        for (let b = 0; b <= lastBucket; b++) {
          hrSeries.push(sums[b] ? Math.round(sums[b].sum / sums[b].n) : 0);
        }
      }
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
      hrSeries,
    };
  } catch {
    return null;
  }
}
