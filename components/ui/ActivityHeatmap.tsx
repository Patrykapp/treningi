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

function cellColor(count: number): string {
  if (count === 0) return 'bg-gray-100';
  if (count === 1) return 'bg-green-200';
  if (count === 2) return 'bg-green-400';
  return 'bg-green-600';
}

const MONTHS_PL = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

function HeatmapGrid({
  weeks, counts, today, cellSize, gap, dayLabelWidth, fontSize,
}: {
  weeks: Date[][];
  counts: Record<string, number>;
  today: Date;
  cellSize: number;
  gap: number;
  dayLabelWidth: number;
  fontSize: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const MONTHS_PL = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
  const DAY_LABELS = ['Pn', '', 'Śr', '', 'Pt', '', 'Nd'];

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
        {/* Month labels */}
        <div className="flex mb-1" style={{ paddingLeft: `${dayLabelWidth + 4}px` }}>
          {monthLabels.map((m, i) => {
            const prevCol = i > 0 ? monthLabels[i - 1].col : 0;
            const cols = i === 0 ? m.col : m.col - prevCol;
            return (
              <div key={i} className="shrink-0 text-gray-400" style={{ width: `${cols * colWidth}px`, fontSize }}>
                {m.label}
              </div>
            );
          })}
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
                  return (
                    <div
                      key={di}
                      title={isFuture ? '' : `${key}: ${count} ${count === 1 ? 'trening' : 'treningów'}`}
                      className={`rounded-sm ${isFuture ? 'opacity-0' : cellColor(count)}`}
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

  // Month label positions — show label on the first week of each new month
  const monthLabels: { label: string; col: number }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const m = week[0].getMonth();
    if (m !== lastMonth) {
      monthLabels.push({ label: MONTHS_PL[m], col: wi });
      lastMonth = m;
    }
  });

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

  // Day labels (Mon, Wed, Fri)
  const DAY_LABELS = ['Pn', '', 'Śr', '', 'Pt', '', 'Nd'];

  const legend = (cellSize: number) => (
    <div className="flex items-center gap-1 mt-3 justify-end">
      <span className="text-gray-400" style={{ fontSize: 10 }}>Mniej</span>
      {(['bg-gray-100', 'bg-green-200', 'bg-green-400', 'bg-green-600'] as const).map((c, i) => (
        <div key={i} className={`rounded-sm ${c}`} style={{ width: cellSize, height: cellSize }} />
      ))}
      <span className="text-gray-400" style={{ fontSize: 10 }}>Więcej</span>
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
          cellSize={9} gap={2} dayLabelWidth={16} fontSize={9}
        />
        {legend(9)}
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

          {/* Grid — większe komórki */}
          <div className="flex-1 overflow-auto px-4 py-4">
            <HeatmapGrid
              weeks={weeks} counts={counts} today={today}
              cellSize={16} gap={3} dayLabelWidth={22} fontSize={11}
            />
            {legend(16)}
          </div>
        </div>
      )}
    </>
  );
}
