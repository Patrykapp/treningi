'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Maximize2, X } from 'lucide-react';

interface Props {
  userId?: string;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function weekStart(d: Date): Date {
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  dd.setDate(dd.getDate() - ((dd.getDay() + 6) % 7));
  return dd;
}

// Skala niebieska (marka apki), zamiast zielonej — lepszy kontrast na białej
// karcie i konsekwentna z resztą UI.
function cellColor(count: number): string {
  if (count === 0) return 'bg-gray-100';
  if (count === 1) return 'bg-blue-200';
  if (count === 2) return 'bg-blue-400';
  return 'bg-blue-600';
}

const MONTHS_PL = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function HeatmapGrid({
  weeks, counts, today, cellSize, gap, dayLabelWidth, fontSize, selected, onSelectDay,
}: {
  weeks: Date[][];
  counts: Record<string, number>;
  today: Date;
  cellSize: number;
  gap: number;
  dayLabelWidth: number;
  fontSize: number;
  selected: string | null;
  onSelectDay: (dateStr: string, count: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const DAY_LABELS = ['Pn', '', 'Śr', '', 'Pt', '', 'Nd'];
  const todayStr = toDateStr(today);

  const monthLabels: { label: string; col: number }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const m = week[0].getMonth();
    if (m !== lastMonth) { monthLabels.push({ label: MONTHS_PL[m], col: wi }); lastMonth = m; }
  });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, []);

  const colWidth = cellSize + gap;

