'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Sparkles, Loader2, Dumbbell, PersonStanding, Bike, ChevronUp, ChevronDown, Bot } from 'lucide-react';

type Period = 'week' | 'month';

interface InsightRecord {
  insight: string;
  generatedAt: string;
  period: Period;
  periodLabel: string;
  stats: {
    workouts: number;
    sessions: number;
    runs: number;
    activities: number;
  };
}

const CACHE_KEY = 'aiInsightsHistory_v3';
const TTL_MS: Record<Period, number> = {
  week: 24 * 60 * 60 * 1000, // 24h
  month: 7 * 24 * 60 * 60 * 1000, // 7 dni
};

function readHistory(): InsightRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
    // Migracja ze starszego formatu bez pola period — traktuj jako 'week'.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (Array.isArray(raw) ? raw : []).map((r: any) => ({ period: 'week', ...r } as InsightRecord));
  } catch { return []; }
}

function saveHistory(records: InsightRecord[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(records.slice(0, 20)));
  } catch {}
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'przed chwilą';
  if (h < 24) return `${h}h temu`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? 'dzień' : 'dni'} temu`;
}

function canRefresh(records: InsightRecord[], period: Period): boolean {
  if (records.length === 0) return true;
  return Date.now() - new Date(records[0].generatedAt).getTime() > TTL_MS[period];
}

export default function InsightyPage() {
  const { isLoggedIn } = useAuth();
  const [allHistory, setAllHistory] = useState<InsightRecord[]>([]);
  const [period, setPeriod] = useState<Period>('week');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const h = readHistory();
    setAllHistory(h);
    const firstOfPeriod = h.find(r => r.period === period);
    if (firstOfPeriod) setExpanded(firstOfPeriod.generatedAt);
  }, []);

  const history = allHistory.filter(r => r.period === period);

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ai/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Błąd generowania');
        return;
      }
      const record: InsightRecord = data;
      const updated = [record, ...allHistory];
      setAllHistory(updated);
      saveHistory(updated);
      setExpanded(record.generatedAt);
    } catch {
      setError('Błąd połączenia');
    } finally {
      setLoading(false);
    }
  };

  const latest = history[0];
  const refreshAllowed = canRefresh(history, period);
  const nextRefreshIn = latest
    ? Math.max(0, Math.ceil((TTL_MS[period] - (Date.now() - new Date(latest.generatedAt).getTime())) / 3600000))
    : 0;

  if (isLoggedIn === false) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">
        Zaloguj się
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Sparkles className="w-5 h-5 text-violet-600" strokeWidth={2} /> AI Insighty</h1>
        <p className="text-sm text-gray-500">Analiza Twoich treningów przez AI</p>
      </div>

      <div className="px-4 py-4 space-y-4 md:max-w-3xl lg:max-w-4xl md:mx-auto">
        {/* Przełącznik okresu */}
        <div className="flex bg-gray-100 rounded-2xl p-1 gap-1">
          {(['week', 'month'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                period === p ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p === 'week' ? 'Tydzień' : 'Miesiąc'}
            </button>
          ))}
        </div>

        {/* Przycisk generowania */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-sm text-gray-600 mb-3">
            {period === 'week'
              ? 'AI analizuje Twoje treningi, biegi i aktywności z ostatnich 2 tygodni i daje konkretne wskazówki.'
              : 'AI analizuje trend z ostatnich 2 miesięcy (długoterminowa regularność, plateau, kierunek zmian) i daje rekomendację na kolejny miesiąc.'}
          </p>

          {error && (
            <div className="bg-red-50 text-red-700 rounded-xl px-3 py-2 text-sm mb-3">
              {error}
            </div>
          )}

          <button
            onClick={generate}
            disabled={loading || !refreshAllowed}
            className="w-full bg-violet-600 text-white py-4 rounded-2xl font-bold text-base disabled:opacity-50 transition-colors hover:bg-violet-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} /> Analizuję...
              </span>
            ) : refreshAllowed ? (
              <span className="flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4" strokeWidth={2} /> Generuj analizę {period === 'week' ? 'tygodnia' : 'miesiąca'}
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4" strokeWidth={2} /> Odśwież za {nextRefreshIn >= 24 ? `${Math.ceil(nextRefreshIn / 24)} dni` : `${nextRefreshIn}h`}
              </span>
            )}
          </button>

          {!refreshAllowed && (
            <p className="text-xs text-gray-400 text-center mt-2">
              Analiza {period === 'week' ? 'tygodnia' : 'miesiąca'} generowana max raz na {period === 'week' ? '24h' : '7 dni'} — nie marnujemy API
            </p>
          )}
        </div>

        {/* Najnowszy insight */}
        {latest && (
          <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-sm font-bold text-violet-800">{period === 'week' ? 'Tydzień' : 'Miesiąc'} {latest.periodLabel}</span>
                <span className="text-xs text-violet-500 ml-2">{timeAgo(latest.generatedAt)}</span>
              </div>
              <div className="flex gap-2 text-xs text-violet-600">
                {latest.stats.sessions > 0 && <span className="flex items-center gap-1"><Dumbbell className="w-3.5 h-3.5" strokeWidth={2} /> {latest.stats.sessions}</span>}
                {latest.stats.runs > 0 && <span className="flex items-center gap-1"><PersonStanding className="w-3.5 h-3.5" strokeWidth={2} /> {latest.stats.runs}</span>}
                {latest.stats.activities > 0 && <span className="flex items-center gap-1"><Bike className="w-3.5 h-3.5" strokeWidth={2} /> {latest.stats.activities}</span>}
              </div>
            </div>
            <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {latest.insight}
            </div>
          </div>
        )}

        {/* Historia */}
        {history.length > 1 && (
          <div>
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">
              Poprzednie analizy
            </h2>
            <div className="space-y-2">
              {history.slice(1).map(record => (
                <div key={record.generatedAt} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <button
                    onClick={() => setExpanded(expanded === record.generatedAt ? null : record.generatedAt)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-800">{record.period === 'week' ? 'Tydzień' : 'Miesiąc'} {record.periodLabel}</span>
                      <span className="text-xs text-gray-400 ml-2">{timeAgo(record.generatedAt)}</span>
                    </div>
                    {expanded === record.generatedAt ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" strokeWidth={2} />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" strokeWidth={2} />
                    )}
                  </button>
                  {expanded === record.generatedAt && (
                    <div className="px-4 pb-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed border-t border-gray-100 pt-3">
                      {record.insight}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {history.length === 0 && !loading && (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <Bot className="w-8 h-8 mx-auto mb-2 text-gray-400" strokeWidth={2} />
            <p className="font-medium text-gray-700 mb-1">Brak analiz</p>
            <p className="text-sm text-gray-400">Kliknij przycisk powyżej, żeby wygenerować pierwszą analizę</p>
          </div>
        )}
      </div>
    </div>
  );
}
