/**
 * Serie ćwiczenia w jednej linii — wspólna prezentacja dla historii,
 * podsumowania treningu i karty ćwiczenia.
 *
 * Problem, który to rozwiązuje: zapis „8x40kg 8x44kg 10x52kg 3x56kg" wciśnięty
 * w prawą kolumnę obok nazwy ćwiczenia zlewał się w jeden ciąg, łamał w losowym
 * miejscu i nie dawało się odczytać, która seria jest która. Do tego „8x40"
 * czyta się dwuznacznie — jak 8 serii po 40, a nie 8 powtórzeń.
 *
 * Stąd: każda seria zaczyna się od NUMERU w kwadraciku, który działa jak
 * naturalny separator, więc oko samo dzieli linię na serie. Kilogramy podpisane
 * są raz — w tonażu przy nazwie ćwiczenia — żeby przy każdej liczbie nie
 * powtarzać tej samej jednostki.
 *
 * Trzymamy to w jednym komponencie, bo te same serie pokazujemy w trzech
 * miejscach — dwa razy w tym projekcie te widoki zdążyły się już rozjechać.
 */

export type SetLike = { reps: number; weight: number; isDrop?: boolean };

export type EntryLike = {
  sets: number;
  reps: number;
  weight: number;
  setsData?: unknown;
  durationSec?: number | null;
};

/** Serie wpisu: te rozpisane osobno, a jak ich nie ma — jedna zbiorcza. */
export function entrySets(entry: EntryLike): SetLike[] {
  const sd = Array.isArray(entry.setsData) ? (entry.setsData as SetLike[]) : [];
  return sd.filter((s) => s && typeof s.reps === 'number');
}

/**
 * Grupuje serie w łańcuchy dropsetu: seria z `isDrop` doklejana jest do
 * poprzedniej grupy (kontynuacja bez przerwy), zwykła seria zaczyna nową
 * grupę. Bez tego dropset — trzy wiersze zapisane jeden po drugim — wygląda
 * identycznie jak trzy osobne, odpoczęte serie.
 */
export function groupSets(sets: SetLike[]): SetLike[][] {
  const groups: SetLike[][] = [];
  for (const s of sets) {
    if (s.isDrop && groups.length > 0) groups[groups.length - 1].push(s);
    else groups.push([s]);
  }
  return groups;
}

/** Objętość (tonaż) wpisu w kilogramach. Ćwiczenia na czas jej nie mają. */
export function entryVolume(entry: EntryLike): number {
  if (entry.durationSec && entry.durationSec > 0) return 0;
  const sd = entrySets(entry);
  if (sd.length > 0) return sd.reduce((s, x) => s + x.reps * (x.weight || 0), 0);
  return entry.sets * entry.reps * (entry.weight || 0);
}

/**
 * Liczba serii wpisu (czasowe nie są seriami). Dropset — kilka wierszy
 * zrobionych bez przerwy — liczy się jako jedna seria, tak jak liczy go
 * każdy trenujący, a nie jako tyle wierszy ile miał dropów.
 */
export function entrySetCount(entry: EntryLike): number {
  if (entry.durationSec && entry.durationSec > 0) return 0;
  const sd = entrySets(entry);
  return sd.length > 0 ? groupSets(sd).length : entry.sets;
}

/** Numer serii. Kwadracik, bo sam odgradza serie od siebie — bez niego
 *  „8 × 40 6 × 32" zlewa się w jeden ciąg cyfr. */
function SetIndex({ n }: { n: number }) {
  return (
    <span className="inline-flex h-[17px] min-w-[17px] items-center justify-center rounded bg-gray-200 px-1 text-[10px] font-bold leading-none text-gray-500 tabular-nums">
      {n}
    </span>
  );
}

export function SetChips({ entry }: { entry: EntryLike }) {
  // Ćwiczenie mierzone czasem — serie i ciężar nic tu nie znaczą.
  if (entry.durationSec && entry.durationSec > 0) {
    return (
      <p className="text-[13px] font-semibold text-gray-900 tabular-nums">
        {Math.round(entry.durationSec / 60)} min
      </p>
    );
  }

  const sets = entrySets(entry);

  if (sets.length > 0) {
    const groups = groupSets(sets);
    return (
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] tabular-nums">
        {groups.map((g, i) => (
          <span key={i} className="inline-flex items-center gap-1 whitespace-nowrap">
            <SetIndex n={i + 1} />
            {g.map((s, j) => (
              <span key={j} className="inline-flex items-center gap-1">
                {/* Strzałka zamiast przecinka/kropki — pokazuje, że to spadek
                    ciężaru w tej samej serii, a nie kolejna, osobna seria. */}
                {j > 0 && <span className="text-orange-400">→</span>}
                {s.weight > 0 ? (
                  <span className="text-gray-500">
                    {s.reps} × <span className="font-semibold text-gray-900">{s.weight}</span>
                  </span>
                ) : (
                  <span className="text-gray-500">
                    <span className="font-semibold text-gray-900">{s.reps}</span> powt.
                  </span>
                )}
              </span>
            ))}
          </span>
        ))}
      </div>
    );
  }

  // Wpis bez rozpisanych serii: wszystkie takie same, więc jedno zdanie
  // zamiast numerowania pięciu identycznych pozycji.
  return (
    <p className="text-[13px] text-gray-500 tabular-nums">
      {entry.sets} {entry.sets === 1 ? 'seria' : entry.sets < 5 ? 'serie' : 'serii'} po{' '}
      {entry.weight > 0 ? (
        <>
          {entry.reps} × <span className="font-semibold text-gray-900">{entry.weight} kg</span>
        </>
      ) : (
        <>
          <span className="font-semibold text-gray-900">{entry.reps}</span> powt.
        </>
      )}
    </p>
  );
}

/**
 * Podpis po prawej stronie nazwy ćwiczenia.
 *
 * Wcześniej stało tam „5 × 1 552 kg" i słusznie się to nie czytało: znak ×
 * między dwiema liczbami wygląda na mnożenie, a to były dwie niezależne
 * wielkości — liczba serii i tonaż. Liczbę serii i tak widać po numerach
 * pod spodem, więc zostaje sam tonaż, opisany słowem.
 *
 * To także jedyne miejsce, gdzie pada „kg" — przy samych seriach jednostka
 * jest już wtedy oczywista i nie zaśmieca liczb.
 */
export function EntryMeta({
  entry,
  className = 'text-[11px] text-gray-400 shrink-0 whitespace-nowrap',
}: {
  entry: EntryLike & { rpe?: number | null };
  className?: string;
}) {
  const volume = entryVolume(entry);
  const parts: string[] = [];
  if (volume > 0) parts.push(`razem ${Math.round(volume).toLocaleString('pl-PL')} kg`);
  if (entry.rpe) parts.push(`RPE ${entry.rpe}`);
  if (parts.length === 0) return null;
  return <span className={className}>{parts.join(' · ')}</span>;
}