  return (
    <div ref={scrollRef} className="overflow-x-auto">
      <div className="inline-flex flex-col">
        {/* Month labels — pozycjonowane bezwzględnie nad kolumną tygodnia,
            w której zaczyna się dany miesiąc (naprawia przesunięcie nagłówków). */}
        <div className="relative mb-1" style={{ height: Math.ceil(fontSize * 1.4) }}>
          {monthLabels.map((m, i) => (
            <div
              key={i}
              className="absolute top-0 text-gray-400 whitespace-nowrap"
              style={{ left: `${dayLabelWidth + 4 + m.col * colWidth}px`, fontSize }}
            >
              {m.label}
            </div>
          ))}
        </div>

        <div className="flex">
          {/* Day labels */}
          <div className="flex flex-col mr-1 shrink-0 text-right text-gray-400" style={{ gap, width: dayLabelWidth }}>
            {DAY_LABELS.map((d, i) => (
              <div key={i} className="flex items-center justify-end pr-1" style={{ height: cellSize, fontSize }}>
                {d}
              </div>
            ))}
          </div>

          {/* Weeks */}
          <div className="flex" style={{ gap }}>
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col" style={{ gap }}>
                {week.map((day, di) => {
                  const key = toDateStr(day);
                  const count = counts[key] || 0;
                  const isFuture = day > today;
                  const isToday = key === todayStr;
                  const isSelected = key === selected;
                  return (
                    <button
                      key={di}
                      type="button"
                      disabled={isFuture}
                      onClick={() => onSelectDay(key, count)}
                      title={isFuture ? '' : `${key}: ${count} ${count === 1 ? 'trening' : 'treningów'}`}
                      className={`rounded-sm transition-transform ${isFuture ? 'opacity-0 pointer-events-none' : cellColor(count)} ${
                        isSelected ? 'ring-2 ring-offset-1 ring-blue-600' : isToday ? 'ring-1 ring-offset-1 ring-gray-400' : ''
                      } ${!isFuture ? 'hover:scale-125 active:scale-95' : ''}`}
                      style={{ width: cellSize, height: cellSize }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ActivityHeatmap({ userId }: Props) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [selected, setSelected] = useState<{ date: string; count: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const from = new Date();
    from.setFullYear(from.getFullYear() - 1);
    const params = new URLSearchParams({ from: toDateStr(from), limit: '400' });
    if (userId) params.set('userId', userId);
    fetch(`/api/sessions?${params}`)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return;
        const map: Record<string, number> = {};
        for (const s of data) {
          const d = (s.date as string).slice(0, 10);
          map[d] = (map[d] || 0) + 1;
        }
        setCounts(map);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [userId]);

  // Build 52-week grid — start from Monday 51 weeks before current week
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const gridStart = weekStart(today);
  gridStart.setDate(gridStart.getDate() - 51 * 7);

  const weeks: Date[][] = [];
  for (let w = 0; w < 52; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + w * 7 + d);
      week.push(day);
    }
    weeks.push(week);
  }

  const closeOnEsc = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setFullscreen(false);
  }, []);

  useEffect(() => {
    if (fullscreen) document.addEventListener('keydown', closeOnEsc);
    else document.removeEventListener('keydown', closeOnEsc);
    return () => document.removeEventListener('keydown', closeOnEsc);
  }, [fullscreen, closeOnEsc]);

  useEffect(() => {
    if (loaded && scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [loaded]);

  if (!loaded) return null;

  const totalSessions = Object.values(counts).reduce((s, v) => s + v, 0);
  const activeDays = Object.keys(counts).length;
  if (totalSessions === 0) return null;

  const selectDay = (date: string, count: number) => {
    setSelected(prev => (prev?.date === date ? null : { date, count }));
  };

  const legend = (cellSize: number) => (
    <div className="flex items-center gap-1 mt-3 justify-end">
      <span className="text-gray-400" style={{ fontSize: 10 }}>Mniej</span>
      {(['bg-gray-100', 'bg-blue-200', 'bg-blue-400', 'bg-blue-600'] as const).map((c, i) => (
        <div key={i} className={`rounded-sm ${c}`} style={{ width: cellSize, height: cellSize }} />
      ))}
      <span className="text-gray-400" style={{ fontSize: 10 }}>Więcej</span>
    </div>
  );

  // Pasek z informacją o zaznaczonym dniu — działa też na dotyk (title
  // z hoverem nic nie daje na telefonie, więc tap na komórkę pokazuje to tutaj).
  const selectedInfo = selected && (
    <div className="mt-2 flex items-center justify-between bg-blue-50 rounded-xl px-3 py-2 text-sm">
      <span className="font-medium text-blue-900 capitalize">{formatDayLabel(selected.date)}</span>
      <span className="text-blue-700 font-semibold">
        {selected.count} {selected.count === 1 ? 'trening' : 'treningów'}
      </span>
    </div>
  );

  return (
    <>
      {/* Karta w dashboardzie */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-700">Aktywność — ostatni rok</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {totalSessions} treningów · {activeDays} {activeDays === 1 ? 'dzień' : 'dni'}
            </span>
            <button
              onClick={() => setFullscreen(true)}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              title="Pełny ekran"
              aria-label="Pełny ekran"
            >
              <Maximize2 className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
        </div>

        <HeatmapGrid
          weeks={weeks} counts={counts} today={today}
          cellSize={11} gap={2.5} dayLabelWidth={18} fontSize={10}
          selected={selected?.date ?? null} onSelectDay={selectDay}
        />
        {legend(11)}
        {selectedInfo}
      </div>

      {/* Fullscreen modal */}
      {fullscreen && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-white"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 bg-white sticky top-0">
            <div>
              <h2 className="text-base font-bold text-gray-900">Aktywność — ostatni rok</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {totalSessions} treningów · {activeDays} {activeDays === 1 ? 'aktywny dzień' : 'aktywne dni'}
              </p>
            </div>
            <button
              onClick={() => setFullscreen(false)}
              className="text-gray-500 hover:text-gray-900 w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              aria-label="Zamknij"
            >
              <X className="w-5 h-5" strokeWidth={2} />
            </button>
          </div>

          {/* Grid — większe komórki, wygodniejsze do dotyku */}
          <div className="flex-1 overflow-auto px-4 py-4">
            <HeatmapGrid
              weeks={weeks} counts={counts} today={today}
              cellSize={18} gap={3.5} dayLabelWidth={24} fontSize={11}
              selected={selected?.date ?? null} onSelectDay={selectDay}
            />
            {legend(16)}
            {selectedInfo}
          </div>
        </div>
      )}
    </>
  );
}
