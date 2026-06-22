'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatDate, formatDateInput } from '@/lib/utils';
import { Toast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/hooks/useAuth';

interface OtherActivity {
  id: string;
  date: string;
  type: string;
  durationMin: number;
  distanceKm: number | null;
  kcal: number | null;
  notes: string | null;
  sessionId: string | null;
  user: { id: string; name: string };
}

interface DaySession {
  id: string;
  date: string;
  notes: string | null;
  entries: { exercise?: { muscleGroup?: string | null; name?: string } | null }[];
}

const PRESET_TYPES = [
  '🚴 Rower', '🏊 Pływanie', '🛶 Kajak', '🏔️ Trekking', '🧘 Joga',
  '⛷️ Narty', '🏸 Badminton', '⚽ Piłka nożna', '🎾 Tenis', '🏄 Rolki',
];

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export default function AktywnosPage() {
  const { isLoggedIn, userId } = useAuth();
  const [activities, setActivities] = useState<OtherActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // Łączenie z treningiem
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [daySessions, setDaySessions] = useState<DaySession[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);

  // Formularz
  const [date, setDate] = useState(formatDateInput(new Date()));
  const [type, setType] = useState('');
  const [customType, setCustomType] = useState('');
  const [durationH, setDurationH] = useState<number | ''>('');
  const [durationM, setDurationM] = useState<number | ''>(30);
  const [distanceKm, setDistanceKm] = useState<number | ''>('');
  const [kcal, setKcal] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetch('/api/activities').then(r => r.json()).catch(() => []);
    setActivities(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { if (isLoggedIn) load(); else setLoading(false); }, [isLoggedIn, load]);

  const totalMinutes = (Number(durationH) || 0) * 60 + (Number(durationM) || 0);
  const activeType = type === '__custom' ? customType.trim() : type;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeType) { setToast({ message: 'Wybierz lub wpisz typ aktywności', type: 'error' }); return; }
    if (totalMinutes <= 0) { setToast({ message: 'Podaj czas trwania', type: 'error' }); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          type: activeType,
          durationMin: totalMinutes,
          distanceKm: distanceKm || null,
          kcal: kcal || null,
          notes: notes.trim() || null,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setActivities(prev => [created, ...prev]);
        setToast({ message: 'Aktywność zapisana!', type: 'success' });
        // Reset
        setDate(formatDateInput(new Date()));
        setType(''); setCustomType('');
        setDurationH(''); setDurationM(30);
        setDistanceKm(''); setKcal(''); setNotes('');
        setShowForm(false);
      } else {
        const err = await res.json().catch(() => ({}));
        setToast({ message: err.error || 'Błąd zapisu', type: 'error' });
      }
    } catch {
      setToast({ message: 'Błąd połączenia', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Otwórz wybór treningu z tego dnia dla danej aktywności
  const openLink = async (a: OtherActivity) => {
    if (linkingId === a.id) { setLinkingId(null); return; }
    setLinkingId(a.id);
    setDaySessions([]);
    setLoadingDay(true);
    const day = a.date.slice(0, 10);
    const data = await fetch(`/api/sessions?date=${day}`).then(r => r.json()).catch(() => []);
    setDaySessions(Array.isArray(data) ? data : []);
    setLoadingDay(false);
  };

  const linkTo = async (activityId: string, sessionId: string | null) => {
    const res = await fetch(`/api/activities/${activityId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    if (res.ok) {
      setActivities(prev => prev.map(a => a.id === activityId ? { ...a, sessionId } : a));
      setToast({ message: sessionId ? 'Podłączono do treningu' : 'Odpięto od treningu', type: 'success' });
      setLinkingId(null);
    } else {
      const err = await res.json().catch(() => ({}));
      setToast({ message: err.error || 'Błąd łączenia', type: 'error' });
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/activities/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setActivities(prev => prev.filter(a => a.id !== id));
      setToast({ message: 'Usunięto', type: 'success' });
    } else {
      setToast({ message: 'Błąd usuwania', type: 'error' });
    }
    setConfirmDelete(null);
  };

  // Statystyki
  const thisWeekStart = (() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  })();
  const weekActivities = activities.filter(a => new Date(a.date) >= thisWeekStart);
  const totalKcal = activities.filter(a => a.kcal).reduce((s, a) => s + (a.kcal || 0), 0);

  if (!isLoggedIn && isLoggedIn !== null) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">Zaloguj się</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {confirmDelete && (
        <ConfirmDialog
          isOpen={true}
          message="Usunąć tę aktywność?"
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-900">Inne aktywności</h1>
        <p className="text-sm text-gray-500">Rower, pływanie, kajak i inne</p>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Statystyki */}
        {!loading && activities.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
              <div className="text-2xl font-bold text-blue-600">{activities.length}</div>
              <div className="text-xs text-gray-600 mt-0.5">Łącznie</div>
            </div>
            <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
              <div className="text-2xl font-bold text-orange-500">{weekActivities.length}</div>
              <div className="text-xs text-gray-600 mt-0.5">Ten tydzień</div>
            </div>
            <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
              <div className="text-2xl font-bold text-red-500">{totalKcal > 0 ? `${Math.round(totalKcal / 1000)}k` : '—'}</div>
              <div className="text-xs text-gray-600 mt-0.5">kcal łącznie</div>
            </div>
          </div>
        )}

        {/* Przycisk + formularz */}
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="w-full bg-blue-600 text-white text-center py-4 rounded-2xl font-semibold text-lg shadow-sm"
          >
            + Dodaj aktywność
          </button>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">Nowa aktywność</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 text-xl">✕</button>
            </div>

            {/* Typ aktywności */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Typ aktywności</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {PRESET_TYPES.map(t => (
                  <button
                    key={t} type="button"
                    onClick={() => { setType(t); setCustomType(''); }}
                    className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                      type === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'
                    }`}
                  >
                    {t}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setType('__custom')}
                  className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                    type === '__custom' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  ✏️ Inne
                </button>
              </div>
              {type === '__custom' && (
                <input
                  type="text"
                  value={customType}
                  onChange={e => setCustomType(e.target.value)}
                  placeholder="Wpisz nazwę aktywności..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  autoFocus
                />
              )}
            </div>

            {/* Data */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base text-gray-900" required />
            </div>

            {/* Czas trwania */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Czas trwania</label>
              <div className="flex items-center gap-2">
                <input type="number" min="0" max="24" inputMode="numeric"
                  value={durationH} onChange={e => setDurationH(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  className="w-20 border border-gray-200 rounded-xl px-3 py-2.5 text-base text-center" />
                <span className="text-sm text-gray-500">h</span>
                <input type="number" min="0" max="59" inputMode="numeric"
                  value={durationM} onChange={e => setDurationM(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  className="w-20 border border-gray-200 rounded-xl px-3 py-2.5 text-base text-center" />
                <span className="text-sm text-gray-500">min</span>
                {totalMinutes > 0 && (
                  <span className="text-sm text-blue-600 font-medium">{formatDuration(totalMinutes)}</span>
                )}
              </div>
            </div>

            {/* Dystans + kcal */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dystans km <span className="text-gray-400">(opcjonalnie)</span></label>
                <input type="number" min="0" step="0.1" inputMode="decimal"
                  value={distanceKm} onChange={e => setDistanceKm(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="np. 25"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base text-center" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kcal <span className="text-gray-400">(opcjonalnie)</span></label>
                <input type="number" min="0" step="10" inputMode="numeric"
                  value={kcal} onChange={e => setKcal(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="np. 600"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base text-center" />
              </div>
            </div>

            {/* Notatki */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notatki <span className="text-gray-400">(opcjonalnie)</span></label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="np. trasa nad jeziorem, świetna pogoda..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>

            <button type="submit" disabled={saving || !activeType || totalMinutes <= 0}
              className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-base disabled:opacity-50">
              {saving ? 'Zapisuję...' : 'Zapisz aktywność'}
            </button>
          </form>
        )}

        {/* Lista aktywności */}
        {loading ? (
          <div className="text-center py-8 text-gray-500">Ładowanie...</div>
        ) : activities.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <p className="text-4xl mb-2">🚴</p>
            <p className="font-medium text-gray-700 mb-1">Brak aktywności</p>
            <p className="text-sm text-gray-400">Dodaj pierwszą — rower, pływanie, kajak...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activities.map(a => {
              const mine = a.user.id === userId;
              return (
                <div key={a.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900">{a.type}</span>
                        <span className="text-sm text-gray-500">{formatDate(a.date)}</span>
                        {!mine && (
                          <span className="text-xs bg-purple-100 text-purple-700 rounded-lg px-2 py-0.5 font-semibold">
                            {a.user.name}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-sm text-gray-600">
                        <span>⏱ {formatDuration(a.durationMin)}</span>
                        {a.distanceKm && <span>📍 {a.distanceKm} km</span>}
                        {a.kcal && <span className="text-red-500">🔥 {a.kcal} kcal</span>}
                      </div>
                      {a.notes && <p className="text-sm text-gray-500 italic mt-1">{a.notes}</p>}
                    </div>
                    {mine && (
                      <button
                        onClick={() => setConfirmDelete(a.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1 shrink-0"
                        title="Usuń"
                      >🗑️</button>
                    )}
                  </div>

                  {/* Podłączenie do treningu z tego dnia */}
                  {mine && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      {a.sessionId ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-blue-700 bg-blue-50 rounded-lg px-2 py-1">🔗 Podłączona do treningu</span>
                          <button onClick={() => linkTo(a.id, null)} className="text-xs text-gray-500 underline">Odepnij</button>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => openLink(a)} className="text-xs font-semibold text-blue-600">
                            🔗 {linkingId === a.id ? 'Anuluj' : 'Podłącz do treningu'}
                          </button>
                          {linkingId === a.id && (
                            <div className="mt-2 space-y-1.5">
                              {loadingDay ? (
                                <p className="text-xs text-gray-400">Szukam treningów z tego dnia...</p>
                              ) : daySessions.length === 0 ? (
                                <p className="text-xs text-gray-400">Brak treningu w tym dniu — najpierw dodaj trening.</p>
                              ) : (
                                daySessions.map(s => {
                                  const muscles = [...new Set(s.entries.map(e => (e.exercise?.muscleGroup || '').replace(/\s*\(.*?\)/g, '').trim()).filter(Boolean))];
                                  const label = muscles.length ? muscles.join(', ') : `${s.entries.length} ćwiczeń`;
                                  return (
                                    <button key={s.id} onClick={() => linkTo(a.id, s.id)}
                                      className="w-full text-left text-sm bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-xl px-3 py-2 transition-colors">
                                      🏋️ Trening · {label}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
