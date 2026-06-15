'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface InsightRecord {
  insight: string;
  generatedAt: string;
  weekLabel: string;
  stats: {
    workouts: number;
    sessions: number;
    runs: number;
    activities: number;
  };
}

const CACHE_KEY = 'aiInsightsHistory';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function readHistory(): InsightRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
  } catch { return []; }
}

function saveHistory(records: InsightRecord[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(records.slice(0, 10)));
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

function canRefresh(records: InsightRecord[]): boolean {
  if (records.length === 0) return true;
  return Date.now() - new Date(records[0].generatedAt).getTime() > CACHE_TTL_MS;
}

export default function InsightyPage() {
  const { isLoggedIn } = useAuth();
  const [history, setHistory] = useState<InsightRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const h = readHistory();
    setHistory(h);
    if (h.length > 0) setExpanded(h[0].generatedAt);
  }, []);

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ai/insights', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Błąd generowania');
        return;
      }
      const record: InsightRecord = data;
      const updated = [record, ...history];
      setHistory(updated);
      saveHistory(updated);
      setExpanded(record.generatedAt);
    } catch {
      setError('Błąd połączenia');
    } finally {
      setLoading(false);
    }
  };

  const latest = history[0];
  const refreshAllowed = canRefresh(history);
  const nextRefreshIn = latest
    ? Math.max(0, Math.ceil((CACHE_TTL_MS - (Date.now() - new Date(latest.generatedAt).getTime())) / 3600000))
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
        <h1 className="text-xl font-bold text-gray-900">✨ AI Insighty</h1>
        <p className="text-sm text-gray-500">Analiza Twoich treningów przez AI</p>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Przycisk generowania */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-sm text-gray-600 mb-3">
            AI analizuje Twoje treningi, biegi i aktywności z ostatnich 2 tygodni i daje konkretne wskazówki.
          </p>

          {error && (
            <div className="bg-red-50 text-red-700 rounded-xl px-3 py-2 text-sm mb-3">
              {error}
            </div>
          )}

          <button
            onClick={generate}
            disabled={loading || !refreshAllowed}
            className="w-full bg-violet-600 text-white py-4 rounded-2xl font-bold text-base disabled:opacity-50 transition-opacity"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span> Analizuję...
              </span>
            ) : refreshAllowed ? (
              '✨ Generuj analizę tygodnia'
            ) : (
              `✨ Odśwież za ${nextRefreshIn}h`
            )}
          </button>

          {!refreshAllowed && (
            <p className="text-xs text-gray-400 text-center mt-2">
              Analiza generowana max raz na 24h — nie marnujemy API
            </p>
          )}
        </div>

        {/* Najnowszy insight */}
        {latest && (
          <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-sm font-bold text-violet-800">Tydzień {latest.weekLabel}</span>
                <span className="text-xs text-violet-500 ml-2">{timeAgo(latest.generatedAt)}</span>
              </div>
              <div className="flex gap-2 text-xs text-violet-600">
                {latest.stats.sessions > 0 && <span>💪 {latest.stats.sessions}</span>}
                {latest.stats.runs > 0 && <span>🏃 {latest.stats.runs}</span>}
                {latest.stats.activities > 0 && <span>🚴 {latest.stats.activities}</span>}
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
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-800">Tydzień {record.weekLabel}</span>
                      <span className="text-xs text-gray-400 ml-2">{timeAgo(record.generatedAt)}</span>
                    </div>
                    <span className="text-gray-400 text-sm">{expanded === record.generatedAt ? '▲' : '▼'}</span>
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
            <p className="text-4xl mb-2">🤖</p>
            <p className="font-medium text-gray-700 mb-1">Brak analiz</p>
            <p className="text-sm text-gray-400">Kliknij przycisk powyżej, żeby wygenerować pierwszą analizę</p>
          </div>
        )}
      </div>
    </div>
  );
}
